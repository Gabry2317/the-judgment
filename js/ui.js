// Funzioni di rendering pure: leggono dati e aggiornano il DOM.
// Nessuna logica di gioco qui dentro, solo presentazione.

const UI = (() => {
  function showView(name) {
    document.querySelectorAll('.view').forEach(el => {
      el.classList.toggle('active', el.dataset.view === name);
    });
  }

  function setConnectionStatus(text) {
    document.getElementById('connection-status').textContent = text;
  }

  function setHomeError(msg) {
    document.getElementById('home-error').textContent = msg || '';
  }

  function renderPlayerList(players) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    players.forEach((p, i) => {
      const li = document.createElement('li');
      const initial = p.nome.trim().charAt(0).toUpperCase() || '?';
      li.innerHTML = `<span class="avatar">
          <img src="assets/images/avatar-${(i % 6) + 1}.png" alt="" onerror="this.remove()">
          <span class="avatar-initial">${initial}</span>
        </span>
        <span>${escapeHtml(p.nome)}</span>`;
      list.appendChild(li);
    });
  }

  function renderLobby(code, players) {
    document.getElementById('lobby-code').textContent = code;
    renderPlayerList(players);
  }

  // --- Pre-lobby: impostazioni host, sola lettura ---------------------------

  function renderLobbySettings(settings, isHost) {
    document.getElementById('lobby-settings-host').classList.toggle('hidden', !isHost);
    document.getElementById('lobby-settings-readonly').classList.toggle('hidden', isHost);
    if (isHost) {
      document.getElementById('input-min-players').value = settings.minPlayers;
      document.getElementById('input-countdown-seconds').value = settings.countdownSeconds;
      document.getElementById('input-accusa-seconds').value = settings.accusaTurnoSeconds;
      document.getElementById('input-difesa-seconds').value = settings.difesaSeconds;
      document.getElementById('input-voto-seconds').value = settings.votoSeconds;
      document.getElementById('input-verdict-seconds').value = settings.verdictSeconds;
      document.getElementById('input-matchend-seconds').value = settings.matchEndSeconds;
    } else {
      document.getElementById('lobby-settings-readonly').innerHTML =
        `Minimo <strong>${settings.minPlayers}</strong> giocatori, avvio dopo <strong>${settings.countdownSeconds}s</strong> di attesa.<br>
         Tempi di questa partita: accusa <strong>${settings.accusaTurnoSeconds}s</strong> &middot;
         difesa <strong>${settings.difesaSeconds}s</strong> &middot;
         voto <strong>${settings.votoSeconds}s</strong> &middot;
         verdetto <strong>${settings.verdictSeconds}s</strong> &middot;
         classifica <strong>${settings.matchEndSeconds}s</strong>.`;
    }
  }

  // --- Timer generici basati su "endsAt", con supporto pausa ----------------
  // Ogni elemento timer gestito ha: dataset.endsAt (quando scatta) e
  // dataset.paused ('1'/'0') + dataset.remainingMs (se in pausa).

  function setTimerRunning(textEl, endsAt) {
    textEl.dataset.paused = '0';
    textEl.dataset.endsAt = endsAt;
  }

  function setTimerPaused(textEl, remainingMs) {
    textEl.dataset.paused = '1';
    textEl.dataset.remainingMs = remainingMs;
  }

  function tickTimerElement(el) {
    if (!el || !el.dataset.endsAt && el.dataset.paused !== '1') return;
    let seconds;
    if (el.dataset.paused === '1') {
      seconds = Math.ceil(parseInt(el.dataset.remainingMs, 10) / 1000);
    } else {
      seconds = Math.max(0, Math.ceil((parseInt(el.dataset.endsAt, 10) - Date.now()) / 1000));
    }
    el.textContent = isNaN(seconds) ? '--' : seconds + 's';
  }

  setInterval(() => {
    tickTimerElement(document.getElementById('trial-timer'));
    tickTimerElement(document.getElementById('lobby-countdown-text'));
    tickTimerElement(document.getElementById('matchend-timer'));
    tickTimerElement(document.getElementById('verdict-timer'));
  }, 500);

  function showCountdown(endsAt) {
    const wrap = document.getElementById('lobby-countdown-status');
    wrap.classList.remove('hidden');
    setTimerRunning(document.getElementById('lobby-countdown-text'), endsAt);
  }

  function hideCountdown() {
    document.getElementById('lobby-countdown-status').classList.add('hidden');
  }

  const PAUSE_TARGETS = {
    countdown: { timerEl: 'lobby-countdown-text', btnId: 'btn-pause-countdown', bannerId: null },
    accusa: { timerEl: 'trial-timer', btnId: 'btn-pause-trial', bannerId: 'pause-banner' },
    difesa: { timerEl: 'trial-timer', btnId: 'btn-pause-trial', bannerId: 'pause-banner' },
    voto: { timerEl: 'trial-timer', btnId: 'btn-pause-trial', bannerId: 'pause-banner' },
    verdetto: { timerEl: 'verdict-timer', btnId: 'btn-pause-verdict', bannerId: 'pause-banner-verdict' },
    match_end: { timerEl: 'matchend-timer', btnId: 'btn-pause-matchend', bannerId: 'pause-banner-matchend' },
  };

  function setHostVisibilityForPauseButtons(isHost) {
    Object.values(PAUSE_TARGETS).forEach(t => {
      const btn = document.getElementById(t.btnId);
      if (btn) btn.classList.toggle('hidden', !isHost);
    });
  }

  function applyPauseState(phase, paused, endsAt, remainingMs) {
    const target = PAUSE_TARGETS[phase];
    if (!target) return;
    const el = document.getElementById(target.timerEl);
    if (el) {
      if (paused) setTimerPaused(el, remainingMs);
      else setTimerRunning(el, endsAt);
    }
    if (target.bannerId) {
      const banner = document.getElementById(target.bannerId);
      if (banner) banner.classList.toggle('hidden', !paused);
    }
    const btn = document.getElementById(target.btnId);
    if (btn) {
      btn.classList.toggle('is-paused', !!paused);
      btn.textContent = paused ? '▶' : '⏸';
    }
  }

  // --- Round: turno di accusa / attesa --------------------------------------

  function setRoundLabel(roundNumber, totalRounds) {
    document.getElementById('round-number').textContent = roundNumber;
    document.getElementById('round-total').textContent = totalRounds;
  }

  function showAccusaTurn(imputatoNome, endsAt) {
    document.getElementById('accusa-target-name').textContent = imputatoNome;
    document.getElementById('accusa-writer').classList.remove('hidden');
    document.getElementById('accusa-waiting').classList.add('hidden');
    document.getElementById('evidence-accusa-card').classList.add('hidden');
    document.getElementById('evidence-difesa-card').classList.add('hidden');
    setTimerRunning(document.getElementById('trial-timer'), endsAt);
    document.getElementById('pause-banner').classList.add('hidden');
  }

  function showAccusaWaiting() {
    document.getElementById('accusa-writer').classList.add('hidden');
    document.getElementById('accusa-waiting').classList.remove('hidden');
    document.getElementById('evidence-accusa-card').classList.add('hidden');
    document.getElementById('evidence-difesa-card').classList.add('hidden');
    document.getElementById('trial-timer').textContent = '--';
    document.getElementById('pause-banner').classList.add('hidden');
  }

  function renderTrialAccusa({ imputato, accusa, endsAt }) {
    document.getElementById('accusa-writer').classList.add('hidden');
    document.getElementById('accusa-waiting').classList.add('hidden');
    document.getElementById('evidence-accusa-card').classList.remove('hidden');
    document.getElementById('trial-imputato-name').textContent = imputato;
    document.getElementById('trial-accusa-text').textContent = accusa;
    document.getElementById('trial-phase-label').textContent = 'lettura accusa';
    if (endsAt) setTimerRunning(document.getElementById('trial-timer'), endsAt);
  }

  function setPhase(phase) {
    const map = { accusa: 'accusa', difesa: 'difesa', voto: 'voto della giuria', ai: 'giudizio AI' };
    document.getElementById('trial-phase-label').textContent = map[phase] || phase;

    document.getElementById('defense-writer').classList.toggle('hidden', phase !== 'difesa-imputato');
    document.getElementById('defense-waiting').classList.toggle('hidden', phase !== 'difesa-attesa');
    document.getElementById('jury-voting').classList.toggle('hidden', phase !== 'voto');
    document.getElementById('ai-judging').classList.toggle('hidden', phase !== 'ai');
  }

  function showDifesaEvidence(text) {
    document.getElementById('evidence-difesa-card').classList.remove('hidden');
    document.getElementById('trial-difesa-text').textContent = text;
  }

  function setVotingTimer(endsAt) {
    setTimerRunning(document.getElementById('trial-timer'), endsAt);
  }

  function clearTrialTimer() {
    const el = document.getElementById('trial-timer');
    el.textContent = '--';
    delete el.dataset.endsAt;
    el.dataset.paused = '0';
  }

  function setVoteStatus(text) {
    document.getElementById('vote-status').textContent = text;
  }

  function renderVerdict({ accusa, difesa, votiGiuria, votoAI, motivazioneAI, esitoFinale }) {
    document.getElementById('recap-accusa').textContent = accusa;
    document.getElementById('recap-difesa').textContent = difesa;
    document.getElementById('recap-ai-motivazione').textContent = motivazioneAI;
    document.getElementById('recap-ai-voto').textContent = votoAI === 'assolvi' ? 'favorevole' : 'contrario';

    const list = document.getElementById('recap-vote-list');
    list.innerHTML = '';
    votiGiuria.forEach(v => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(v.giocatore)}</span><span>${v.decisione === 'assolvi' ? 'assolve' : 'condanna'}</span>`;
      list.appendChild(li);
    });

    const stamp = document.getElementById('verdict-stamp');
    const stampText = document.getElementById('stamp-text');
    const assolto = esitoFinale === 'assolto';
    stampText.textContent = assolto ? 'ASSOLTO' : 'COLPEVOLE';
    stamp.classList.toggle('stamp-guilty', !assolto);
    stamp.classList.remove('show');
    void stamp.offsetWidth;
    requestAnimationFrame(() => stamp.classList.add('show'));

    const illustration = document.getElementById('verdict-illustration');
    illustration.parentElement.style.display = '';
    illustration.src = `assets/images/verdict-${assolto ? 'assolto' : 'colpevole'}.png`;

    if (assolto) Confetti.burst();
  }

  function renderPublicLobbies(lobbies, onJoin) {
    const list = document.getElementById('public-lobby-list');
    const empty = document.getElementById('public-lobby-empty');
    list.innerHTML = '';
    empty.classList.toggle('hidden', lobbies.length > 0);
    lobbies.forEach(l => {
      const li = document.createElement('li');
      li.className = 'public-lobby-item';
      li.innerHTML = `
        <span class="public-lobby-info">
          <span class="public-lobby-host">Tribunale di ${escapeHtml(l.host)}</span>
          <span class="public-lobby-meta">${l.playerCount} in aula &middot; minimo ${l.minPlayers} per iniziare</span>
        </span>
        <button class="btn btn-join-small" type="button">Entra</button>
      `;
      li.querySelector('button').addEventListener('click', () => onJoin(l.code));
      list.appendChild(li);
    });
  }

  // --- Fine partita: classifica e voto rivincita ----------------------------

  function renderMatchEnd(matchNumber, scoreboard, endsAt) {
    document.getElementById('match-end-number').textContent = matchNumber;
    const table = document.getElementById('scoreboard-table');
    const totalMatches = Math.max(matchNumber, ...scoreboard.map(r => r.matches.length), 1);

    let html = '<thead><tr><th>Giocatore</th>';
    for (let i = 1; i <= totalMatches; i++) html += `<th>Partita ${i}</th>`;
    html += '</tr></thead><tbody>';
    scoreboard.forEach(row => {
      html += `<tr><td>${escapeHtml(row.nome)}</td>`;
      for (let i = 0; i < totalMatches; i++) {
        const esito = row.matches[i];
        const cls = esito === 'assolto' ? 'sb-assolto' : esito === 'colpevole' ? 'sb-colpevole' : 'sb-vuoto';
        html += `<td class="${cls}">${esito ? (esito === 'assolto' ? 'Assolto' : 'Colpevole') : '&mdash;'}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;

    document.getElementById('pause-banner-matchend').classList.add('hidden');
    setMatchEndStatus('');
    setTimerRunning(document.getElementById('matchend-timer'), endsAt);
  }

  function setMatchEndStatus(text) {
    document.getElementById('matchend-status').textContent = text;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    showView, setConnectionStatus, setHomeError, renderLobby, renderPlayerList, renderPublicLobbies,
    renderLobbySettings, showCountdown, hideCountdown, setHostVisibilityForPauseButtons, applyPauseState,
    setRoundLabel, showAccusaTurn, showAccusaWaiting,
    renderTrialAccusa, setPhase, showDifesaEvidence, setVotingTimer, clearTrialTimer,
    setVoteStatus, renderVerdict,
    renderMatchEnd, setMatchEndStatus,
  };
})();
