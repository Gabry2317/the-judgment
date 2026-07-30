// Punto di ingresso: collega i pulsanti della UI agli eventi socket.
// I timer sono guidati dal server (ogni evento porta un "endsAt" assoluto),
// così pausa/ripresa lato host restano sempre sincronizzate per tutti.

(function () {
  const E = JUDGEMENT_CONFIG.EVENTS;
  let myNickname = '';
  let iAmHost = false;
  let iAmImputato = false;
  let myVote = null;
  let gameEventsBound = false;

  // --- Vista home: tab crea/entra e sotto-tab codice/pubbliche --------------

  function setupTabs(buttonSelector, panelAttr, dataAttr) {
    document.querySelectorAll(buttonSelector).forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.tab-switch');
        group.querySelectorAll(buttonSelector).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset[dataAttr];
        // i pannelli non sono necessariamente dentro lo stesso contenitore del tab-switch
        document.querySelectorAll(`[${panelAttr}]`).forEach(p => {
          const belongsToThisGroup = p.parentElement === group.parentElement || p.closest('.dossier') === group.closest('.dossier');
          if (belongsToThisGroup) p.classList.toggle('hidden', p.getAttribute(panelAttr) !== target);
        });
      });
    });
  }
  setupTabs('.tab-btn[data-tab]', 'data-tab-panel', 'tab');
  setupTabs('.tab-btn[data-subtab]', 'data-subtab-panel', 'subtab');
  setupTabs('.tab-btn[data-stab]', 'data-stab-panel', 'stab');

  document.getElementById('btn-create-lobby').addEventListener('click', () => {
    const pubblica = document.getElementById('input-public-toggle').checked;
    tryConnect(null, pubblica);
  });
  document.getElementById('btn-join-code').addEventListener('click', () => {
    const code = document.getElementById('input-join-code').value.trim().toUpperCase();
    if (!code) return UI.setHomeError('Inserisci il codice del tribunale.');
    tryConnect(code, false);
  });
  document.getElementById('btn-refresh-public').addEventListener('click', () => {
    const nickname = document.getElementById('input-nickname').value.trim();
    if (!nickname) return UI.setHomeError('Inserisci un nome prima di cercare le lobby pubbliche.');
    UI.setHomeError('');
    const serverUrl = document.getElementById('input-server-url').value.trim();
    JudgementSocket.requestPublicLobbies({
      serverUrl,
      onResult: (lobbies) => UI.renderPublicLobbies(lobbies, (code) => tryConnect(code, false)),
    });
  });

  function tryConnect(joinCode, pubblica) {
    myNickname = document.getElementById('input-nickname').value.trim();
    if (!myNickname) return UI.setHomeError('Inserisci un nome prima di continuare.');
    UI.setHomeError('');

    const serverUrl = document.getElementById('input-server-url').value.trim();
    JudgementSocket.connect({
      serverUrl, nickname: myNickname, joinCode, pubblica,
      onStatusChange: UI.setConnectionStatus,
    });
    if (!gameEventsBound) { bindGameEvents(); gameEventsBound = true; }
  }

  // --- Eventi di gioco (validi sia in modalità reale che demo) -------------

  function bindGameEvents() {
    JudgementSocket.on(E.LOBBY_JOINED, ({ code, players }) => {
      UI.renderLobby(code, players);
      UI.hideCountdown();
      UI.showView('lobby');
    });

    JudgementSocket.on(E.LOBBY_PLAYERS, (players) => {
      UI.renderPlayerList(players);
    });

    JudgementSocket.on(E.LOBBY_SETTINGS, (settings) => {
      iAmHost = settings.hostId === JudgementSocket.getMyId();
      UI.renderLobbySettings(settings, iAmHost);
      UI.setHostVisibilityForPauseButtons(iAmHost);
    });

    JudgementSocket.on(E.LOBBY_COUNTDOWN_START, ({ endsAt }) => UI.showCountdown(endsAt));
    JudgementSocket.on(E.LOBBY_COUNTDOWN_CANCEL, () => UI.hideCountdown());

    JudgementSocket.on(E.LOBBY_PAUSE_STATE, ({ paused, phase, endsAt, remainingMs }) => {
      UI.applyPauseState(phase, paused, endsAt, remainingMs);
    });

    JudgementSocket.on(E.MATCH_STARTED, () => {
      UI.hideCountdown();
      UI.showView('trial');
    });

    JudgementSocket.on(E.ROUND_WAITING, ({ roundNumber, totalRounds }) => {
      UI.showView('trial');
      UI.setRoundLabel(roundNumber, totalRounds);
      UI.showAccusaWaiting();
      UI.setPhase('accusa');
    });

    JudgementSocket.on(E.ROUND_YOUR_TURN, ({ imputato, roundNumber, totalRounds, endsAt }) => {
      UI.showView('trial');
      UI.setRoundLabel(roundNumber, totalRounds);
      UI.showAccusaTurn(imputato, endsAt);
    });

    JudgementSocket.on(E.TRIAL_STARTED, (data) => {
      iAmImputato = data.imputato === myNickname;
      myVote = null;
      UI.renderTrialAccusa(data);
      document.getElementById('evidence-difesa-card').classList.add('hidden');
      UI.setPhase(iAmImputato ? 'difesa-imputato' : 'difesa-attesa');
    });

    JudgementSocket.on(E.TRIAL_DEFENSE_SUBMITTED, ({ difesa }) => {
      UI.showDifesaEvidence(difesa);
    });

    JudgementSocket.on(E.TRIAL_VOTING_PHASE, ({ endsAt }) => {
      UI.setPhase('voto');
      UI.setVoteStatus('Leggi accusa e difesa, poi esprimi il tuo giudizio.');
      UI.setVotingTimer(endsAt);
      setVoteButtonsEnabled(!iAmImputato);
    });

    JudgementSocket.on(E.TRIAL_AI_JUDGING, () => {
      UI.setPhase('ai');
      UI.clearTrialTimer();
    });

    JudgementSocket.on(E.TRIAL_VERDICT, (data) => {
      const votiGiuria = [...data.votiGiuria];
      if (!iAmImputato && myVote) votiGiuria.push({ giocatore: myNickname, decisione: myVote });
      UI.renderVerdict({ ...data, votiGiuria });
      UI.applyPauseState('verdetto', false, data.endsAt);
      UI.showView('verdict');
    });

    JudgementSocket.on(E.MATCH_ENDED, ({ matchNumber, scoreboard, endsAt }) => {
      UI.renderMatchEnd(matchNumber, scoreboard, endsAt);
      UI.setMatchEndStatus('Tra poco si vota per la rivincita.');
      UI.showView('match-end');
    });

    JudgementSocket.on(E.REMATCH_PHASE, ({ endsAt }) => {
      UI.renderRematchVote(endsAt);
    });

    JudgementSocket.on(E.LOBBY_RETURN, ({ code, players, settings }) => {
      UI.renderLobby(code, players);
      iAmHost = settings.hostId === JudgementSocket.getMyId();
      UI.renderLobbySettings(settings, iAmHost);
      UI.setHostVisibilityForPauseButtons(iAmHost);
      UI.hideCountdown();
      UI.showView('lobby');
    });

    JudgementSocket.on(E.ERROR, ({ message }) => UI.setHomeError(message));
  }

  function setVoteButtonsEnabled(enabled) {
    document.getElementById('btn-vote-assolvi').disabled = !enabled;
    document.getElementById('btn-vote-condanna').disabled = !enabled;
  }

  // --- Pre-lobby: impostazioni host (tab Giocatori / Timer) -------------------

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_SETTINGS_UPDATE, {
      minPlayers: parseInt(document.getElementById('input-min-players').value, 10),
      countdownSeconds: parseInt(document.getElementById('input-countdown-seconds').value, 10),
      accusaTurnoSeconds: parseInt(document.getElementById('input-accusa-seconds').value, 10),
      difesaSeconds: parseInt(document.getElementById('input-difesa-seconds').value, 10),
      votoSeconds: parseInt(document.getElementById('input-voto-seconds').value, 10),
      verdictSeconds: parseInt(document.getElementById('input-verdict-seconds').value, 10),
      matchEndSeconds: parseInt(document.getElementById('input-matchend-seconds').value, 10),
      rivinctaSeconds: parseInt(document.getElementById('input-rivincta-seconds').value, 10),
    });
  });

  document.getElementById('btn-start-now').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_START_NOW, {});
  });

  document.getElementById('btn-pause-countdown').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_PAUSE_TOGGLE, {});
  });
  document.getElementById('btn-pause-trial').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_PAUSE_TOGGLE, {});
  });
  document.getElementById('btn-pause-verdict').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_PAUSE_TOGGLE, {});
  });
  document.getElementById('btn-pause-matchend').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_PAUSE_TOGGLE, {});
  });
  document.getElementById('btn-pause-rivincta').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_PAUSE_TOGGLE, {});
  });

  // --- Round: deposito accusa (solo a chi ha il turno) ------------------------

  document.getElementById('btn-submit-accusa').addEventListener('click', () => {
    const input = document.getElementById('input-accusa');
    const text = input.value.trim();
    if (!text) return;
    JudgementSocket.emit(E.ACCUSA_SUBMIT, { text });
    input.value = '';
  });

  // --- Vista processo: difesa e voto -----------------------------------------

  document.getElementById('btn-submit-difesa').addEventListener('click', () => {
    const text = document.getElementById('input-difesa').value.trim();
    if (!text) return;
    JudgementSocket.emit(E.DIFESA_SUBMIT, { text });
  });

  document.getElementById('btn-vote-assolvi').addEventListener('click', () => castVote('assolvi'));
  document.getElementById('btn-vote-condanna').addEventListener('click', () => castVote('condanna'));

  function castVote(decisione) {
    if (myVote) return;
    myVote = decisione;
    JudgementSocket.emit(E.VOTO_CAST, { decisione });
    setVoteButtonsEnabled(false);
    UI.setVoteStatus('Voto registrato: ' + (decisione === 'assolvi' ? 'assolvi' : 'condanna') + '. In attesa degli altri.');
  }

  // --- Fine partita: voto rivincita --------------------------------------

  document.getElementById('btn-rematch-si').addEventListener('click', () => castRematchVote('si'));
  document.getElementById('btn-rematch-no').addEventListener('click', () => castRematchVote('no'));

  function castRematchVote(vuole) {
    JudgementSocket.emit(E.REMATCH_CAST, { vuole });
    UI.setRematchButtonsEnabled(false);
    UI.setRematchStatus(vuole === 'si' ? 'Hai votato: rivincita! In attesa degli altri.' : 'Hai votato: basta così. In attesa degli altri.');
  }

  // --- Fine partita: si riparte in automatico, niente da fare qui -------------

  UI.showView('home');
})();
