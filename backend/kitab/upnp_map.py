#!/usr/bin/env python3
"""
Mappa automaticamente la porta del server "The Judgement" sul router via
UPnP, usando le binding Python di miniupnpc (pacchetto Debian
python3-miniupnpc). Richiamato da kitab/upnp-map.sh ad ogni avvio del
servizio.

Uso:
    python3 upnp_map.py <PORTA> [TCP|UDP]

Non solleva mai un errore bloccante verso il chiamante: stampa un messaggio
chiaro ed esce con codice 0 se il router non supporta UPnP o non è
raggiungibile, così il server puo' comunque partire (resta raggiungibile in
LAN e apribile con un port forwarding manuale).
"""

import sys

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 upnp_map.py <PORTA> [TCP|UDP]")
        sys.exit(0)

    port = int(sys.argv[1])
    proto = sys.argv[2].upper() if len(sys.argv) > 2 else "TCP"

    try:
        import miniupnpc
    except ImportError:
        print("[upnp] modulo python3-miniupnpc non installato, salto la mappatura automatica.")
        print("[upnp] installa con: sudo apt install -y python3-miniupnpc")
        sys.exit(0)

    try:
        upnp = miniupnpc.UPnP()
        upnp.discoverdelay = 200
        print("[upnp] Ricerca dispositivi UPnP sulla rete...")
        devices = upnp.discover()
        if devices == 0:
            print("[upnp] Nessun dispositivo UPnP trovato: il router potrebbe avere UPnP disabilitato.")
            print("[upnp] Il server resta comunque raggiungibile in LAN; apri la porta a mano se serve accesso da internet.")
            sys.exit(0)

        upnp.selectigd()
        local_ip = upnp.lanaddr
        try:
            external_ip = upnp.externalipaddress()
        except Exception:
            external_ip = "sconosciuto"

        print(f"[upnp] IP locale: {local_ip}")
        print(f"[upnp] IP pubblico: {external_ip}")

        result = upnp.addportmapping(
            port,                    # porta esterna
            proto,                   # 'TCP' o 'UDP'
            local_ip,                # IP locale del server
            port,                    # porta interna
            "The Judgement",         # descrizione
            "",
        )

        if result:
            print(f"[upnp] Porta {port}/{proto} aperta con successo su {external_ip}:{port}")
        else:
            print(f"[upnp] Impossibile aprire la porta {port}/{proto} (il router ha rifiutato la richiesta).")

    except Exception as e:
        print(f"[upnp] Errore durante la mappatura UPnP: {e}")
        print("[upnp] Il server resta comunque raggiungibile in LAN.")
        sys.exit(0)


if __name__ == "__main__":
    main()
