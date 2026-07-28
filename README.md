# The Judgement — client

Client statico (HTML/CSS/JS vanilla, nessun bundler) pensato per GitHub Pages.
Si collega a un server Socket.IO esterno (il tuo server Debian configurato con Kitab)
oppure, se il campo "server" viene lasciato vuoto, gira in **modalità demo locale**
con un finto backend in-memory (`js/mock-server.js`) per testare tutta l'interfaccia
senza bisogno del backend reale.

## Come provarlo subito

Basta aprire `index.html` in un browser (va bene anche `file://`, non serve un server
web). Inserisci un nome, lascia vuoto il campo server, premi "Apri un nuovo tribunale":
la demo ti assegna come imputato e simula accusatore, giuria bot e giudice AI.

## Struttura

```
index.html          struttura delle 4 viste (home, lobby, processo, verdetto)
css/style.css        design system "fascicolo giudiziario"
js/config.js         costanti + contratto eventi condiviso col backend
js/mock-server.js     backend finto locale per test senza server reale
js/socket-client.js   astrazione: sceglie Socket.IO reale o mock
js/ui.js              rendering DOM puro
js/app.js             logica applicativa: wiring eventi, timer, calcolo verdetto
```

## Contratto eventi (da rispettare nel backend Node.js/Socket.IO)

Client → server: `lobby:create` `{nickname, pubblica}`, `lobby:join` `{nickname, code}`,
`lobby:list_public` `{}`, `accusa:submit`, `difesa:submit`, `voto:cast`, `trial:next`.

Server → client: `lobby:joined` `{code, players}`, `lobby:players`,
`lobby:list_result` `{lobbies: [{code, host, playerCount, caseNumber}]}`, `trial:started`,
`trial:defense_submitted`, `trial:voting_phase`, `trial:ai_judging`,
`trial:verdict`, `error`.

Nota sulla ricerca di lobby pubbliche: il client, quando preme "Aggiorna elenco",
si connette (o riusa la connessione) ed emette `lobby:list_public`; il server deve
rispondere con `lobby:list_result` contenente solo le lobby con `pubblica: true`
ancora in stato di attesa (non a processo in corso, per evitare che si entri a
metà partita).

Payload attesi e logica di combinazione voti sono documentati nei commenti di
`config.js` e `app.js`. Il client calcola già in locale l'esito finale (maggioranza
semplice includendo il voto AI come un giurato in più, parità = assolto) — se preferisci
che sia il server l'unica fonte di verità sull'esito, sposta `computeVerdict` lato
backend e passa `esitoFinale` già pronto dentro l'evento `trial:verdict`.

## Prossimi passi

- Collegare al vero server Debian (Kitab) inserendo il suo indirizzo WebSocket nel
  campo "server" — nessuna modifica al codice necessaria.
- Aggiungere autenticazione/anti-spam sul deposito accuse quando il backend è pronto.
- Persistenza dello storico processi (facoltativa) per una vista "archivio casi".
