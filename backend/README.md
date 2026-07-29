# The Judgement — server

Backend multiplayer per **The Judgement**, compatibile 1:1 con il contratto
eventi definito in `the-judgement-client/js/config.js`. Il client (statico,
per GitHub Pages) resta invariato: basta inserire l'indirizzo di questo
server nel campo "server" della home.

## Struttura

```
server.js              entry point: Express + Socket.IO
src/
  config.js             EVENTS, TIMERS, LIMITS (allineati al client)
  lobbyManager.js        stato di gioco: lobby, turni, timer, verdetto
  groqJudge.js            giudice AI via API Groq
  utils.js                codici lobby, sanitizzazione, rate limiting
test/
  e2e.js                 test automatico dell'intero flusso di gioco
kitab/
  kitab.sh                installer per Debian (vedi sotto)
  upnp-map.sh              apertura automatica della porta via UPnP
  systemd/                 template del servizio systemd
```

## Avvio in locale (sviluppo)

```bash
cd backend
cp .env.example .env      # poi inserisci la tua GROQ_API_KEY
npm install
npm start                 # oppure: npm run dev (restart automatico)
```

Il server ascolta di default su `http://localhost:3000`. Nel client, lascia
il campo "server" vuoto per la demo locale, oppure inserisci
`http://localhost:3000` per collegarti a questo backend reale.

## Test end-to-end

```bash
npm test
```

Simula due giocatori con `socket.io-client`: crea lobby, invia un'accusa,
scrive una difesa, vota, e verifica che il giudice AI produca un verdetto
(usa un verdetto di fallback locale se `GROQ_API_KEY` non è impostata, senza
bisogno di rete esterna).

## Come funziona il game loop

1. **Pre-lobby**: i giocatori entrano, l'host può regolare "giocatori minimi"
   e "secondi di attesa" (`lobby:settings_update`). Quando si raggiunge la
   soglia parte un countdown automatico (annullato se qualcuno esce e si
   scende sotto soglia); l'host può anche avviare subito.
2. **Partita**: l'ordine dei round è casuale ma ogni giocatore viene accusato
   **esattamente una volta** a partita. Ad ogni round, il server sceglie a
   caso anche l'accusatore (chiunque tranne l'imputato di turno) e gli manda
   un evento privato (`round:your_turn`): solo lui vede il form per scrivere
   l'accusa. **L'identità dell'accusatore non viene mai comunicata agli
   altri**, nemmeno all'imputato.
3. **Fine partita**: quando tutti sono stati accusati una volta, il server
   manda `match:ended` con la classifica cumulativa (una colonna per ogni
   partita giocata in questa lobby) e apre un voto per la rivincita
   (`rematch:vote_start`, maggioranza semplice, timeout configurato in
   `TIMERS.rematchVote`).
4. **Rivincita o chiusura**: se la maggioranza vota sì, riparte subito una
   nuova partita mantenendo la classifica. Altrimenti la lobby resta aperta
   ma si autodistrugge dopo `TIMERS.lobbyInactivityCloseMs` di inattività.

## Come funziona il giudice AI (Groq)

`src/groqJudge.js` chiama l'endpoint `POST /openai/v1/chat/completions` di
Groq con un prompt che chiede un JSON `{"votoAI": "assolvi"|"condanna",
"motivazioneAI": "..."}`. Se la chiave manca, la chiamata fallisce, va in
timeout o la risposta non è JSON valido, il server ricade su un verdetto
neutro generato localmente: il processo si conclude comunque, non resta mai
bloccato in attesa dell'AI.

Il modello è configurabile via `GROQ_MODEL` in `.env`: controlla
https://console.groq.com/docs/models per l'elenco aggiornato dei modelli
disponibili, dato che Groq li aggiorna periodicamente.

## Autorità sulle regole di gioco

Il server è l'unica fonte di verità: assegna l'imputato a caso tra i
giocatori diversi dall'accusatore, gestisce i timer di difesa (90s) e voto
(30s) definiti in `src/config.js`, ignora voti doppi o fuori fase, e calcola
`esitoFinale` (già usato per una eventuale evoluzione del client). Il client
attuale calcola comunque in locale lo stesso esito per compatibilità con la
UI esistente — vedi il commento in `app.js` del client.

## Sicurezza / anti-abuso incluse

- Sanitizzazione e limiti di lunghezza su nickname, accuse e difese.
- Rate limiting per socket sulle azioni di invio (accusa/difesa).
- Solo l'imputato può inviare la difesa; solo i giurati (non l'imputato)
  possono votare; un voto per giocatore per round.
- CORS/Socket.IO ristretti a `ALLOWED_ORIGIN` (da impostare col dominio del
  tuo GitHub Pages in produzione — evita `*`).
- Header di sicurezza di base via `helmet`.
- Il servizio systemd gira con un utente dedicato non privilegiato
  (`judgement`), non come root.

## Espandibilità

- `lobbyManager.js` è isolato dal trasporto (Socket.IO) tramite `attach()`:
  puoi aggiungere altri canali (es. REST admin, metriche) senza toccare la
  logica di gioco.
- `groqJudge.js` espone una singola funzione `judge()`: puoi sostituire il
  provider AI o aggiungere un secondo giudice senza toccare `lobbyManager.js`.
- Aggiungere persistenza (storico processi) richiede solo di leggere/scrivere
  in `revealVerdict()` senza cambiare il contratto eventi col client.

## Deploy con Kitab (server Debian)

Vedi `kitab/README.md` per i dettagli. In breve:

```bash
cd backend
sudo bash kitab/kitab.sh install
```

Kitab installa Node.js, configura firewall (UFW) e mappatura UPnP del
router, crea un utente di sistema dedicato e un servizio systemd che tiene
il server sempre attivo e lo riavvia in caso di crash.
