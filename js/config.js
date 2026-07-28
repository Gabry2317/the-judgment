// Configurazione globale del client "The Judgement".
// Il contratto eventi qui sotto è il riferimento condiviso con il backend
// Node.js/Socket.IO: se cambi un nome evento, cambialo in entrambi i posti.

const JUDGEMENT_CONFIG = {
  DEFAULT_SERVER_URL: '', // vuoto = modalità demo locale (nessun server richiesto)

  // Se il tuo server Debian pubblica il proprio indirizzo su un Gist GitHub
  // (vedi backend/kitab/README.md, sezione Cloudflare Tunnel), incolla qui
  // l'URL "raw" del file: il campo "server" (nascosto) si precompila da solo
  // all'avvio, senza che chi gioca debba mai vederlo o toccarlo.
  SERVER_DISCOVERY_URL: 'https://gist.githubusercontent.com/Gabry2317/c258d2718dff7c3ede0290111efe0984/raw/judgement-server.json',

  TIMERS: {
    difesa: 90,      // secondi concessi per scrivere la difesa
    voto: 30,        // secondi concessi per votare
    accusaTurno: 60, // secondi concessi a chi ha il turno di accusare
  },

  EVENTS: {
    // client -> server
    LOBBY_CREATE: 'lobby:create',
    LOBBY_JOIN: 'lobby:join',
    LOBBY_LIST_PUBLIC: 'lobby:list_public',
    LOBBY_SETTINGS_UPDATE: 'lobby:settings_update',
    LOBBY_START_NOW: 'lobby:start_now',
    ACCUSA_SUBMIT: 'accusa:submit',
    DIFESA_SUBMIT: 'difesa:submit',
    VOTO_CAST: 'voto:cast',
    REMATCH_VOTE_CAST: 'rematch:vote_cast',

    // server -> client
    LOBBY_JOINED: 'lobby:joined',
    LOBBY_PLAYERS: 'lobby:players',
    LOBBY_LIST_RESULT: 'lobby:list_result',
    LOBBY_SETTINGS: 'lobby:settings',
    LOBBY_COUNTDOWN_START: 'lobby:countdown_start',
    LOBBY_COUNTDOWN_CANCEL: 'lobby:countdown_cancel',
    LOBBY_CLOSED: 'lobby:closed',
    MATCH_STARTED: 'match:started',
    ROUND_YOUR_TURN: 'round:your_turn',
    ROUND_WAITING: 'round:waiting',
    TRIAL_STARTED: 'trial:started',
    TRIAL_DEFENSE_SUBMITTED: 'trial:defense_submitted',
    TRIAL_VOTING_PHASE: 'trial:voting_phase',
    TRIAL_AI_JUDGING: 'trial:ai_judging',
    TRIAL_VERDICT: 'trial:verdict',
    MATCH_ENDED: 'match:ended',
    REMATCH_VOTE_START: 'rematch:vote_start',
    REMATCH_RESULT: 'rematch:result',
    ERROR: 'error',
  },
};
