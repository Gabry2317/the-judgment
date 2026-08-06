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

  // Valori di default e limiti (min/max) delle impostazioni configurabili
  // dall'host — devono restare identici a TIMER_SETTINGS in backend/src/config.js
  TIMER_SETTINGS: {
    countdownSeconds: { def: 20, min: 5, max: 120, label: 'Attesa prima dell\'avvio automatico' },
    accusaTurnoSeconds: { def: 60, min: 15, max: 180, label: 'Tempo per scrivere l\'accusa' },
    difesaSeconds: { def: 90, min: 20, max: 240, label: 'Tempo per scrivere la difesa' },
    votoSeconds: { def: 30, min: 10, max: 120, label: 'Tempo per votare' },
    verdictSeconds: { def: 8, min: 3, max: 10, label: 'Verdetto a schermo prima del round successivo' },
    matchEndSeconds: { def: 10, min: 5, max: 20, label: 'Classifica a schermo prima della prossima partita' },
    rivinctaSeconds: { def: 15, min: 5, max: 60, label: 'Tempo per votare la rivincita' },
  },

  EVENTS: {
    // client -> server
    LOBBY_CREATE: 'lobby:create',
    LOBBY_JOIN: 'lobby:join',
    LOBBY_LIST_PUBLIC: 'lobby:list_public',
    LOBBY_SETTINGS_UPDATE: 'lobby:settings_update',
    LOBBY_START_NOW: 'lobby:start_now',
    LOBBY_PAUSE_TOGGLE: 'lobby:pause_toggle',
    ACCUSA_SUBMIT: 'accusa:submit',
    DIFESA_SUBMIT: 'difesa:submit',
    VOTO_CAST: 'voto:cast',
    IMPREVISTO_GIORNALISTA_SUBMIT: 'imprevisto:giornalista_submit',
    REMATCH_CAST: 'rematch:cast',

    // server -> client
    LOBBY_JOINED: 'lobby:joined',
    LOBBY_PLAYERS: 'lobby:players',
    LOBBY_LIST_RESULT: 'lobby:list_result',
    LOBBY_SETTINGS: 'lobby:settings',
    LOBBY_COUNTDOWN_START: 'lobby:countdown_start',
    LOBBY_COUNTDOWN_CANCEL: 'lobby:countdown_cancel',
    LOBBY_PAUSE_STATE: 'lobby:pause_state',
    MATCH_STARTED: 'match:started',
    ROUND_YOUR_TURN: 'round:your_turn',
    ROUND_WAITING: 'round:waiting',
    TRIAL_STARTED: 'trial:started',
    TRIAL_DEFENSE_SUBMITTED: 'trial:defense_submitted',
    TRIAL_IMPREVISTO_PENDING: 'trial:imprevisto_pending',
    TRIAL_IMPREVISTO_FOTO_PRELOAD: 'trial:imprevisto_foto_preload',
    TRIAL_IMPREVISTO_REVEAL: 'trial:imprevisto_reveal',
    TRIAL_IMPREVISTO_GIORNALISTA_TURN: 'trial:imprevisto_giornalista_turn',
    TRIAL_VOTING_PHASE: 'trial:voting_phase',
    TRIAL_AI_JUDGING: 'trial:ai_judging',
    TRIAL_VERDICT: 'trial:verdict',
    MATCH_ENDED: 'match:ended',
    REMATCH_PHASE: 'match:rematch_phase',
    LOBBY_RETURN: 'lobby:return',
    ERROR: 'error',
  },
};
