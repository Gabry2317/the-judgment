// Punto di ingresso: collega i pulsanti della UI agli eventi socket e tiene
// lo stato minimo necessario lato client (il server resta l'autorità sulle
// regole di gioco vere e proprie).

(function () {
  const E = JUDGEMENT_CONFIG.EVENTS;
  let myNickname = '';
  let iAmHost = false;
  let iAmImputato = false;
  let myVote = null;
  let countdownHandle = null;
  let gameEventsBound = false;

  function startCountdown(seconds, onExpire) {
    clearInterval(countdownHandle);
    let remaining = seconds;
    UI.setTimer(remaining);
    countdownHandle = setInterval(() => {
      remaining -= 1;
      UI.setTimer(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(countdownHandle);
        if (onExpire) onExpire();
      }
    }, 1000);
  }

  // --- Vista home: tab crea/entra e sotto-tab codice/pubbliche --------------

  function setupTabs(buttonSelector, panelSelector, dataAttr) {
    document.querySelectorAll(buttonSelector).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(buttonSelector).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset[dataAttr];
        document.querySelectorAll(panelSelector).forEach(p => {
          p.classList.toggle('hidden', p.dataset[dataAttr === 'tab' ? 'tabPanel' : 'subtabPanel'] !== target);
        });
      });
    });
  }
  setupTabs('.tab-btn[data-tab]', '[data-tab-panel]', 'tab');
  setupTabs('.tab-btn[data-subtab]', '[data-subtab-panel]', 'subtab');

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
    });

    JudgementSocket.on(E.LOBBY_COUNTDOWN_START, ({ endsAt }) => UI.showCountdown(endsAt));
    JudgementSocket.on(E.LOBBY_COUNTDOWN_CANCEL, () => UI.hideCountdown());

    JudgementSocket.on(E.LOBBY_CLOSED, ({ reason }) => {
      alert('Il tribunale è stato chiuso (' + (reason || 'inattività') + '). Si torna alla home.');
      location.reload();
    });

    JudgementSocket.on(E.MATCH_STARTED, () => {
      UI.hideCountdown();
      UI.showView('trial');
    });

    JudgementSocket.on(E.ROUND_WAITING, ({ roundNumber, totalRounds }) => {
      UI.setRoundLabel(roundNumber, totalRounds);
      UI.showAccusaWaiting();
      UI.setPhase('accusa');
    });

    JudgementSocket.on(E.ROUND_YOUR_TURN, ({ imputato, roundNumber, totalRounds }) => {
      UI.setRoundLabel(roundNumber, totalRounds);
      UI.showAccusaTurn(imputato);
    });

    JudgementSocket.on(E.TRIAL_STARTED, (data) => {
      iAmImputato = data.imputato === myNickname;
      myVote = null;
      UI.renderTrialAccusa(data);
      document.getElementById('evidence-difesa-card').classList.add('hidden');
      UI.setPhase(iAmImputato ? 'difesa-imputato' : 'difesa-attesa');
      if (iAmImputato) startCountdown(JUDGEMENT_CONFIG.TIMERS.difesa, submitEmptyDifesaIfExpired);
    });

    JudgementSocket.on(E.TRIAL_DEFENSE_SUBMITTED, ({ difesa }) => {
      clearInterval(countdownHandle);
      UI.showDifesaEvidence(difesa);
    });

    JudgementSocket.on(E.TRIAL_VOTING_PHASE, () => {
      UI.setPhase('voto');
      UI.setVoteStatus('Leggi accusa e difesa, poi esprimi il tuo giudizio.');
      setVoteButtonsEnabled(!iAmImputato);
      if (!iAmImputato) startCountdown(JUDGEMENT_CONFIG.TIMERS.voto, null);
    });

    JudgementSocket.on(E.TRIAL_AI_JUDGING, () => {
      clearInterval(countdownHandle);
      UI.setPhase('ai');
    });

    JudgementSocket.on(E.TRIAL_VERDICT, (data) => {
      const votiGiuria = [...data.votiGiuria];
      if (!iAmImputato && myVote) votiGiuria.push({ giocatore: myNickname, decisione: myVote });
      UI.renderVerdict({ ...data, votiGiuria });
      UI.showView('verdict');
    });

    JudgementSocket.on(E.MATCH_ENDED, ({ matchNumber, scoreboard }) => {
      UI.renderMatchEnd(matchNumber, scoreboard);
      UI.showView('match-end');
    });

    JudgementSocket.on(E.REMATCH_VOTE_START, ({ endsAt }) => {
      UI.showRematchVote(endsAt);
      setRematchButtonsEnabled(true);
    });

    JudgementSocket.on(E.REMATCH_RESULT, ({ again, yes, no }) => {
      UI.setRematchStatus(again
        ? `Si continua! (${yes} sì, ${no} no)`
        : `Niente rivincita (${yes} sì, ${no} no). Il tribunale chiuderà se resta inattivo.`);
      setRematchButtonsEnabled(false);
    });

    JudgementSocket.on(E.ERROR, ({ message }) => UI.setHomeError(message));
  }

  function submitEmptyDifesaIfExpired() {
    const text = document.getElementById('input-difesa').value.trim() || '(l\'imputato non ha presentato una difesa in tempo)';
    JudgementSocket.emit(E.DIFESA_SUBMIT, { text });
  }

  function setVoteButtonsEnabled(enabled) {
    document.getElementById('btn-vote-assolvi').disabled = !enabled;
    document.getElementById('btn-vote-condanna').disabled = !enabled;
  }

  // --- Pre-lobby: impostazioni host -------------------------------------------

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const minPlayers = parseInt(document.getElementById('input-min-players').value, 10);
    const countdownSeconds = parseInt(document.getElementById('input-countdown-seconds').value, 10);
    JudgementSocket.emit(E.LOBBY_SETTINGS_UPDATE, { minPlayers, countdownSeconds });
  });

  document.getElementById('btn-start-now').addEventListener('click', () => {
    JudgementSocket.emit(E.LOBBY_START_NOW, {});
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
    clearInterval(countdownHandle);
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

  // --- Fine partita: voto rivincita --------------------------------------------

  function setRematchButtonsEnabled(enabled) {
    document.getElementById('btn-rematch-yes').disabled = !enabled;
    document.getElementById('btn-rematch-no').disabled = !enabled;
  }

  document.getElementById('btn-rematch-yes').addEventListener('click', () => {
    JudgementSocket.emit(E.REMATCH_VOTE_CAST, { vote: true });
    setRematchButtonsEnabled(false);
    UI.setRematchStatus('Voto registrato: sì. In attesa degli altri...');
  });

  document.getElementById('btn-rematch-no').addEventListener('click', () => {
    JudgementSocket.emit(E.REMATCH_VOTE_CAST, { vote: false });
    setRematchButtonsEnabled(false);
    UI.setRematchStatus('Voto registrato: no. In attesa degli altri...');
  });

  UI.showView('home');
})();
