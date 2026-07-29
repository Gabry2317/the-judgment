#!/usr/bin/env bash
# ============================================================================
#  Kitab — installer automatico del server "The Judgement" per Debian
# ============================================================================
#
# Uso:
#   sudo bash kitab.sh install     Installa/configura tutto da zero
#   sudo bash kitab.sh update      Aggiorna il codice e riavvia il servizio
#   sudo bash kitab.sh uninstall   Rimuove servizio, regole firewall, mapping
#   bash kitab.sh status           Mostra lo stato del servizio
#
# Variabili d'ambiente opzionali per un'installazione non interattiva
# (utile per script/CI):
#   KITAB_NONINTERACTIVE=1
#   KITAB_PORT=3000
#   KITAB_GROQ_API_KEY=...
#   KITAB_GROQ_MODEL=llama-3.3-70b-versatile
#   KITAB_ALLOWED_ORIGIN=https://tuonome.github.io
#   KITAB_INSTALL_DIR=/opt/the-judgement-server
#
# Kitab NON richiede configurazioni manuali del router: prova ad aprire la
# porta automaticamente via UPnP (upnpc/miniupnpc) ad ogni avvio del
# servizio. Se il router non supporta UPnP, il server resta comunque
# raggiungibile in LAN e può essere esposto con un port forwarding manuale.
#
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config di base
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"   # cartella backend (con server.js, package.json, ecc.)

INSTALL_DIR="${KITAB_INSTALL_DIR:-/opt/the-judgement-server}"
SERVICE_NAME="the-judgement"
SERVICE_USER="judgement"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
TUNNEL_SERVICE_NAME="the-judgement-tunnel"
TUNNEL_SERVICE_FILE="/etc/systemd/system/${TUNNEL_SERVICE_NAME}.service"
NONINTERACTIVE="${KITAB_NONINTERACTIVE:-0}"

log()  { echo -e "[kitab] $*"; }
warn() { echo -e "[kitab] ATTENZIONE: $*" >&2; }
die()  { echo -e "[kitab] ERRORE: $*" >&2; exit 1; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "questo comando richiede i permessi di root. Rilancia con: sudo bash kitab.sh $*"
  fi
}

detect_os() {
  if [ ! -f /etc/os-release ]; then
    warn "impossibile rilevare la distribuzione (manca /etc/os-release). Proseguo comunque."
    return
  fi
  . /etc/os-release
  case "${ID:-}" in
    debian) log "Distribuzione rilevata: Debian ${VERSION_ID:-}" ;;
    ubuntu) log "Distribuzione rilevata: Ubuntu ${VERSION_ID:-} (compatibile con Debian, procedo)" ;;
    *) warn "distribuzione '${ID:-sconosciuta}' non testata ufficialmente. Kitab è pensato per Debian." ;;
  esac
}

# ---------------------------------------------------------------------------
# install
# ---------------------------------------------------------------------------

install_dependencies() {
  log "Aggiorno l'elenco pacchetti e installo le dipendenze di sistema..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git ufw rsync python3 python3-miniupnpc

  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
    log "Installo Node.js LTS tramite NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
  else
    log "Node.js già presente: $(node -v)"
  fi
}

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    log "cloudflared già presente: $(cloudflared --version 2>&1 | head -n1)"
    return
  fi
  log "Installo cloudflared (per l'accesso da internet senza aprire porte sul router)..."
  local tmp_deb
  tmp_deb="$(mktemp --suffix=.deb)"
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o "$tmp_deb"
  dpkg -i "$tmp_deb" || apt-get install -f -y
  rm -f "$tmp_deb"
}

create_service_user() {
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creo l'utente di sistema '$SERVICE_USER' (senza login, senza home)..."
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  else
    log "L'utente '$SERVICE_USER' esiste già."
  fi
}

sync_project_files() {
  log "Copio i file del server in $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.git' \
    "$PROJECT_SOURCE_DIR"/ "$INSTALL_DIR"/
}

install_npm_dependencies() {
  log "Installo le dipendenze npm (solo produzione)..."
  (cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund)
}

prompt() {
  # prompt <variabile> <domanda> <default>
  local __var="$1" __question="$2" __default="$3" __answer
  if [ "$NONINTERACTIVE" = "1" ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  read -r -p "[kitab] $__question [$__default]: " __answer || true
  printf -v "$__var" '%s' "${__answer:-$__default}"
}

write_env_file() {
  local env_path="$INSTALL_DIR/.env"
  ENABLE_TUNNEL=0
  if [ -f "$TUNNEL_SERVICE_FILE" ]; then
    ENABLE_TUNNEL=1 # tunnel già configurato in un'installazione precedente
  fi
  if [ -f "$env_path" ]; then
    log "Trovato .env esistente in $INSTALL_DIR, lo mantengo (cancellalo per riconfigurare da zero)."
    return
  fi

  log "Configurazione del server (premi invio per accettare i valori proposti)."
  local port groq_key groq_model origin

  prompt port "Porta del server" "${KITAB_PORT:-3000}"
  prompt groq_model "Modello Groq per il giudice AI" "${KITAB_GROQ_MODEL:-llama-3.3-70b-versatile}"
  prompt origin "Origine consentita (URL GitHub Pages, o * per test)" "${KITAB_ALLOWED_ORIGIN:-*}"

  if [ -n "${KITAB_GROQ_API_KEY:-}" ]; then
    groq_key="$KITAB_GROQ_API_KEY"
  elif [ "$NONINTERACTIVE" = "1" ]; then
    groq_key=""
    warn "nessuna GROQ_API_KEY fornita: il giudice AI userà verdetti di fallback finché non la imposti in $env_path"
  else
    read -r -p "[kitab] Chiave API Groq (https://console.groq.com/keys), lascia vuoto per configurarla dopo: " groq_key || true
  fi

  cat > "$env_path" <<EOF
PORT=${port}
GROQ_API_KEY=${groq_key}
GROQ_MODEL=${groq_model}
ALLOWED_ORIGIN=${origin}
MAX_PLAYERS_PER_LOBBY=12
MIN_PLAYERS_FOR_TRIAL=2
EOF

  # --- Cloudflare Tunnel (accesso da internet senza router/UPnP) -----------
  local enable_tunnel
  prompt enable_tunnel "Attivare l'accesso da internet via Cloudflare Tunnel? (s/n)" "${KITAB_ENABLE_TUNNEL:-s}"
  ENABLE_TUNNEL=0
  case "$enable_tunnel" in
    s|S|si|Si|SI|y|Y|yes) ENABLE_TUNNEL=1 ;;
  esac

  if [ "$ENABLE_TUNNEL" = "1" ]; then
    local want_gist gist_id gist_token gist_filename
    log "Il tunnel genera un indirizzo pubblico casuale ad ogni avvio (tipo https://xxxx.trycloudflare.com)."
    prompt want_gist "Vuoi pubblicarlo automaticamente su un Gist GitHub, così il client lo scopre da solo? (s/n) — richiede un Gist e un token già creati, vedi kitab/README.md" "${KITAB_ENABLE_GIST:-n}"
    case "$want_gist" in
      s|S|si|Si|SI|y|Y|yes)
        prompt gist_id "ID del Gist" "${KITAB_GIST_ID:-}"
        if [ -n "${KITAB_GIST_TOKEN:-}" ]; then
          gist_token="$KITAB_GIST_TOKEN"
        elif [ "$NONINTERACTIVE" = "1" ]; then
          gist_token=""
        else
          read -r -s -p "[kitab] Personal Access Token GitHub (scope 'gist'): " gist_token; echo
        fi
        prompt gist_filename "Nome del file dentro il Gist" "${KITAB_GIST_FILENAME:-judgement-server.json}"
        {
          echo "CLOUDFLARE_GIST_ID=${gist_id}"
          echo "CLOUDFLARE_GIST_TOKEN=${gist_token}"
          echo "CLOUDFLARE_GIST_FILENAME=${gist_filename}"
        } >> "$env_path"
        ;;
      *)
        log "Ok, il tunnel partirà comunque: l'indirizzo generato comparirà nei log (journalctl -u ${TUNNEL_SERVICE_NAME} -f) da incollare a mano nel client."
        ;;
    esac
  fi

  chmod 600 "$env_path"
  log "File .env creato in $env_path"
}

configure_firewall() {
  local port
  port="$(grep -E '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2)"
  port="${port:-3000}"

  log "Configuro UFW: consento SSH e la porta $port/tcp..."
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow "${port}/tcp" >/dev/null 2>&1 || true

  if ufw status | grep -q "Status: active"; then
    log "UFW è già attivo."
  else
    log "Attivo UFW (SSH resta consentito per non perdere l'accesso remoto)..."
    ufw --force enable
  fi
}

install_systemd_service() {
  log "Installo il servizio systemd '${SERVICE_NAME}'..."
  sed \
    -e "s#__SERVICE_USER__#${SERVICE_USER}#g" \
    -e "s#__INSTALL_DIR__#${INSTALL_DIR}#g" \
    "$INSTALL_DIR/kitab/systemd/the-judgement.service.template" > "$SERVICE_FILE"

  chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
  chmod +x "$INSTALL_DIR/kitab/upnp-map.sh" && chmod +x "$INSTALL_DIR/kitab/upnp_map.py" 2>/dev/null || true

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

install_tunnel_service() {
  if [ "${ENABLE_TUNNEL:-0}" != "1" ]; then
    log "Cloudflare Tunnel non attivato (puoi abilitarlo in seguito cancellando .env e rieseguendo 'install')."
    return
  fi
  log "Installo il servizio systemd '${TUNNEL_SERVICE_NAME}'..."
  chmod +x "$INSTALL_DIR/kitab/cloudflare-tunnel.sh"
  sed \
    -e "s#__SERVICE_USER__#${SERVICE_USER}#g" \
    -e "s#__INSTALL_DIR__#${INSTALL_DIR}#g" \
    "$INSTALL_DIR/kitab/systemd/the-judgement-tunnel.service.template" > "$TUNNEL_SERVICE_FILE"

  systemctl daemon-reload
  systemctl enable "$TUNNEL_SERVICE_NAME"
  systemctl restart "$TUNNEL_SERVICE_NAME"
}

run_upnp_now() {
  log "Provo subito una mappatura UPnP (verrà ritentata automaticamente ad ogni avvio)..."
  bash "$INSTALL_DIR/kitab/upnp-map.sh" || true
}

print_summary() {
  local port local_ip
  port="$(grep -E '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2)"
  local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  echo
  log "==================================================================="
  log " Installazione completata!"
  log "==================================================================="
  log " Indirizzo locale (LAN):   http://${local_ip}:${port}"
  log " Salute del server:        http://${local_ip}:${port}/health"
  log

  if [ "${ENABLE_TUNNEL:-0}" = "1" ]; then
    log " Cloudflare Tunnel attivo. Per vedere l'indirizzo pubblico generato:"
    log "   sudo journalctl -u ${TUNNEL_SERVICE_NAME} -f"
    if grep -q '^CLOUDFLARE_GIST_ID=' "$INSTALL_DIR/.env" 2>/dev/null && [ -n "$(grep '^CLOUDFLARE_GIST_ID=' "$INSTALL_DIR/.env" | cut -d= -f2)" ]; then
      log " L'indirizzo viene pubblicato automaticamente sul tuo Gist: il client"
      log " lo scopre da solo, non devi incollare nulla a mano."
    else
      log " Copia l'indirizzo (tipo https://xxxx.trycloudflare.com) dal log qui"
      log " sopra e incollalo nel campo 'server' del client su GitHub Pages."
    fi
  else
    log " Nel client web (index.html / GitHub Pages), campo 'server', inserisci:"
    log "   - se giochi in LAN:  http://${local_ip}:${port}"
    log "   - se giochi da internet: http://<IP-PUBBLICO-O-DOMINIO>:${port}"
    log "     (l'IP pubblico è quello del tuo router; verificalo su un sito"
    log "      come 'whatismyip' oppure con: curl -4 ifconfig.me — se è nel"
    log "      blocco 100.64.0.0/10 sei dietro CG-NAT: UPnP/port forwarding"
    log "      non funzioneranno, ti serve un tunnel come Cloudflare)"
  fi
  log
  log " Comandi utili:"
  log "   sudo systemctl status ${SERVICE_NAME}          stato del server"
  log "   sudo journalctl -u ${SERVICE_NAME} -f          log del server"
  log "   sudo systemctl status ${TUNNEL_SERVICE_NAME}   stato del tunnel"
  log "   sudo journalctl -u ${TUNNEL_SERVICE_NAME} -f   log del tunnel"
  log "   sudo bash kitab.sh update                       aggiorna il server"
  log "   sudo bash kitab.sh uninstall                    disinstalla tutto"
  log "==================================================================="
}

cmd_install() {
  require_root
  detect_os
  install_dependencies
  install_cloudflared
  create_service_user
  sync_project_files
  install_npm_dependencies
  write_env_file
  configure_firewall
  install_systemd_service
  install_tunnel_service
  run_upnp_now
  print_summary
}

# ---------------------------------------------------------------------------
# update
# ---------------------------------------------------------------------------

cmd_update() {
  require_root
  [ -d "$INSTALL_DIR" ] || die "nessuna installazione trovata in $INSTALL_DIR. Esegui prima 'install'."

  log "Aggiorno i file del server (mantengo .env)..."
  sync_project_files
  install_npm_dependencies
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
  chmod +x "$INSTALL_DIR/kitab/upnp-map.sh" && chmod +x "$INSTALL_DIR/kitab/upnp_map.py" 2>/dev/null || true

  log "Riavvio il servizio..."
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  if [ -f "$TUNNEL_SERVICE_FILE" ]; then
    systemctl restart "$TUNNEL_SERVICE_NAME"
  fi
  log "Aggiornamento completato."
  systemctl --no-pager status "$SERVICE_NAME" || true
}

# ---------------------------------------------------------------------------
# uninstall
# ---------------------------------------------------------------------------

cmd_uninstall() {
  require_root
  if [ "$NONINTERACTIVE" != "1" ]; then
    read -r -p "[kitab] Confermi la disinstallazione completa (servizio, regola firewall, ${INSTALL_DIR})? [s/N]: " ans || true
    case "${ans:-}" in
      s|S|si|Si|SI|y|Y|yes) ;;
      *) log "Disinstallazione annullata."; exit 0 ;;
    esac
  fi

  log "Fermo e disabilito il servizio..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SERVICE_FILE"

  if [ -f "$TUNNEL_SERVICE_FILE" ]; then
    log "Fermo e disabilito il tunnel Cloudflare..."
    systemctl stop "$TUNNEL_SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$TUNNEL_SERVICE_NAME" 2>/dev/null || true
    rm -f "$TUNNEL_SERVICE_FILE"
  fi

  systemctl daemon-reload

  if [ -f "$INSTALL_DIR/.env" ]; then
    local port
    port="$(grep -E '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2)"
    if [ -n "${port:-}" ]; then
      log "Rimuovo la regola firewall per la porta ${port}..."
      ufw delete allow "${port}/tcp" >/dev/null 2>&1 || true
    fi
  fi

  log "Rimuovo $INSTALL_DIR ..."
  rm -rf "$INSTALL_DIR"

  log "Disinstallazione completata. L'utente di sistema '$SERVICE_USER' non è stato rimosso"
  log "(nessun dato sensibile associato); rimuovilo a mano con 'userdel $SERVICE_USER' se vuoi."
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

cmd_status() {
  if ! systemctl list-unit-files | grep -q "${SERVICE_NAME}.service"; then
    die "il servizio non risulta installato. Esegui: sudo bash kitab.sh install"
  fi
  systemctl --no-pager status "$SERVICE_NAME" || true
  echo
  if [ -f "$INSTALL_DIR/.env" ]; then
    local port
    port="$(grep -E '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2)"
    log "Provo l'healthcheck su http://localhost:${port}/health ..."
    curl -fsS "http://localhost:${port}/health" || warn "il server non risponde."
    echo
  fi
  [ -f /tmp/kitab-upnp.log ] && { log "Ultimo log UPnP:"; cat /tmp/kitab-upnp.log; }

  if systemctl list-unit-files | grep -q "${TUNNEL_SERVICE_NAME}.service"; then
    echo
    log "Stato del tunnel Cloudflare:"
    systemctl --no-pager status "$TUNNEL_SERVICE_NAME" || true
    log "Ultimo indirizzo generato (journalctl -u ${TUNNEL_SERVICE_NAME} -n 20):"
    journalctl -u "$TUNNEL_SERVICE_NAME" -n 20 --no-pager 2>/dev/null | grep -i "trycloudflare\|Nuovo indirizzo" || true
  fi
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

main() {
  local cmd="${1:-}"
  case "$cmd" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    *)
      echo "Uso: $0 {install|update|uninstall|status}"
      exit 1
      ;;
  esac
}

main "$@"
