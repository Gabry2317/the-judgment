// Astrae la connessione multiplayer: se l'utente indica un indirizzo server,
// prova a usare il vero Socket.IO; altrimenti (o se la connessione fallisce)
// usa il server finto locale, così la UI è sempre testabile.

const JudgementSocket = (() => {
  let backend = null;
  let mode = 'none'; // 'real' | 'mock'

  function loadSocketIoScript(callback) {
    if (window.io) return callback();
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.onload = () => callback();
    script.onerror = () => {
      console.warn('Impossibile caricare Socket.IO, passo alla modalità demo');
      callback(true);
    };
    document.head.appendChild(script);
  }

  function connect({ serverUrl, nickname, joinCode, pubblica, onStatusChange }) {
    if (!serverUrl) {
      mode = 'mock';
      onStatusChange('demo locale');
      backend = createMockServer();
      backend.connect(nickname);
      return;
    }

    loadSocketIoScript((failed) => {
      if (failed || !window.io) {
        mode = 'mock';
        onStatusChange('demo locale (server non raggiungibile)');
        backend = createMockServer();
        backend.connect(nickname);
        return;
      }
      mode = 'real';
      const socket = window.io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3 });
      backend = {
        on: (event, cb) => socket.on(event, cb),
        emit: (event, payload) => socket.emit(event, payload),
      };
      socket.on('connect', () => {
        onStatusChange('connesso');
        const E = JUDGEMENT_CONFIG.EVENTS;
        if (joinCode) socket.emit(E.LOBBY_JOIN, { nickname, code: joinCode });
        else socket.emit(E.LOBBY_CREATE, { nickname, pubblica: !!pubblica });
      });
      socket.on('connect_error', () => onStatusChange('errore di connessione'));
      socket.on('disconnect', () => onStatusChange('disconnesso'));
    });
  }

  // Richiede l'elenco delle lobby pubbliche attive (usata prima ancora di
  // essere entrati in una lobby, quindi passa da un canale a parte).
  function requestPublicLobbies({ serverUrl, onResult }) {
    if (!serverUrl) {
      const tmp = createMockServer();
      tmp.on(JUDGEMENT_CONFIG.EVENTS.LOBBY_LIST_RESULT, ({ lobbies }) => onResult(lobbies));
      tmp.emit(JUDGEMENT_CONFIG.EVENTS.LOBBY_LIST_PUBLIC, {});
      return;
    }
    loadSocketIoScript((failed) => {
      if (failed || !window.io) return onResult([]);
      const socket = window.io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 2 });
      socket.on('connect', () => socket.emit(JUDGEMENT_CONFIG.EVENTS.LOBBY_LIST_PUBLIC, {}));
      socket.on(JUDGEMENT_CONFIG.EVENTS.LOBBY_LIST_RESULT, ({ lobbies }) => { onResult(lobbies); socket.disconnect(); });
      socket.on('connect_error', () => onResult([]));
    });
  }

  function on(event, cb) {
    // in modalità mock il backend potrebbe non esistere ancora nel momento
    // in cui la UI registra i listener: mettiamo in coda finché non è pronto
    const tryBind = () => backend ? backend.on(event, cb) : setTimeout(tryBind, 20);
    tryBind();
  }

  function emit(event, payload) {
    if (backend) backend.emit(event, payload);
  }

  function getMode() { return mode; }

  return { connect, on, emit, getMode, requestPublicLobbies };
})();
