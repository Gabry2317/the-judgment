/* =====================================================================
   The Judgement — livello "comfort" lato client.
   Caricato DOPO ui.js/app.js: NON tocca il contratto eventi con il server
   (usa solo gli eventi già esistenti in config.js) e non cambia la logica
   di gioco. Aggiunge solo scorciatoie, feedback e piccole comodità.
   ===================================================================== */

(function () {
  const E = JUDGEMENT_CONFIG.EVENTS;
  const LS = {
    nick: 'judgement:nickname',
    sound: 'judgement:sound',
  };
  const $ = (id) => document.getElementById(id);

  /* ---------------------------------------------------------------- */
  /* Toast                                                             */
  /* ---------------------------------------------------------------- */

  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  document.body.appendChild(toastWrap);

  function toast(message, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.textContent = message;
    toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2600);
  }

  /* ---------------------------------------------------------------- */
  /* Audio: tick del countdown + colpo di martelletto (sintetizzati)   */
  /* ---------------------------------------------------------------- */

  let soundOn = localStorage.getItem(LS.sound) !== '0';
  let audioCtx = null;

  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep({ freq = 660, dur = 0.09, type = 'sine', gain = 0.05 }) {
    if (!soundOn) return;
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  }

  const sfx = {
    tick: () => beep({ freq: 880, dur: 0.06, gain: 0.04 }),
    last: () => beep({ freq: 440, dur: 0.18, type: 'triangle', gain: 0.06 }),
    gavel: () => { beep({ freq: 160, dur: 0.22, type: 'square', gain: 0.07 }); setTimeout(() => beep({ freq: 90, dur: 0.3, type: 'sine', gain: 0.06 }), 90); },
    ok: () => { beep({ freq: 620, dur: 0.08 }); setTimeout(() => beep({ freq: 880, dur: 0.1 }), 90); },
  };

  // Interruttore audio nell'intestazione
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'icon-toggle';
  soundBtn.id = 'btn-sound-toggle';
  function paintSoundBtn() {
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.title = soundOn ? 'Audio attivo — clicca per silenziare' : 'Audio silenziato — clicca per riattivare';
    soundBtn.setAttribute('aria-label', soundBtn.title);
  }
  paintSoundBtn();
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem(LS.sound, soundOn ? '1' : '0');
    paintSoundBtn();
    if (soundOn) sfx.ok();
  });
  const masthead = document.querySelector('.masthead');
  if (masthead) masthead.appendChild(soundBtn);

  /* ---------------------------------------------------------------- */
  /* Home: nickname ricordato, codice da link, invio con Enter         */
  /* ---------------------------------------------------------------- */

  const nickInput = $('input-nickname');
  const codeInput = $('input-join-code');

  const savedNick = localStorage.getItem(LS.nick);
  if (savedNick && nickInput && !nickInput.value) nickInput.value = savedNick;
  if (nickInput) nickInput.addEventListener('input', () => localStorage.setItem(LS.nick, nickInput.value.trim()));

  // Link d'invito: ...index.html?code=ABC123 apre già la scheda giusta
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode && codeInput) {
    codeInput.value = urlCode.toUpperCase().slice(0, 6);
    $('tab-btn-join').click();
    $('subtab-btn-code').click();
    toast('Codice tribunale precompilato dal link');
  }

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join-code').click(); });
  }
  if (nickInput) {
    nickInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const joinPanelVisible = !document.querySelector('[data-tab-panel="join"]').classList.contains('hidden');
      if (joinPanelVisible && codeInput.value.trim()) $('btn-join-code').click();
      else if (!joinPanelVisible) $('btn-create-lobby').click();
      else codeInput.focus();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Lobby: copia codice, link d'invito, presenze                      */
  /* ---------------------------------------------------------------- */

  const lobbyLabel = $('lobby-code') && $('lobby-code').parentElement;
  const shareRow = document.createElement('div');
  shareRow.className = 'share-row';
  shareRow.innerHTML = `
    <button type="button" class="chip-btn" id="btn-copy-code">📋 Copia codice</button>
    <button type="button" class="chip-btn" id="btn-copy-link">🔗 Copia invito</button>
    <button type="button" class="chip-btn hidden" id="btn-share-native">📣 Condividi</button>
  `;
  if (lobbyLabel) lobbyLabel.insertAdjacentElement('afterend', shareRow);

  const presenceChip = document.createElement('p');
  presenceChip.className = 'presence-chip';
  presenceChip.id = 'lobby-presence';
  if (lobbyLabel) shareRow.insertAdjacentElement('afterend', presenceChip);

  function currentCode() { return ($('lobby-code').textContent || '').trim(); }
  function inviteLink() {
    const u = new URL(location.href);
    u.search = '?code=' + currentCode();
    u.hash = '';
    return u.toString();
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label + ' copiato negli appunti', 'ok');
      sfx.ok();
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(label + ' copiato', 'ok'); }
      catch (e) { toast('Copia non riuscita: ' + text); }
      ta.remove();
    }
  }

  $('btn-copy-code').addEventListener('click', () => copy(currentCode(), 'Codice'));
  $('btn-copy-link').addEventListener('click', () => copy(inviteLink(), 'Link d\'invito'));
  if (navigator.share) {
    const sb = $('btn-share-native');
    sb.classList.remove('hidden');
    sb.addEventListener('click', () => {
      navigator.share({
        title: 'The Judgement',
        text: 'Entra nel mio tribunale! Codice: ' + currentCode(),
        url: inviteLink(),
      }).catch(() => {});
    });
  }

  let lastSettings = null;
  let lastPlayers = [];

  function paintPresence() {
    if (!lastPlayers.length) { presenceChip.textContent = ''; return; }
    const min = lastSettings ? lastSettings.minPlayers : null;
    if (!min) { presenceChip.textContent = `${lastPlayers.length} in aula`; return; }
    const mancano = Math.max(0, min - lastPlayers.length);
    presenceChip.classList.toggle('ready', mancano === 0);
    presenceChip.textContent = mancano === 0
      ? `${lastPlayers.length}/${min} in aula — si può iniziare`
      : `${lastPlayers.length}/${min} in aula — manca${mancano === 1 ? '' : 'no'} ${mancano} giocator${mancano === 1 ? 'e' : 'i'}`;
  }

  /* ---------------------------------------------------------------- */
  /* Host: preset dei tempi (usano l'evento di salvataggio esistente)  */
  /* ---------------------------------------------------------------- */

  const T = JUDGEMENT_CONFIG.TIMER_SETTINGS;
  const clamp = (key, v) => Math.min(T[key].max, Math.max(T[key].min, v));

  const PRESETS = {
    lampo: { label: '⚡ Lampo', desc: 'partita veloce', values: { countdownSeconds: 10, accusaTurnoSeconds: 30, difesaSeconds: 40, votoSeconds: 15, verdictSeconds: 5, matchEndSeconds: 6, rivinctaSeconds: 8 } },
    classico: { label: '⚖️ Classico', desc: 'ritmo standard', values: null },
    epico: { label: '🏛️ Epico', desc: 'processi lunghi', values: { countdownSeconds: 30, accusaTurnoSeconds: 120, difesaSeconds: 180, votoSeconds: 60, verdictSeconds: 10, matchEndSeconds: 15, rivinctaSeconds: 30 } },
  };

  const FIELD_BY_KEY = {
    countdownSeconds: 'input-countdown-seconds',
    accusaTurnoSeconds: 'input-accusa-seconds',
    difesaSeconds: 'input-difesa-seconds',
    votoSeconds: 'input-voto-seconds',
    verdictSeconds: 'input-verdict-seconds',
    matchEndSeconds: 'input-matchend-seconds',
    rivinctaSeconds: 'input-rivincta-seconds',
  };

  function currentSettingsPayload() {
    const payload = { minPlayers: parseInt($('input-min-players').value, 10) };
    Object.keys(FIELD_BY_KEY).forEach(k => { payload[k] = parseInt($(FIELD_BY_KEY[k]).value, 10); });
    return payload;
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    Object.keys(FIELD_BY_KEY).forEach((k) => {
      const v = preset.values ? preset.values[k] : T[k].def;
      $(FIELD_BY_KEY[k]).value = clamp(k, v);
    });
    // stesso evento di sempre: è solo il pulsante "Salva" premuto per te
    JudgementSocket.emit(E.LOBBY_SETTINGS_UPDATE, currentSettingsPayload());
    toast('Preset ' + preset.label + ' applicato e salvato', 'ok');
    sfx.ok();
  }

  const timerPanel = document.querySelector('[data-stab-panel="timer"]');
  if (timerPanel) {
    const presetRow = document.createElement('div');
    presetRow.className = 'preset-row';
    presetRow.innerHTML = '<span class="preset-caption">Preset rapidi</span>';
    Object.keys(PRESETS).forEach((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn preset-btn';
      b.innerHTML = `${PRESETS[name].label}<small>${PRESETS[name].desc}</small>`;
      b.addEventListener('click', () => applyPreset(name));
      presetRow.appendChild(b);
    });
    timerPanel.insertBefore(presetRow, timerPanel.firstChild);

    // Riepilogo "durata stimata di un round" che si aggiorna mentre modifichi
    const estimate = document.createElement('p');
    estimate.className = 'hint estimate-hint';
    timerPanel.appendChild(estimate);
    function paintEstimate() {
      const s = currentSettingsPayload();
      const perRound = (s.accusaTurnoSeconds || 0) + (s.difesaSeconds || 0) + (s.votoSeconds || 0) + (s.verdictSeconds || 0);
      const players = Math.max(2, parseInt($('input-min-players').value, 10) || 2);
      const total = perRound * players;
      const mm = Math.round(total / 60);
      estimate.textContent = `Stima: ~${Math.round(perRound)}s a round · una partita da ${players} giocatori dura circa ${mm} minut${mm === 1 ? 'o' : 'i'} (tempi massimi).`;
    }
    timerPanel.addEventListener('input', paintEstimate);
    $('input-min-players').addEventListener('input', paintEstimate);
    paintEstimate();
  }

  // Feedback sui pulsanti host esistenti (nessun nuovo evento)
  $('btn-save-settings').addEventListener('click', () => { toast('Impostazioni inviate al tribunale', 'ok'); sfx.ok(); });
  $('btn-start-now').addEventListener('click', () => toast('Avvio del processo richiesto…'));

  /* ---------------------------------------------------------------- */
  /* Timer: barra di avanzamento + urgenza                             */
  /* ---------------------------------------------------------------- */

  const TIMERS = [
    { id: 'trial-timer', anchor: () => $('trial-timer').closest('.dossier-label') },
    { id: 'lobby-countdown-text', anchor: () => $('lobby-countdown-status') },
    { id: 'matchend-timer', anchor: () => $('matchend-timer').closest('p') },
    { id: 'verdict-timer', anchor: () => $('verdict-timer').closest('p') },
    { id: 'rivincta-timer', anchor: () => $('rivincta-timer').closest('p') },
  ];

  const barState = {};
  TIMERS.forEach(t => {
    const anchor = t.anchor();
    if (!anchor) return;
    const bar = document.createElement('div');
    bar.className = 'timer-bar';
    bar.innerHTML = '<span></span>';
    anchor.insertAdjacentElement('afterend', bar);
    barState[t.id] = { bar, fill: bar.firstElementChild, total: 0, endsAt: 0, lastWhole: null };
  });

  setInterval(() => {
    TIMERS.forEach((t) => {
      const el = $(t.id);
      const st = barState[t.id];
      if (!el || !st) return;
      const paused = el.dataset.paused === '1';
      const endsAt = parseInt(el.dataset.endsAt, 10);
      const visible = el.offsetParent !== null;

      if (!visible || (!endsAt && !paused)) { st.bar.classList.remove('active'); el.classList.remove('is-urgent'); return; }

      if (endsAt && endsAt !== st.endsAt && !paused) {
        st.endsAt = endsAt;
        st.total = Math.max(1000, endsAt - Date.now());
        st.lastWhole = null;
      }

      const remaining = paused
        ? parseInt(el.dataset.remainingMs, 10) || 0
        : Math.max(0, st.endsAt - Date.now());

      const pct = st.total ? Math.max(0, Math.min(100, (remaining / st.total) * 100)) : 0;
      st.bar.classList.add('active');
      st.bar.classList.toggle('paused', paused);
      st.fill.style.width = pct + '%';
      st.bar.classList.toggle('warn', remaining <= 10000 && remaining > 5000);
      st.bar.classList.toggle('danger', remaining <= 5000);

      const urgent = !paused && remaining > 0 && remaining <= 5000;
      el.classList.toggle('is-urgent', urgent);

      const whole = Math.ceil(remaining / 1000);
      if (urgent && whole !== st.lastWhole) {
        st.lastWhole = whole;
        if (whole <= 3) sfx.last(); else sfx.tick();
      }
      if (!urgent) st.lastWhole = null;
    });
  }, 200);

  /* ---------------------------------------------------------------- */
  /* Testi: contatore caratteri e invio con Ctrl+Invio                 */
  /* ---------------------------------------------------------------- */

  function wireTextarea(taId, btnId) {
    const ta = $(taId);
    const btn = $(btnId);
    if (!ta || !btn) return;
    const counter = document.createElement('span');
    counter.className = 'char-counter';
    ta.closest('.field').appendChild(counter);
    const max = parseInt(ta.getAttribute('maxlength'), 10) || 500;
    function paint() {
      const n = ta.value.length;
      counter.textContent = `${n}/${max} · Ctrl+Invio per inviare`;
      counter.classList.toggle('near', n > max * 0.9);
      btn.disabled = ta.value.trim().length === 0;
    }
    ta.addEventListener('input', paint);
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && ta.value.trim()) btn.click();
    });
    btn.addEventListener('click', () => setTimeout(paint, 0));
    paint();
  }
  wireTextarea('input-accusa', 'btn-submit-accusa');
  wireTextarea('input-difesa', 'btn-submit-difesa');

  /* ---------------------------------------------------------------- */
  /* Scorciatoie da tastiera                                           */
  /* ---------------------------------------------------------------- */

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();

    const votingVisible = !$('jury-voting').classList.contains('hidden') && $('view-trial').classList.contains('active');
    if (votingVisible) {
      if (k === 'a' && !$('btn-vote-assolvi').disabled) { $('btn-vote-assolvi').click(); sfx.ok(); }
      if (k === 'c' && !$('btn-vote-condanna').disabled) { $('btn-vote-condanna').click(); sfx.ok(); }
    }

    const rematchVisible = !$('rematch-vote-block').classList.contains('hidden') && $('view-match-end').classList.contains('active');
    if (rematchVisible) {
      if (k === 's' && !$('btn-rematch-si').disabled) $('btn-rematch-si').click();
      if (k === 'n' && !$('btn-rematch-no').disabled) $('btn-rematch-no').click();
    }

    if (k === 'm') soundBtn.click();
    if (k === 'p') {
      const btn = [...document.querySelectorAll('.btn-pause')].find(b => !b.classList.contains('hidden') && b.offsetParent !== null);
      if (btn) btn.click();
    }
  });

  // Legenda scorciatoie sotto il voto della giuria
  const juryHint = document.createElement('p');
  juryHint.className = 'hint shortcut-hint';
  juryHint.innerHTML = 'Scorciatoie: <kbd>A</kbd> assolvi · <kbd>C</kbd> condanna · <kbd>M</kbd> audio';
  const jury = $('jury-voting');
  if (jury) jury.appendChild(juryHint);

  /* ---------------------------------------------------------------- */
  /* Aggancio non invasivo al rendering della UI                       */
  /* ---------------------------------------------------------------- */

  function wrap(name, after) {
    const original = UI[name];
    if (typeof original !== 'function') return;
    UI[name] = function (...args) {
      const out = original.apply(this, args);
      try { after.apply(this, args); } catch (err) { console.warn('[enhancements]', name, err); }
      return out;
    };
  }

  function decoratePlayers(players) {
    lastPlayers = players || [];
    paintPresence();
    // evidenzia "tu" nella lista
    const myName = (nickInput && nickInput.value.trim()) || '';
    [...document.querySelectorAll('#player-list li')].forEach((li, i) => {
      const p = lastPlayers[i];
      if (p && myName && p.nome === myName) {
        li.classList.add('is-me');
        if (!li.querySelector('.tag-me')) {
          const tag = document.createElement('span');
          tag.className = 'tag-me';
          tag.textContent = 'tu';
          li.appendChild(tag);
        }
      }
    });
  }

  wrap('renderPlayerList', decoratePlayers);


  wrap('renderLobbySettings', (settings, isHost) => {
    lastSettings = settings;
    paintPresence();
    shareRow.classList.remove('hidden');
    document.body.classList.toggle('is-host', !!isHost);
    if (isHost && !shareRow.dataset.hostToasted) {
      shareRow.dataset.hostToasted = '1';
      toast('Sei l\'host: puoi regolare tempi e preset', 'ok');
    }
  });

  wrap('renderLobby', (code, players) => {
    presenceChip.classList.remove('ready');
    decoratePlayers(players);
    toast('Tribunale ' + code + ' — condividi il codice con gli amici');
  });


  wrap('setPhase', (phase) => {
    if (phase === 'difesa-imputato') setTimeout(() => $('input-difesa').focus(), 120);
    if (phase === 'voto') sfx.tick();
  });

  wrap('showAccusaTurn', () => {
    setTimeout(() => $('input-accusa').focus(), 120);
    toast('Tocca a te: scrivi l\'accusa');
  });

  wrap('renderVerdict', ({ esitoFinale }) => {
    sfx.gavel();
    toast(esitoFinale === 'assolto' ? 'Verdetto: assolto' : 'Verdetto: colpevole', esitoFinale === 'assolto' ? 'ok' : 'bad');
  });

  wrap('setConnectionStatus', (text) => {
    const el = $('connection-status');
    el.classList.toggle('is-live', /connesso/i.test(text) && !/non/i.test(text));
    el.classList.toggle('is-demo', /demo/i.test(text));
  });

  wrap('renderMatchEnd', () => toast('Partita conclusa: ecco la classifica'));
})();
