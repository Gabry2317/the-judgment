# The Judgement

Gioco multiplayer di "tribunale virtuale": i giocatori si accusano a
vicenda, l'imputato (scelto a caso) si difende per iscritto, la giuria
(gli altri giocatori) vota, e un giudice AI (via Groq) aggiunge il proprio
verdetto motivato.

## Architettura

```
the-judgement/
├── client/            frontend statico (HTML/CSS/JS vanilla) → GitHub Pages
└── backend/            server multiplayer Node.js/Socket.IO → server Debian
    └── kitab/            installer automatico per il server Debian
```

- **`client/`** è già pronto per GitHub Pages così com'è: nessuna build,
  nessuna dipendenza da installare. Se il campo "server" nella home viene
  lasciato vuoto, gira in modalità demo locale con un backend finto
  (`js/mock-server.js`), utile per provare l'interfaccia senza server reale.
- **`backend/`** implementa esattamente il contratto eventi descritto in
  `client/js/config.js` e `client/README.md`: lobby, turni, timer, voti e
  giudice AI. Va ospitato altrove (non su GitHub) — tipicamente sul tuo
  server Debian personale.
- **`backend/kitab/`** è l'installer che automatizza *tutta* la
  configurazione del server Debian: dipendenze, ambiente, firewall e
  apertura della porta sul router via UPnP, avvio automatico col boot.

## Setup rapido

1. **Backend** (sul server Debian):
   ```bash
   cd backend
   sudo bash kitab/kitab.sh install
   ```
   Segui le domande (porta, chiave API Groq, dominio consentito). Alla fine
   Kitab stampa l'indirizzo da usare nel client.

2. **Frontend** (GitHub Pages): pubblica il contenuto di `client/` così
   com'è (es. con GitHub Pages puntato sul branch/cartella di `client/`).
   Nessuna modifica al codice richiesta: nel gioco, gli utenti inseriscono
   l'indirizzo del tuo server Debian nel campo "server" della home.

3. **Gioca**: crea o entra in un tribunale, deposita un'accusa, aspetta che
   il sistema assegni casualmente l'imputato, scrivi la difesa, vota, e
   guarda il verdetto finale — combinazione dei voti umani + il giudice AI.

## Dettagli

- Documentazione del client: `client/README.md`
- Documentazione del backend (sviluppo, test, sicurezza): `backend/README.md`
- Documentazione di Kitab (installer Debian): `backend/kitab/README.md`

## Note su modularità ed espandibilità

Il progetto è diviso in tre livelli indipendenti che comunicano solo tramite
il contratto eventi Socket.IO documentato in `client/js/config.js`:

- Puoi sostituire il frontend (es. porta il client su React/Vue) senza
  toccare il backend, purché rispetti lo stesso contratto eventi.
- Puoi sostituire il provider AI del giudice (`backend/src/groqJudge.js`)
  senza toccare la logica di lobby/turni (`backend/src/lobbyManager.js`).
- Puoi ospitare il backend con un altro installer/orchestratore (Docker,
  altro OS) ignorando Kitab, che è solo una comodità per Debian.
