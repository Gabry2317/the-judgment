// Configurazione globale del client "The Judgement".
// Il contratto eventi qui sotto è il riferimento condiviso con il backend
// Node.js/Socket.IO: se cambi un nome evento, cambialo in entrambi i posti.

const JUDGEMENT_CONFIG = {
  DEFAULT_SERVER_URL: '', // vuoto = modalità demo locale (nessun server richiesto)

  // Se il tuo server Debian pubblica il proprio indirizzo su un Gist GitHub
  // (vedi backend/kitab/README.md, sezione Cloudflare Tunnel), incolla qui
  // l'URL "raw" del file: il campo "server" si precompila da solo all'avvio.
  // Lascia vuoto per configurare l'indirizzo a mano come prima.
  // Esempio: 'https://gist.githubusercontent.com/tuoutente/xxxxx/raw/judgement-server.json'
  SERVER_DISCOVERY_URL: '',

  TIMERS: {
    difesa: 90,   // secondi concessi per scrivere la difesa
    voto: 30,     // secondi concessi per votare
  },

  EVENTS: {
    // client -> server
    LOBBY_CREATE: 'lobby:create',
    LOBBY_JOIN: 'lobby:join',
    LOBBY_LIST_PUBLIC: 'lobby:list_public',
    ACCUSA_SUBMIT: 'accusa:submit',
    DIFESA_SUBMIT: 'difesa:submit',
    VOTO_CAST: 'voto:cast',
    TRIAL_NEXT: 'trial:next',

    // server -> client
    LOBBY_JOINED: 'lobby:joined',
    LOBBY_PLAYERS: 'lobby:players',
    LOBBY_LIST_RESULT: 'lobby:list_result',
    TRIAL_STARTED: 'trial:started',
    TRIAL_DEFENSE_SUBMITTED: 'trial:defense_submitted',
    TRIAL_VOTING_PHASE: 'trial:voting_phase',
    TRIAL_AI_JUDGING: 'trial:ai_judging',
    TRIAL_VERDICT: 'trial:verdict',
    ERROR: 'error',
  },
};
