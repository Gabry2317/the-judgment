// Test end-to-end del nuovo game loop: pre-lobby -> countdown -> round a
// rotazione -> verdetto -> fine partita -> voto rivincita.
// Uso: npm test

process.env.PORT = process.env.TEST_PORT || '3999';
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const server = spawn('node', ['server.js'], { cwd: ROOT, env: process.env, stdio: 'inherit' });

let exited = false;
function finish(code) {
  if (exited) return;
  exited = true;
  server.kill();
  process.exit(code);
}

setTimeout(() => {
  const { EVENTS } = require(path.join(ROOT, 'src/config'));
  const url = `http://localhost:${process.env.PORT}`;

  const a = io(url, { transports: ['websocket'] });
  const b = io(url, { transports: ['websocket'], autoConnect: false });

  const seen = { countdown: false, matchStarted: false, roundsFinished: 0, matchEnded: false, rematchResult: false };
  let accusatoreSocket = null;

  function log(...args) { console.log('[test]', ...args); }

  a.on('connect', () => a.emit(EVENTS.LOBBY_CREATE, { nickname: 'Mario', pubblica: true }));

  a.on(EVENTS.LOBBY_JOINED, (d) => {
    log('lobby creata', d.code);
    // abbassa la soglia a 2 giocatori per velocizzare il test
    a.emit(EVENTS.LOBBY_SETTINGS_UPDATE, { minPlayers: 2, countdownSeconds: 1 });
    b.on('connect', () => b.emit(EVENTS.LOBBY_JOIN, { nickname: 'Luigi', code: d.code }));
    b.connect();
  });

  a.on(EVENTS.LOBBY_COUNTDOWN_START, () => { seen.countdown = true; log('countdown avviato'); });

  a.on(EVENTS.MATCH_STARTED, (d) => { seen.matchStarted = true; log('partita avviata, round totali:', d.totalRounds); });
  b.on(EVENTS.MATCH_STARTED, () => {});

  function bindTurn(sock, nome) {
    sock.on(EVENTS.ROUND_YOUR_TURN, (d) => {
      log(nome, 'ha il turno di accusare', d.imputato);
      accusatoreSocket = sock;
      setTimeout(() => sock.emit(EVENTS.ACCUSA_SUBMIT, { text: 'Ha rubato la pizza dal frigo condiviso.' }), 50);
    });
  }
  bindTurn(a, 'Mario');
  bindTurn(b, 'Luigi');

  let imputatoSocket = null;
  a.on(EVENTS.TRIAL_STARTED, (d) => {
    if (d.imputato === 'Mario') imputatoSocket = a;
    else imputatoSocket = b;
    setTimeout(() => imputatoSocket.emit(EVENTS.DIFESA_SUBMIT, { text: 'Ero al lavoro, ho testimoni.' }), 50);
  });

  a.on(EVENTS.TRIAL_VOTING_PHASE, () => { if (imputatoSocket !== a) a.emit(EVENTS.VOTO_CAST, { decisione: 'assolvi' }); });
  b.on(EVENTS.TRIAL_VOTING_PHASE, () => { if (imputatoSocket !== b) b.emit(EVENTS.VOTO_CAST, { decisione: 'assolvi' }); });

  b.on(EVENTS.TRIAL_VERDICT, (d) => {
    seen.roundsFinished += 1;
    log('verdetto round', seen.roundsFinished, '->', d.esitoFinale);
  });

  b.on(EVENTS.MATCH_ENDED, (d) => {
    seen.matchEnded = true;
    log('partita finita, classifica:', JSON.stringify(d.scoreboard));
  });

  b.on(EVENTS.REMATCH_VOTE_START, () => {
    log('voto rivincita aperto');
    a.emit(EVENTS.REMATCH_VOTE_CAST, { vote: false });
    b.emit(EVENTS.REMATCH_VOTE_CAST, { vote: false });
  });

  b.on(EVENTS.REMATCH_RESULT, (d) => {
    seen.rematchResult = true;
    log('esito voto rivincita:', JSON.stringify(d));
    const allOk = seen.countdown && seen.matchStarted && seen.roundsFinished === 2 && seen.matchEnded && seen.rematchResult;
    console.log('\nRisultato test:', allOk ? 'PASS' : 'FAIL', JSON.stringify(seen));
    finish(allOk ? 0 : 1);
  });

  a.on(EVENTS.ERROR, (d) => console.error('[test] Errore server:', d.message));
  b.on(EVENTS.ERROR, (d) => console.error('[test] Errore server:', d.message));
}, 800);

setTimeout(() => { console.error('TIMEOUT: il flusso di test non si è concluso in tempo.'); finish(1); }, 30000);
