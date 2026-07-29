// Configurazione del backend "The Judgement".
// EVENTS e TIMERS devono restare identici a quelli in
// the-judgement-client/js/config.js: se cambi un nome evento o un timer,
// cambialo in entrambi i posti.

require('dotenv').config();

const EVENTS = {
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
};

const TIMERS = {
  difesa: 90, // secondi concessi per scrivere la difesa
  voto: 30, // secondi concessi per votare
  accusaTurno: 60, // secondi concessi a chi ha il turno di scrivere l'accusa
  countdownDefault: 20, // secondi di attesa in pre-lobby prima dell'avvio automatico
  countdownMin: 5,
  countdownMax: 120,
  rematchVote: 20, // secondi per votare la rivincita
  lobbyInactivityCloseMs: 10 * 60 * 1000, // chiude la lobby se resta inattiva
  // piccoli ritardi "cinematografici" per far respirare la UI, come nel mock
  postDifesaDelayMs: 600,
  aiJudgingDelayMs: 1500,
  nextRoundDelayMs: 2500,
};

const LIMITS = {
  nicknameMaxLen: 24,
  accusaMaxLen: 800,
  difesaMaxLen: 1500,
  maxPlayersPerLobby: parseInt(process.env.MAX_PLAYERS_PER_LOBBY || '12', 10),
  minPlayersDefault: parseInt(process.env.MIN_PLAYERS_FOR_TRIAL || '3', 10),
  minPlayersFloor: 2, // non si può scendere sotto questa soglia nelle impostazioni
  // cooldown anti-spam (ms) tra due submit consecutivi dello stesso tipo
  submitCooldownMs: 1500,
};

const SERVER = {
  port: parseInt(process.env.PORT || '3000', 10),
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
};

module.exports = { EVENTS, TIMERS, LIMITS, SERVER };
