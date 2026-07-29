// Gestore centrale dello stato di gioco. Il server è l'autorità sulle regole:
//
//   pre-lobby (in attesa) -> countdown -> partita (round a rotazione,
//   uno per giocatore, ognuno accusato una volta) -> fine partita con
//   classifica -> voto rivincita -> nuova partita (classifica mantenuta)
//   oppure chiusura della lobby per inattività.
//
// Il client resta "dumb": si limita a mostrare quello che il server manda.

const { EVENTS, TIMERS, LIMITS } = require('./config');
const { generateCode, sanitizeText, sanitizeNickname, createRateLimiter, pickRandom } = require('./utils');
const groqJudge = require('./groqJudge');

const allowSubmit = createRateLimiter(LIMITS.submitCooldownMs);

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createLobbyManager(io) {
  /** @type {Map<string, Lobby>} */
  const lobbies = new Map();

  // ---------------------------------------------------------------------
  // Helper di stato/broadcast
  // ---------------------------------------------------------------------

  function publicLobbiesSnapshot() {
    return [...lobbies.values()]
      .filter((l) => l.pubblica && l.state === 'lobby')
      .map((l) => ({
        code: l.code,
        host: l.players.get(l.hostId)?.nome || '???',
        playerCount: l.players.size,
        minPlayers: l.settings.minPlayers,
      }));
  }

  function playersArray(lobby) {
    return [...lobby.players.values()].map((p) => ({ id: p.id, nome: p.nome }));
  }

  function broadcastPlayers(lobby) {
    io.to(lobby.code).emit(EVENTS.LOBBY_PLAYERS, playersArray(lobby));
  }

  function broadcastSettings(lobby) {
    io.to(lobby.code).emit(EVENTS.LOBBY_SETTINGS, {
      minPlayers: lobby.settings.minPlayers,
      countdownSeconds: lobby.settings.countdownSeconds,
      hostId: lobby.hostId,
    });
  }

  function sendError(socket, message) {
    socket.emit(EVENTS.ERROR, { message });
  }

  function newLobby(pubblica) {
    const code = generateCode(lobbies);
    const lobby = {
      code,
      pubblica: !!pubblica,
      hostId: null,
      players: new Map(), // socketId -> {id, nome}
      state: 'lobby', // 'lobby' | 'countdown' | 'match' | 'match_end' | 'rematch_vote'
      settings: {
        minPlayers: LIMITS.minPlayersDefault,
        countdownSeconds: TIMERS.countdownDefault,
      },
      countdownTimer: null,
      inactivityTimer: null,
      scoreboard: new Map(), // nome -> { nome, matches: ['assolto'|'colpevole', ...] }
      matchNumber: 0,
      match: null, // { order: [socketId,...], roundIndex }
      trial: null,
    };
    lobbies.set(code, lobby);
    return lobby;
  }

  function joinSocketToLobby(socket, lobby, nickname, isHost) {
    socket.join(lobby.code);
    socket.data.lobbyCode = lobby.code;
    socket.data.nickname = nickname;
    lobby.players.set(socket.id, { id: socket.id, nome: nickname });
    if (isHost) lobby.hostId = socket.id;

    socket.emit(EVENTS.LOBBY_JOINED, { code: lobby.code, players: playersArray(lobby) });
    broadcastPlayers(lobby);
    broadcastSettings(lobby);
    maybeStartCountdown(lobby);
  }

  function currentLobby(socket) {
    const code = socket.data.lobbyCode;
    return code ? lobbies.get(code) : null;
  }

  function clearCountdown(lobby) {
    if (lobby.countdownTimer) {
      clearTimeout(lobby.countdownTimer);
      lobby.countdownTimer = null;
    }
  }

  function clearInactivityTimer(lobby) {
    if (lobby.inactivityTimer) {
      clearTimeout(lobby.inactivityTimer);
      lobby.inactivityTimer = null;
    }
  }

  // ---------------------------------------------------------------------
  // Pre-lobby: creazione, join, impostazioni, countdown automatico
  // ---------------------------------------------------------------------

  function handleCreate(socket, payload = {}) {
    const nickname = sanitizeNickname(payload.nickname);
    if (!nickname) return sendError(socket, 'Nome non valido.');
    if (socket.data.lobbyCode) return sendError(socket, 'Sei già in un tribunale.');

    const lobby = newLobby(!!payload.pubblica);
    joinSocketToLobby(socket, lobby, nickname, true);
  }

  function handleJoin(socket, payload = {}) {
    const nickname = sanitizeNickname(payload.nickname);
    const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
    if (!nickname) return sendError(socket, 'Nome non valido.');
    if (socket.data.lobbyCode) return sendError(socket, 'Sei già in un tribunale.');

    const lobby = lobbies.get(code);
    if (!lobby) return sendError(socket, 'Codice tribunale non trovato.');
    if (lobby.state !== 'lobby' && lobby.state !== 'countdown') {
      return sendError(socket, 'Il processo è già in corso: non puoi entrare a metà partita.');
    }
    if (lobby.players.size >= LIMITS.maxPlayersPerLobby) {
      return sendError(socket, 'Questo tribunale ha già raggiunto il numero massimo di giocatori.');
    }

    joinSocketToLobby(socket, lobby, nickname, false);
  }

  function handleListPublic(socket) {
    socket.emit(EVENTS.LOBBY_LIST_RESULT, { lobbies: publicLobbiesSnapshot() });
  }

  function handleSettingsUpdate(socket, payload = {}) {
    const lobby = currentLobby(socket);
    if (!lobby) return sendError(socket, 'Non sei in nessun tribunale.');
    if (lobby.hostId !== socket.id) return sendError(socket, 'Solo l\'host può cambiare le impostazioni.');
    if (lobby.state !== 'lobby' && lobby.state !== 'countdown') {
      return sendError(socket, 'Non puoi cambiare le impostazioni a partita in corso.');
    }

    const minPlayers = Math.max(
      LIMITS.minPlayersFloor,
      Math.min(LIMITS.maxPlayersPerLobby, parseInt(payload.minPlayers, 10) || lobby.settings.minPlayers)
    );
    const countdownSeconds = Math.max(
      TIMERS.countdownMin,
      Math.min(TIMERS.countdownMax, parseInt(payload.countdownSeconds, 10) || lobby.settings.countdownSeconds)
    );

    lobby.settings = { minPlayers, countdownSeconds };
    broadcastSettings(lobby);
    maybeStartCountdown(lobby); // ricontrolla: magari la nuova soglia è già raggiunta
  }

  function maybeStartCountdown(lobby) {
    if (lobby.state !== 'lobby') return;
    if (lobby.players.size < lobby.settings.minPlayers) return;

    lobby.state = 'countdown';
    const endsAt = Date.now() + lobby.settings.countdownSeconds * 1000;
    io.to(lobby.code).emit(EVENTS.LOBBY_COUNTDOWN_START, { endsAt });
    lobby.countdownTimer = setTimeout(() => startMatch(lobby), lobby.settings.countdownSeconds * 1000);
  }

  function cancelCountdownIfNeeded(lobby) {
    if (lobby.state !== 'countdown') return;
    if (lobby.players.size >= lobby.settings.minPlayers) return;
    clearCountdown(lobby);
    lobby.state = 'lobby';
    io.to(lobby.code).emit(EVENTS.LOBBY_COUNTDOWN_CANCEL, {});
  }

  function handleStartNow(socket) {
    const lobby = currentLobby(socket);
    if (!lobby) return sendError(socket, 'Non sei in nessun tribunale.');
    if (lobby.hostId !== socket.id) return sendError(socket, 'Solo l\'host può avviare subito.');
    if (lobby.state !== 'lobby' && lobby.state !== 'countdown') return;
    if (lobby.players.size < LIMITS.minPlayersFloor) {
      return sendError(socket, `Servono almeno ${LIMITS.minPlayersFloor} giocatori per iniziare.`);
    }
    clearCountdown(lobby);
    startMatch(lobby);
  }

  // ---------------------------------------------------------------------
  // Partita: sequenza di round a rotazione, uno per giocatore
  // ---------------------------------------------------------------------

  function startMatch(lobby) {
    clearCountdown(lobby);
    clearInactivityTimer(lobby);
    lobby.state = 'match';
    lobby.matchNumber += 1;
    lobby.match = { order: shuffle([...lobby.players.keys()]), roundIndex: 0 };

    io.to(lobby.code).emit(EVENTS.MATCH_STARTED, {
      totalRounds: lobby.match.order.length,
      matchNumber: lobby.matchNumber,
    });

    startRound(lobby);
  }

  function startRound(lobby) {
    const match = lobby.match;
    if (!match) return;

    if (match.roundIndex >= match.order.length) {
      endMatch(lobby);
      return;
    }

    const imputatoId = match.order[match.roundIndex];
    const imputato = lobby.players.get(imputatoId);
    if (!imputato) {
      // il giocatore si è disconnesso prima del suo turno: salta il round
      match.roundIndex += 1;
      return startRound(lobby);
    }

    const candidates = [...lobby.players.keys()].filter((id) => id !== imputatoId);
    if (candidates.length === 0) {
      match.roundIndex += 1;
      return startRound(lobby);
    }
    const accusatoreId = pickRandom(candidates);

    lobby.trial = {
      imputatoId,
      accusatoreId,
      accusa: null,
      difesa: null,
      phase: 'accusa_turno', // 'accusa_turno' | 'difesa' | 'voto' | 'ai' | 'verdetto'
      votes: new Map(),
      turnoTimer: null,
      difesaTimer: null,
      votoTimer: null,
    };

    const roundNumber = match.roundIndex + 1;
    const totalRounds = match.order.length;

    io.to(lobby.code).emit(EVENTS.ROUND_WAITING, { roundNumber, totalRounds });
    io.to(accusatoreId).emit(EVENTS.ROUND_YOUR_TURN, { imputato: imputato.nome, roundNumber, totalRounds });

    lobby.trial.turnoTimer = setTimeout(() => {
      if (lobby.trial && lobby.trial.phase === 'accusa_turno') {
        submitAccusa(lobby, "(nessuna accusa presentata in tempo: il tribunale procede comunque)");
      }
    }, TIMERS.accusaTurno * 1000);
  }

  function submitAccusa(lobby, text) {
    const trial = lobby.trial;
    if (!trial || trial.phase !== 'accusa_turno') return;
    clearTimeout(trial.turnoTimer);
    trial.accusa = text;
    trial.phase = 'difesa';

    const imputato = lobby.players.get(trial.imputatoId);
    io.to(lobby.code).emit(EVENTS.TRIAL_STARTED, {
      imputato: imputato ? imputato.nome : '???',
      accusa: text,
      // niente "accusatore": l'accusa resta anonima per tutti
    });

    trial.difesaTimer = setTimeout(() => {
      if (lobby.trial && lobby.trial.phase === 'difesa') {
        submitDifesa(lobby, trial.imputatoId, "(l'imputato non ha presentato una difesa in tempo)");
      }
    }, TIMERS.difesa * 1000);
  }

  function submitDifesa(lobby, submitterId, text) {
    const trial = lobby.trial;
    if (!trial || trial.phase !== 'difesa') return;
    clearTimeout(trial.difesaTimer);
    trial.difesa = text;
    trial.phase = 'voto';

    io.to(lobby.code).emit(EVENTS.TRIAL_DEFENSE_SUBMITTED, { difesa: text });

    setTimeout(() => {
      if (!lobby.trial || lobby.trial.phase !== 'voto') return;
      io.to(lobby.code).emit(EVENTS.TRIAL_VOTING_PHASE, {});
      lobby.trial.votoTimer = setTimeout(() => finalizeVoting(lobby), TIMERS.voto * 1000);
    }, TIMERS.postDifesaDelayMs);
  }

  function jurySize(lobby) {
    return [...lobby.players.keys()].filter((id) => id !== lobby.trial.imputatoId).length;
  }

  async function finalizeVoting(lobby) {
    const trial = lobby.trial;
    if (!trial || trial.phase !== 'voto') return;
    clearTimeout(trial.votoTimer);
    trial.phase = 'ai';

    io.to(lobby.code).emit(EVENTS.TRIAL_AI_JUDGING, {});

    let aiResult;
    try {
      aiResult = await groqJudge.judge({ accusa: trial.accusa, difesa: trial.difesa });
    } catch (err) {
      console.error('Errore imprevisto nel giudice AI:', err);
      aiResult = { votoAI: 'assolvi', motivazioneAI: 'Errore interno del giudice AI: beneficio del dubbio concesso.' };
    }

    setTimeout(() => revealVerdict(lobby, aiResult), TIMERS.aiJudgingDelayMs);
  }

  function revealVerdict(lobby, aiResult) {
    const trial = lobby.trial;
    if (!trial) return;
    trial.phase = 'verdetto';

    const allVotes = [...trial.votes.entries()].map(([socketId, decisione]) => ({
      socketId,
      giocatore: lobby.players.get(socketId)?.nome || '???',
      decisione,
    }));

    const condanne = allVotes.filter((v) => v.decisione === 'condanna').length + (aiResult.votoAI === 'condanna' ? 1 : 0);
    const assoluzioni = allVotes.filter((v) => v.decisione === 'assolvi').length + (aiResult.votoAI === 'assolvi' ? 1 : 0);
    const esitoFinale = condanne > assoluzioni ? 'colpevole' : 'assolto';

    for (const [socketId] of lobby.players) {
      const votiGiuriaPerDestinatario = allVotes
        .filter((v) => v.socketId !== socketId)
        .map(({ giocatore, decisione }) => ({ giocatore, decisione }));

      io.to(socketId).emit(EVENTS.TRIAL_VERDICT, {
        accusa: trial.accusa,
        difesa: trial.difesa,
        votiGiuria: votiGiuriaPerDestinatario,
        votoAI: aiResult.votoAI,
        motivazioneAI: aiResult.motivazioneAI,
        esitoFinale,
      });
    }

    // registra il risultato in classifica (per nome, sopravvive alle riconnessioni)
    const imputato = lobby.players.get(trial.imputatoId);
    if (imputato) {
      recordScore(lobby, imputato.nome, esitoFinale);
    }

    if (lobby.match) {
      lobby.match.roundIndex += 1;
      setTimeout(() => {
        lobby.trial = null;
        startRound(lobby);
      }, TIMERS.nextRoundDelayMs);
    }
  }

  function handleVotoCast(socket, payload = {}) {
    const lobby = currentLobby(socket);
    if (!lobby || !lobby.trial) return sendError(socket, 'Nessun processo in corso.');
    const trial = lobby.trial;
    if (trial.phase !== 'voto') return sendError(socket, 'Non è il momento di votare.');
    if (trial.imputatoId === socket.id) return sendError(socket, 'L\'imputato non può votare su se stesso.');
    if (trial.votes.has(socket.id)) return;

    const decisione = payload.decisione === 'assolvi' ? 'assolvi' : payload.decisione === 'condanna' ? 'condanna' : null;
    if (!decisione) return sendError(socket, 'Voto non valido.');

    trial.votes.set(socket.id, decisione);
    if (trial.votes.size >= jurySize(lobby)) finalizeVoting(lobby);
  }

  function handleAccusaSubmit(socket, payload = {}) {
    const lobby = currentLobby(socket);
    if (!lobby || !lobby.trial) return sendError(socket, 'Non è il momento di depositare un\'accusa.');
    if (lobby.trial.phase !== 'accusa_turno') return sendError(socket, 'L\'accusa di questo round è già stata depositata.');
    if (lobby.trial.accusatoreId !== socket.id) return sendError(socket, 'Non è il tuo turno di accusare.');
    if (!allowSubmit(socket.id, 'accusa')) return sendError(socket, 'Aspetta qualche secondo prima di reinviare.');

    const text = sanitizeText(payload.text, LIMITS.accusaMaxLen);
    if (!text) return sendError(socket, 'Scrivi un\'accusa prima di inviarla.');

    submitAccusa(lobby, text);
  }

  function handleDifesaSubmit(socket, payload = {}) {
    const lobby = currentLobby(socket);
    if (!lobby || !lobby.trial) return sendError(socket, 'Nessun processo in corso.');
    if (lobby.trial.imputatoId !== socket.id) return sendError(socket, 'Solo l\'imputato può presentare la difesa.');
    if (lobby.trial.phase !== 'difesa') return sendError(socket, 'Fase della difesa già conclusa.');
    if (!allowSubmit(socket.id, 'difesa')) return;

    const text = sanitizeText(payload.text, LIMITS.difesaMaxLen) || "(l'imputato non ha presentato una difesa)";
    submitDifesa(lobby, socket.id, text);
  }

  // ---------------------------------------------------------------------
  // Classifica, fine partita, rivincita
  // ---------------------------------------------------------------------

  function recordScore(lobby, nome, esito) {
    if (!lobby.scoreboard.has(nome)) {
      lobby.scoreboard.set(nome, { nome, matches: [] });
    }
    const entry = lobby.scoreboard.get(nome);
    // riempi eventuali partite precedenti mancanti (giocatore entrato dopo) con null
    while (entry.matches.length < lobby.matchNumber - 1) entry.matches.push(null);
    entry.matches[lobby.matchNumber - 1] = esito;
  }

  function scoreboardSnapshot(lobby) {
    return [...lobby.scoreboard.values()].map((e) => ({ nome: e.nome, matches: e.matches.slice() }));
  }

  function endMatch(lobby) {
    lobby.state = 'match_end';
    lobby.match = null;
    lobby.trial = null;

    io.to(lobby.code).emit(EVENTS.MATCH_ENDED, {
      matchNumber: lobby.matchNumber,
      scoreboard: scoreboardSnapshot(lobby),
    });

    setTimeout(() => startRematchVote(lobby), TIMERS.nextRoundDelayMs);
  }

  function startRematchVote(lobby) {
    if (lobby.players.size === 0) return; // lobby ormai vuota, non c'è nessuno da consultare
    lobby.state = 'rematch_vote';
    lobby.rematchVotes = new Map();
    const endsAt = Date.now() + TIMERS.rematchVote * 1000;
    io.to(lobby.code).emit(EVENTS.REMATCH_VOTE_START, { endsAt });
    lobby.rematchTimer = setTimeout(() => resolveRematchVote(lobby), TIMERS.rematchVote * 1000);
  }

  function handleRematchVote(socket, payload = {}) {
    const lobby = currentLobby(socket);
    if (!lobby || lobby.state !== 'rematch_vote') return;
    lobby.rematchVotes.set(socket.id, !!payload.vote);
    if (lobby.rematchVotes.size >= lobby.players.size) resolveRematchVote(lobby);
  }

  function resolveRematchVote(lobby) {
    if (lobby.state !== 'rematch_vote') return;
    clearTimeout(lobby.rematchTimer);

    const votes = [...lobby.rematchVotes.values()];
    const yes = votes.filter(Boolean).length;
    const no = votes.length - yes;
    const again = yes > no && yes > 0 && lobby.players.size >= LIMITS.minPlayersFloor;

    io.to(lobby.code).emit(EVENTS.REMATCH_RESULT, { again, yes, no });

    if (again) {
      startMatch(lobby);
    } else {
      lobby.state = 'lobby';
      broadcastSettings(lobby);
      clearInactivityTimer(lobby);
      lobby.inactivityTimer = setTimeout(() => closeLobby(lobby, 'inattività'), TIMERS.lobbyInactivityCloseMs);
    }
  }

  function closeLobby(lobby, reason) {
    io.to(lobby.code).emit(EVENTS.LOBBY_CLOSED, { reason });
    for (const socketId of lobby.players.keys()) {
      const s = io.sockets.sockets.get(socketId);
      if (s) {
        s.leave(lobby.code);
        s.data.lobbyCode = null;
      }
    }
    clearCountdown(lobby);
    clearInactivityTimer(lobby);
    if (lobby.trial) {
      clearTimeout(lobby.trial.turnoTimer);
      clearTimeout(lobby.trial.difesaTimer);
      clearTimeout(lobby.trial.votoTimer);
    }
    lobbies.delete(lobby.code);
  }

  // ---------------------------------------------------------------------
  // Disconnessioni
  // ---------------------------------------------------------------------

  function handleDisconnect(socket) {
    const lobby = currentLobby(socket);
    if (!lobby) return;

    lobby.players.delete(socket.id);
    socket.leave(lobby.code);

    if (lobby.players.size === 0) {
      clearCountdown(lobby);
      clearInactivityTimer(lobby);
      if (lobby.trial) {
        clearTimeout(lobby.trial.turnoTimer);
        clearTimeout(lobby.trial.difesaTimer);
        clearTimeout(lobby.trial.votoTimer);
      }
      lobbies.delete(lobby.code);
      return;
    }

    if (lobby.hostId === socket.id) {
      lobby.hostId = lobby.players.keys().next().value;
      broadcastSettings(lobby);
    }

    if (lobby.trial && (lobby.trial.imputatoId === socket.id || lobby.trial.accusatoreId === socket.id)) {
      clearTimeout(lobby.trial.turnoTimer);
      clearTimeout(lobby.trial.difesaTimer);
      clearTimeout(lobby.trial.votoTimer);
      lobby.trial = null;
      io.to(lobby.code).emit(EVENTS.ERROR, {
        message: 'Il round è stato interrotto perché un partecipante chiave si è disconnesso: si passa al prossimo.',
      });
      if (lobby.match) {
        lobby.match.roundIndex += 1;
        setTimeout(() => startRound(lobby), TIMERS.nextRoundDelayMs);
      }
    } else if (lobby.trial && lobby.trial.phase === 'voto') {
      if (lobby.trial.votes.size >= jurySize(lobby)) finalizeVoting(lobby);
    } else if (lobby.state === 'rematch_vote' && lobby.rematchVotes && lobby.rematchVotes.size >= lobby.players.size) {
      resolveRematchVote(lobby);
    }

    cancelCountdownIfNeeded(lobby);
    broadcastPlayers(lobby);
  }

  function attach(socket) {
    socket.on(EVENTS.LOBBY_CREATE, (payload) => handleCreate(socket, payload));
    socket.on(EVENTS.LOBBY_JOIN, (payload) => handleJoin(socket, payload));
    socket.on(EVENTS.LOBBY_LIST_PUBLIC, () => handleListPublic(socket));
    socket.on(EVENTS.LOBBY_SETTINGS_UPDATE, (payload) => handleSettingsUpdate(socket, payload));
    socket.on(EVENTS.LOBBY_START_NOW, () => handleStartNow(socket));
    socket.on(EVENTS.ACCUSA_SUBMIT, (payload) => handleAccusaSubmit(socket, payload));
    socket.on(EVENTS.DIFESA_SUBMIT, (payload) => handleDifesaSubmit(socket, payload));
    socket.on(EVENTS.VOTO_CAST, (payload) => handleVotoCast(socket, payload));
    socket.on(EVENTS.REMATCH_VOTE_CAST, (payload) => handleRematchVote(socket, payload));
    socket.on('disconnect', () => handleDisconnect(socket));
  }

  return { attach, lobbies };
}

module.exports = { createLobbyManager };
