#!/usr/bin/env bash
# Avvia un Cloudflare Quick Tunnel verso il server locale, individua
# l'indirizzo pubblico generato (cambia ad ogni riavvio) e lo pubblica su un
# Gist GitHub pubblico (vedi publish-gist.js), così il client su GitHub
# Pages può scoprirlo da solo. Pensato per girare come servizio systemd
# (the-judgement-tunnel.service), con riavvio automatico.
#
# Uso manuale (debug): bash kitab/cloudflare-tunnel.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[tunnel] cloudflared non trovato. Installalo con:"
  echo "[tunnel]   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb"
  echo "[tunnel]   sudo dpkg -i /tmp/cloudflared.deb"
  exit 1
fi

LAST_URL=""

echo "[tunnel] Avvio il Cloudflare Tunnel verso http://localhost:${PORT} ..."

# cloudflared scrive i suoi log su stderr; li leggiamo riga per riga (senza
# bufferizzare, stdbuf -oL -eL) per individuare l'indirizzo generato non
# appena compare.
stdbuf -oL -eL cloudflared tunnel --url "http://localhost:${PORT}" 2>&1 | while IFS= read -r line; do
  echo "[tunnel] $line"
  URL="$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' || true)"
  if [ -n "$URL" ] && [ "$URL" != "$LAST_URL" ]; then
    LAST_URL="$URL"
    echo "[tunnel] Nuovo indirizzo rilevato: $URL"
    node "$SCRIPT_DIR/publish-gist.js" "$URL"
  fi
done
