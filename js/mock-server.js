// Simulazione locale del server, usata quando non è disponibile un vero
// backend. Riproduce lo stesso contratto eventi (vedi config.js): pre-lobby
// con countdown, poi round a rotazione, fine partita con classifica e voto
// rivincita — così l'interfaccia si comporta come con il server reale.

function createMockServer() {
  const E = JUDGEMENT_CONFIG.EVENTS;
  const listeners = {};
  const BOT_NAMES = ['Emily', 'Stefano'];
  const FAKE_PUBLIC_LOBBIES = [
    { code: 'FR3SCA', host: 'Marco', playerCount: 3, minPlayers: 3 },
    { code: 'PIZZA7', host: 'Sara', playerCount: 5, minPlayers: 3 },
  ];
  const ACCUSE_DEMO = [
    'Ha lasciato il forno acceso tutta la notte mentre la casa dormiva.',
    'Ha mangiato l\'ultima fetta di pizza senza avvisare nessuno.',
    'Ha finto una videochiamata per evitare di lavare i piatti.',
  ];

  let state = null;

  function on(event, cb) { (listeners[event] = listeners[event] || []).push(cb); }
  function emitToClient(event, payload) { (listeners[event] || []).forEach(cb => setTimeout(() => cb(payload), 0)); }
  function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v); }

  function resetLobby(nickname) {
    state = {
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      players: [{ id: 'me', nome: nickname }, ...BOT_NAMES.map((n, i) => ({ id: 'bot' + i, nome: n }))],
      settings: { minPlayers: 3, countdownSeconds: 3, accusaTurnoSeconds: 60, difesaSeconds: 90, votoSeconds: 30, verdictSeconds: 8, matchEndSeconds: 10, rivinctaSeconds: 8 },
      scoreboard: new Map(),
      matchNumber: 0,
      order: [],
      roundIndex: 0,
      trial: null,
    };
  }

  function startPreLobby() {
    emitToClient(E.LOBBY_JOINED, { code: state.code, players: state.players });
    emitToClient(E.LOBBY_SETTINGS, { ...state.settings, hostId: 'me' });
    setTimeout(() => {
      const endsAt = Date.now() + state.settings.countdownSeconds * 1000;
      emitToClient(E.LOBBY_COUNTDOWN_START, { endsAt });
      state.countdownHandle = setTimeout(() => startMatch(), state.settings.countdownSeconds * 1000);
    }, 500);
  }

  function startMatch() {
    if (state.matchInProgress) return;
    state.matchInProgress = true;
    clearTimeout(state.countdownHandle);
    state.matchNumber += 1;
    state.order = shuffle(state.players.map(p => p.id));
    state.roundIndex = 0;
    emitToClient(E.MATCH_STARTED, { totalRounds: state.order.length, matchNumber: state.matchNumber });
    startRound();
  }

  function startRound() {
    if (state.roundIndex >= state.order.length) return endMatch();

    const imputatoId = state.order[state.roundIndex];
    const imputato = state.players.find(p => p.id === imputatoId);
    const candidates = state.players.filter(p => p.id !== imputatoId);
    const accusatore = candidates[Math.floor(Math.random() * candidates.length)];

    state.trial = { imputatoId, accusatoreId: accusatore.id, accusa: null, difesa: null, playerVote: null };

    const roundNumber = state.roundIndex + 1;
    const totalRounds = state.order.length;
    emitToClient(E.ROUND_WAITING, { roundNumber, totalRounds });

    if (accusatore.id === 'me') {
      emitToClient(E.ROUND_YOUR_TURN, { imputato: imputato.nome, roundNumber, totalRounds, endsAt: Date.now() + state.settings.accusaTurnoSeconds * 1000 });
    } else {
      setTimeout(() => submitAccusa(ACCUSE_DEMO[Math.floor(Math.random() * ACCUSE_DEMO.length)]), 1400);
    }
  }

  function submitAccusa(text) {
    const trial = state.trial;
    trial.accusa = text;
    const imputato = state.players.find(p => p.id === trial.imputatoId);
    emitToClient(E.TRIAL_STARTED, { imputato: imputato.nome, accusa: text, endsAt: Date.now() + state.settings.difesaSeconds * 1000 });

    if (trial.imputatoId !== 'me') {
      setTimeout(() => submitDifesa('Non è come sembra, c\'è una spiegazione perfettamente ragionevole per tutto questo.'), 2200);
    }
  }

  function submitDifesa(text) {
    const trial = state.trial;
    if (!trial || trial.difesa) return;
    trial.difesa = text;
    emitToClient(E.TRIAL_DEFENSE_SUBMITTED, { difesa: text });
    setTimeout(() => {
      emitToClient(E.TRIAL_VOTING_PHASE, { endsAt: Date.now() + state.settings.votoSeconds * 1000 });
      setTimeout(() => runAiJudge(), 3500);
    }, 600);
  }

  function runAiJudge() {
    emitToClient(E.TRIAL_AI_JUDGING, {});
    setTimeout(() => {
      const trial = state.trial;
      const imputato = state.players.find(p => p.id === trial.imputatoId);
      const jurors = state.players.filter(p => p.id !== trial.imputatoId && p.id !== 'me');
      const botVotes = jurors.map(p => ({ giocatore: p.nome, decisione: Math.random() > 0.5 ? 'assolvi' : 'condanna' }));
      const aiFavorevole = Math.random() > 0.4;
      const votoAI = aiFavorevole ? 'assolvi' : 'condanna';

      let condanne = botVotes.filter(v => v.decisione === 'condanna').length + (votoAI === 'condanna' ? 1 : 0);
      let assoluzioni = botVotes.filter(v => v.decisione === 'assolvi').length + (votoAI === 'assolvi' ? 1 : 0);
      if (trial.imputatoId !== 'me' && trial.playerVote) {
        if (trial.playerVote === 'condanna') condanne += 1; else assoluzioni += 1;
      }
      const esitoFinale = condanne > assoluzioni ? 'colpevole' : 'assolto';

      if (!state.scoreboard.has(imputato.nome)) state.scoreboard.set(imputato.nome, { nome: imputato.nome, matches: [] });
      const entry = state.scoreboard.get(imputato.nome);
      while (entry.matches.length < state.matchNumber - 1) entry.matches.push(null);
      entry.matches[state.matchNumber - 1] = esitoFinale;

      emitToClient(E.TRIAL_VERDICT, {
        accusa: trial.accusa,
        difesa: trial.difesa,
        votiGiuria: botVotes,
        votoAI,
        motivazioneAI: aiFavorevole
          ? 'La difesa presenta una spiegazione coerente e plausibile; non emergono contraddizioni sostanziali nella ricostruzione dei fatti.'
          : 'La difesa non affronta in modo convincente il punto centrale dell\'accusa e presenta incongruenze logiche.',
        esitoFinale,
        endsAt: Date.now() + state.settings.verdictSeconds * 1000,
      });

      state.roundIndex += 1;
      setTimeout(() => { state.trial = null; startRound(); }, state.settings.verdictSeconds * 1000);
    }, 2200);
  }

  function endMatch() {
    state.matchInProgress = false;
    const scoreboard = [...state.scoreboard.values()].map(e => ({ nome: e.nome, matches: e.matches.slice() }));
    const endsAt = Date.now() + state.settings.matchEndSeconds * 1000;
    emitToClient(E.MATCH_ENDED, { matchNumber: state.matchNumber, scoreboard, endsAt });
    setTimeout(() => startRematchVote(), state.settings.matchEndSeconds * 1000);
  }

  // I bot della demo votano sempre "sì" alla rivincita, per riprodurre il
  // comportamento tipico: si continua sempre a giocare finché qualcuno (il
  // giocatore reale) non decide di fermarsi.
  function startRematchVote() {
    const rivinctaSeconds = state.settings.rivinctaSeconds || 15;
    const endsAt = Date.now() + rivinctaSeconds * 1000;
    emitToClient(E.REMATCH_PHASE, { endsAt });
    state.rematchHandle = setTimeout(() => startMatch(), rivinctaSeconds * 1000);
  }

  function castRematchVote(vuole) {
    if (vuole === 'no') {
      clearTimeout(state.rematchHandle);
      resetLobby(state.players[0].nome);
      startPreLobby();
    }
    // "sì" non fa nulla di speciale: si aspetta semplicemente lo scadere del
    // timer (o il voto "no"), come lato server reale.
  }

  return {
    connect(nickname) {
      resetLobby(nickname);
      setTimeout(() => startPreLobby(), 300);
    },
    on,
    emit(event, payload) {
      if (event === E.LOBBY_SETTINGS_UPDATE) {
        Object.assign(state.settings, payload);
        emitToClient(E.LOBBY_SETTINGS, { ...state.settings, hostId: 'me' });
      }
      if (event === E.LOBBY_START_NOW) startMatch();
      if (event === E.ACCUSA_SUBMIT && state.trial && state.trial.accusatoreId === 'me' && !state.trial.accusa) {
        submitAccusa(payload.text);
      }
      if (event === E.DIFESA_SUBMIT) submitDifesa(payload.text);
      if (event === E.VOTO_CAST && state.trial) state.trial.playerVote = payload.decisione;
      if (event === E.REMATCH_CAST) castRematchVote(payload.vuole);
      if (event === E.LOBBY_LIST_PUBLIC) {
        setTimeout(() => emitToClient(E.LOBBY_LIST_RESULT, { lobbies: FAKE_PUBLIC_LOBBIES }), 400);
      }
    },
  };
}
