#!/usr/bin/env bash
# Apre automaticamente la porta del server sul router via UPnP, usando le
# binding Python di miniupnpc (kitab/upnp_map.py), più affidabili del CLI
# upnpc su alcuni router. Richiamato da systemd come ExecStartPre, ma può
# anche essere lanciato a mano per debug:
#   bash kitab/upnp-map.sh
#
# Non fallisce mai in modo bloccante: se UPnP non è disponibile (router
# senza UPnP, UPnP disabilitato, doppio NAT, ecc.) stampa un avviso e
# lascia comunque partire il server, che resterà comunque raggiungibile
# in LAN e apribile manualmente con un port forwarding se necessario.

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

PYTHON_BIN="$(command -v python3 || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "[kitab] python3 non trovato: salto l'apertura automatica della porta $PORT."
  echo "[kitab] installa con: sudo apt install -y python3 python3-miniupnpc"
  exit 0
fi

echo "[kitab] Provo ad aprire la porta TCP $PORT via UPnP (python3-miniupnpc)..."
"$PYTHON_BIN" "$SCRIPT_DIR/upnp_map.py" "$PORT" TCP 2>&1 | tee /tmp/kitab-upnp.log

exit 0
