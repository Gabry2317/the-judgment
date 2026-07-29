# Kitab — installer del server "The Judgement" per Debian

Kitab automatizza tutta la configurazione del server Debian: non serve
toccare manualmente firewall o router.

## Requisiti

- Una macchina Debian (11/12) o Ubuntu, con accesso root (`sudo`).
- Una connessione internet in uscita (per installare i pacchetti e
  contattare le API Groq).
- Un router che supporta UPnP se vuoi l'apertura automatica della porta da
  internet (quasi tutti i router domestici lo supportano, spesso disattivato
  di default: vedi sotto).

## Installazione

```bash
cd the-judgement-server   # cartella del backend, quella con package.json
sudo bash kitab/kitab.sh install
```

Lo script chiederà (con valori proposti già sensati, basta premere invio):

- porta del server (default `3000`)
- modello Groq da usare per il giudice AI
- origine consentita per CORS (metti l'URL del tuo GitHub Pages)
- chiave API Groq (puoi lasciarla vuota e aggiungerla dopo in
  `/opt/the-judgement-server/.env`, poi `sudo bash kitab/kitab.sh update`)

Cosa fa, in ordine:

1. **Dipendenze** — `apt-get install` di Node.js (LTS via NodeSource),
   `ufw`, `python3-miniupnpc` (binding Python per UPnP), `rsync`, `git`.
2. **Utente dedicato** — crea l'utente di sistema `judgement` (senza login,
   senza home), così il server non gira come root.
3. **Copia dei file** — sincronizza il progetto in `/opt/the-judgement-server`
   (personalizzabile con `KITAB_INSTALL_DIR`).
4. **Dipendenze npm** — `npm install --omit=dev`.
5. **File `.env`** — generato dalle risposte date, permessi `600`.
6. **Firewall (UFW)** — consente sempre prima SSH (per non perdere l'accesso
   remoto), poi apre solo la porta scelta. Attiva UFW se non è già attivo.
7. **UPnP** — mappa automaticamente la porta sul router con le binding
   Python di `miniupnpc` (`kitab/upnp_map.py`), ripetuto ad ogni riavvio del
   servizio, così se il router rinnova il lease o riavvia, la porta si
   riapre da sola. Usiamo le binding Python invece del CLI `upnpc` perché
   più affidabili su alcuni modelli di router.
8. **Servizio systemd** — installa e avvia `the-judgement.service`, con
   riavvio automatico in caso di crash (`Restart=on-failure`).

Alla fine stampa l'indirizzo LAN del server e come inserirlo nel client.

## Se il router non supporta UPnP (o sei dietro CG-NAT)

Molti operatori italiani (soprattutto su fibra/FWA/alcune offerte mobili)
usano il **CG-NAT**: il tuo router non ha un vero IP pubblico, è condiviso
con altri clienti. In questo caso **né UPnP né il port forwarding manuale
possono funzionare**, qualunque cosa tu configuri sul router — il problema
non è lato tuo.

Per capire se è il tuo caso, confronta:
```bash
curl -4 ifconfig.me
```
con l'IP pubblico mostrato nel pannello di stato del router. Se sono
diversi, o se il tuo IP inizia con `100.64.` fino a `100.127.`, sei dietro
CG-NAT.

**Soluzione: Cloudflare Tunnel.** Kitab può attivarlo automaticamente
durante l'installazione (risposta "s" alla domanda "Attivare l'accesso da
internet via Cloudflare Tunnel?"). Vantaggi:
- Nessuna porta da aprire: bypassa completamente router/CG-NAT.
- HTTPS automatico — necessario perché GitHub Pages (https) non può parlare
  con un backend in `http://` semplice (i browser bloccano il "mixed
  content").
- Gira come servizio systemd (`the-judgement-tunnel`), si riavvia da solo.

L'unico limite: l'indirizzo generato (tipo
`https://parole-a-caso.trycloudflare.com`) **cambia ad ogni riavvio del
tunnel**, perché è un tunnel "quick" (senza account Cloudflare). Due modi
per gestirlo:

1. **A mano**: guardi l'indirizzo nei log (`sudo journalctl -u
   the-judgement-tunnel -f`) e lo incolli nel campo "server" del client.
2. **Automaticamente (consigliato)**: pubblicazione su un Gist GitHub
   pubblico, letto in automatico dal client via `SERVER_DISCOVERY_URL` in
   `client/js/config.js`. Setup (una tantum):

   1. Crea un Gist pubblico vuoto su https://gist.github.com — un file,
      nome a tua scelta (es. `judgement-server.json`), contenuto iniziale
      `{"url": ""}`. Salva e copia l'ID dalla URL del Gist
      (`https://gist.github.com/tuoutente/<QUESTO-È-L'ID>`).
   2. Crea un Personal Access Token su
      https://github.com/settings/tokens (tab "Tokens (classic)") con
      **solo** lo scope `gist`. Copialo (non lo rivedrai più).
   3. Durante `sudo bash kitab/kitab.sh install`, rispondi "s" quando chiede
      se pubblicare l'indirizzo su un Gist, e incolla ID e token.
   4. Nel client, in `client/js/config.js`, imposta:
      ```js
      SERVER_DISCOVERY_URL: 'https://gist.githubusercontent.com/tuoutente/<ID-GIST>/raw/judgement-server.json'
      ```
      (sostituisci `<ID-GIST>` e il nome file se diverso). Pubblica la
      modifica su GitHub Pages.

   Da questo momento, ogni volta che il tunnel genera un nuovo indirizzo,
   il server lo pubblica da solo sul Gist, e il client lo legge da solo
   all'avvio — non devi più copiare/incollare nulla.

   Nota: i "quick tunnel" di Cloudflare non hanno garanzie di uptime (lo
   dice lo stesso Cloudflare). Per un progetto serio a lungo termine, la
   soluzione più robusta resta un tunnel "nominato" con un dominio tuo
   (indirizzo fisso, mai da aggiornare) — chiedi pure se vuoi passare a
   quella strada in un secondo momento.

## Comandi

```bash
sudo bash kitab/kitab.sh install      # installazione/configurazione iniziale
sudo bash kitab/kitab.sh update       # aggiorna il codice e riavvia
sudo bash kitab/kitab.sh uninstall    # rimuove servizio, firewall, file
bash kitab/kitab.sh status            # stato del servizio + healthcheck
```

## Installazione non interattiva

Utile per script o VM automatizzate:

```bash
sudo KITAB_NONINTERACTIVE=1 \
     KITAB_PORT=3000 \
     KITAB_GROQ_API_KEY=gsk_xxx \
     KITAB_ALLOWED_ORIGIN=https://tuonome.github.io \
     bash kitab/kitab.sh install
```

## Sicurezza

- Il firewall UFW apre **solo** la porta del gioco e SSH: nessun'altra porta
  viene esposta.
- Il servizio gira con un utente non privilegiato dedicato.
- `.env` (con la chiave Groq) ha permessi `600`, leggibile solo da root e
  dall'utente `judgement`.
- Imposta sempre `ALLOWED_ORIGIN` sul dominio reale del tuo GitHub Pages in
  produzione: lasciarlo su `*` accetta connessioni da qualunque sito.
