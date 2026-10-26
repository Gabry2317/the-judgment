// Configurazione globale del client "The Judgement".
// Il contratto eventi qui sotto è il riferimento condiviso con il backend
// Node.js/Socket.IO: se cambi un nome evento, cambialo in entrambi i posti.

const JUDGEMENT_CONFIG = {
  // Indirizzo fisso del server (Tailscale Funnel, porta 8443). Vuoto = modalità
  // demo locale. Il campo "server" nell'interfaccia resta nascosto: si
  // precompila da solo con questo valore (vedi server-discovery.js).
  DEFAULT_SERVER_URL: 'https://nas.tail16ace7.ts.net:8443',

  // Non serve più: con Funnel l'indirizzo non cambia, quindi niente Gist.
  // Lascia vuoto (se lo imposti, ha la precedenza su DEFAULT_SERVER_URL).
  SERVER_DISCOVERY_URL: '',

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
    // Foto-prova generata da UN solo client (il più veloce a rispondere al ping)
    NET_PING: 'net:ping',
    TRIAL_FOTO_PREPARE: 'trial:foto_prepare',
    TRIAL_FOTO_GENERATE: 'trial:foto_generate',
    TRIAL_FOTO_RESULT: 'trial:foto_result',
    ERROR: 'error',
  },
};
