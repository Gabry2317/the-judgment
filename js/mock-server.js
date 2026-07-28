// Simulazione locale del server, usata quando il campo "server" è vuoto.
// Riproduce lo stesso contratto eventi del backend reale (vedi config.js),
// così l'interfaccia si comporta in modo identico e il passaggio al vero
// server Socket.IO più avanti richiede zero modifiche alla UI.

function createMockServer() {
  const E = JUDGEMENT_CONFIG.EVENTS;
  const listeners = {};
  const BOT_NAMES = ['Emily', 'Stefano', 'Valter'];
  const FAKE_PUBLIC_LOBBIES = [
    { code: 'FR3SCA', host: 'Marco', playerCount: 3, caseNumber: 2 },
    { code: 'PIZZA7', host: 'Sara', playerCount: 5, caseNumber: 1 },
  ];

  let state = null;

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }

  function emitToClient(event, payload) {
    (listeners[event] || []).forEach(cb => setTimeout(() => cb(payload), 0));
  }

  function resetLobby(nickname) {
    state = {
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      players: [{ id: 'me', nome: nickname }, ...BOT_NAMES.map((n, i) => ({ id: 'bot' + i, nome: n }))],
      caseNumber: 1,
      accusa: null,
      difesa: null,
    };
  }

  function startTrial() {
    // In demo l'imputato è sempre il giocatore reale, per poter provare
    // il flusso completo di scrittura della difesa.
    state.accusa = {
      testo: 'Ha lasciato il forno acceso tutta la notte mentre la casa dormiva.',
      accusatore: BOT_NAMES[0],
      imputato: state.players[0].nome,
    };
    emitToClient(E.TRIAL_STARTED, {
      imputato: state.accusa.imputato,
      accusatore: state.accusa.accusatore,
      accusa: state.accusa.testo,
    });
  }

  function handleDifesaSubmit(payload) {
    state.difesa = payload.text;
    emitToClient(E.TRIAL_DEFENSE_SUBMITTED, { difesa: payload.text });

    setTimeout(() => {
      emitToClient(E.TRIAL_VOTING_PHASE, {});
      // i bot votano dopo un breve ritardo, per simulare la giuria reale
      setTimeout(() => runAiJudge(), 3500);
    }, 600);
  }

  function runAiJudge() {
    emitToClient(E.TRIAL_AI_JUDGING, {});
    setTimeout(() => {
      const botVotes = BOT_NAMES.map(n => ({
        giocatore: n,
        decisione: Math.random() > 0.5 ? 'assolvi' : 'condanna',
      }));
      const aiFavorevole = Math.random() > 0.4;

      emitToClient(E.TRIAL_VERDICT, {
        accusa: state.accusa.testo,
        difesa: state.difesa,
        votiGiuria: botVotes, // il voto del giocatore reale viene aggiunto da app.js
        votoAI: aiFavorevole ? 'assolvi' : 'condanna',
        motivazioneAI: aiFavorevole
          ? 'La difesa presenta una spiegazione coerente e plausibile; non emergono contraddizioni sostanziali nella ricostruzione dei fatti.'
          : 'La difesa non affronta in modo convincente il punto centrale dell\'accusa e presenta incongruenze logiche.',
      });
    }, 2200);
  }

  return {
    connect(nickname) {
      resetLobby(nickname);
      setTimeout(() => {
        emitToClient(E.LOBBY_JOINED, { code: state.code, players: state.players });
        setTimeout(() => startTrial(), 1200);
      }, 300);
    },
    on,
    emit(event, payload) {
      if (event === E.DIFESA_SUBMIT) handleDifesaSubmit(payload);
      if (event === E.VOTO_CAST) { /* il voto del giocatore è già incluso nel verdetto finale in app.js */ }
      if (event === E.TRIAL_NEXT) startTrial();
      if (event === E.LOBBY_LIST_PUBLIC) {
        setTimeout(() => emitToClient(E.LOBBY_LIST_RESULT, { lobbies: FAKE_PUBLIC_LOBBIES }), 400);
      }
    },
  };
}
