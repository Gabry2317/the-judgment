// Punto di ingresso: collega i pulsanti della UI agli eventi socket e tiene
// lo stato minimo necessario lato client (il server resta l'autorità sulle
// regole di gioco vere e proprie).

(function () {
  const E = JUDGEMENT_CONFIG.EVENTS;
  let myNickname = '';
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
      UI.showView('lobby');
    });

    JudgementSocket.on(E.TRIAL_STARTED, (data) => {
      iAmImputato = data.imputato === myNickname;
      myVote = null;
      UI.renderTrialAccusa(data);
      UI.showView('trial');
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

      const esitoFinale = computeVerdict(votiGiuria, data.votoAI);
      UI.renderVerdict({ ...data, votiGiuria, esitoFinale });
      UI.showView('verdict');
    });

    JudgementSocket.on(E.ERROR, ({ message }) => UI.setHomeError(message));
  }

  // Il voto del giudice AI conta come un giurato aggiuntivo: maggioranza
  // semplice su (giurati umani + 1). In caso di parità l'imputato viene
  // assolto (il beneficio del dubbio prevale).
  function computeVerdict(votiGiuria, votoAI) {
    const condanne = votiGiuria.filter(v => v.decisione === 'condanna').length + (votoAI === 'condanna' ? 1 : 0);
    const assoluzioni = votiGiuria.filter(v => v.decisione === 'assolvi').length + (votoAI === 'assolvi' ? 1 : 0);
    return condanne > assoluzioni ? 'colpevole' : 'assolto';
  }

  function submitEmptyDifesaIfExpired() {
    const text = document.getElementById('input-difesa').value.trim() || '(l\'imputato non ha presentato una difesa in tempo)';
    JudgementSocket.emit(E.DIFESA_SUBMIT, { text });
  }

  function setVoteButtonsEnabled(enabled) {
    document.getElementById('btn-vote-assolvi').disabled = !enabled;
    document.getElementById('btn-vote-condanna').disabled = !enabled;
  }

  // --- Vista lobby: deposito accusa -----------------------------------------

  document.getElementById('btn-submit-accusa').addEventListener('click', () => {
    const text = document.getElementById('input-accusa').value.trim();
    if (!text) return;
    JudgementSocket.emit(E.ACCUSA_SUBMIT, { text });
    document.getElementById('input-accusa').value = '';
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

  // --- Vista verdetto ---------------------------------------------------------

  document.getElementById('btn-next-round').addEventListener('click', () => {
    JudgementSocket.emit(E.TRIAL_NEXT, {});
    UI.showView('lobby');
  });

  UI.showView('home');
})();
