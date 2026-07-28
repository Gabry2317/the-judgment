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

  // --- Pre-lobby: impostazioni host, sola lettura, countdown ---------------

  function renderLobbySettings(settings, isHost) {
    document.getElementById('lobby-settings-host').classList.toggle('hidden', !isHost);
    document.getElementById('lobby-settings-readonly').classList.toggle('hidden', isHost);
    if (isHost) {
      document.getElementById('input-min-players').value = settings.minPlayers;
      document.getElementById('input-countdown-seconds').value = settings.countdownSeconds;
    } else {
      document.getElementById('lobby-settings-readonly').textContent =
        `Si parte automaticamente con almeno ${settings.minPlayers} giocatori (attesa di ${settings.countdownSeconds}s), oppure quando l'host avvia subito.`;
    }
  }

  function showCountdown(endsAt) {
    const el = document.getElementById('lobby-countdown-status');
    el.classList.remove('hidden');
    el.dataset.endsAt = endsAt;
  }

  function hideCountdown() {
    const el = document.getElementById('lobby-countdown-status');
    el.classList.add('hidden');
    el.textContent = '';
  }

  function tickCountdown() {
    const el = document.getElementById('lobby-countdown-status');
    if (el.classList.contains('hidden') || !el.dataset.endsAt) return;
    const secondsLeft = Math.max(0, Math.ceil((parseInt(el.dataset.endsAt, 10) - Date.now()) / 1000));
    el.textContent = `Si parte tra ${secondsLeft}s...`;
  }
  setInterval(tickCountdown, 500);

  // --- Round: turno di accusa / attesa --------------------------------------

  function setRoundLabel(roundNumber, totalRounds) {
    document.getElementById('round-number').textContent = roundNumber;
    document.getElementById('round-total').textContent = totalRounds;
  }

  function showAccusaTurn(imputatoNome) {
    document.getElementById('accusa-target-name').textContent = imputatoNome;
    document.getElementById('accusa-writer').classList.remove('hidden');
    document.getElementById('accusa-waiting').classList.add('hidden');
    document.getElementById('evidence-accusa-card').classList.add('hidden');
    document.getElementById('evidence-difesa-card').classList.add('hidden');
  }

  function showAccusaWaiting() {
    document.getElementById('accusa-writer').classList.add('hidden');
    document.getElementById('accusa-waiting').classList.remove('hidden');
    document.getElementById('evidence-accusa-card').classList.add('hidden');
    document.getElementById('evidence-difesa-card').classList.add('hidden');
  }

  function renderTrialAccusa({ imputato, accusa }) {
    document.getElementById('accusa-writer').classList.add('hidden');
    document.getElementById('accusa-waiting').classList.add('hidden');
    document.getElementById('evidence-accusa-card').classList.remove('hidden');
    document.getElementById('trial-imputato-name').textContent = imputato;
    document.getElementById('trial-accusa-text').textContent = accusa;
    document.getElementById('trial-phase-label').textContent = 'lettura accusa';
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

  function setTimer(seconds) {
    document.getElementById('trial-timer').textContent = seconds !== null ? seconds + 's' : '--';
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
    // forza il reflow per far ripartire l'animazione del timbro ad ogni verdetto
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

  function renderMatchEnd(matchNumber, scoreboard) {
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

    document.getElementById('rematch-panel').classList.add('hidden');
    document.getElementById('rematch-status').textContent = '';
  }

  function showRematchVote(endsAt) {
    const panel = document.getElementById('rematch-panel');
    panel.classList.remove('hidden');
    panel.dataset.endsAt = endsAt;
    document.getElementById('rematch-status').textContent = '';
  }

  function tickRematchTimer() {
    const panel = document.getElementById('rematch-panel');
    if (panel.classList.contains('hidden') || !panel.dataset.endsAt) return;
    const secondsLeft = Math.max(0, Math.ceil((parseInt(panel.dataset.endsAt, 10) - Date.now()) / 1000));
    document.getElementById('rematch-timer').textContent = `Tempo per votare: ${secondsLeft}s`;
  }
  setInterval(tickRematchTimer, 500);

  function setRematchStatus(text) {
    document.getElementById('rematch-status').textContent = text;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    showView, setConnectionStatus, setHomeError, renderLobby, renderPlayerList, renderPublicLobbies,
    renderLobbySettings, showCountdown, hideCountdown,
    setRoundLabel, showAccusaTurn, showAccusaWaiting,
    renderTrialAccusa, setPhase, showDifesaEvidence, setTimer,
    setVoteStatus, renderVerdict,
    renderMatchEnd, showRematchVote, setRematchStatus,
  };
})();
