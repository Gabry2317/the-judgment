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
      document.getElementById('input-rivincta-seconds').value = settings.rivinctaSeconds;
    } else {
      document.getElementById('lobby-settings-readonly').innerHTML =
        `Minimo <strong>${settings.minPlayers}</strong> giocatori, avvio dopo <strong>${settings.countdownSeconds}s</strong> di attesa.<br>
         Tempi di questa partita: accusa <strong>${settings.accusaTurnoSeconds}s</strong> &middot;
         difesa <strong>${settings.difesaSeconds}s</strong> &middot;
         voto <strong>${settings.votoSeconds}s</strong> &middot;
         verdetto <strong>${settings.verdictSeconds}s</strong> &middot;
         classifica <strong>${settings.matchEndSeconds}s</strong> &middot;
         voto rivincita <strong>${settings.rivinctaSeconds}s</strong>.`;
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
    tickTimerElement(document.getElementById('rivincta-timer'));
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
    imprevisto: { timerEl: 'trial-timer', btnId: 'btn-pause-trial', bannerId: 'pause-banner' },
    voto: { timerEl: 'trial-timer', btnId: 'btn-pause-trial', bannerId: 'pause-banner' },
    verdetto: { timerEl: 'verdict-timer', btnId: 'btn-pause-verdict', bannerId: 'pause-banner-verdict' },
    match_end: { timerEl: 'matchend-timer', btnId: 'btn-pause-matchend', bannerId: 'pause-banner-matchend' },
    rivincita: { timerEl: 'rivincta-timer', btnId: 'btn-pause-rivincta', bannerId: 'pause-banner-rivincta' },
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
    const map = { accusa: 'accusa', difesa: 'difesa', imprevisto: 'imprevisto', voto: 'voto della giuria', ai: 'giudizio AI' };
    document.getElementById('trial-phase-label').textContent = map[phase] || phase;

    document.getElementById('defense-writer').classList.toggle('hidden', phase !== 'difesa-imputato');
    document.getElementById('defense-waiting').classList.toggle('hidden', phase !== 'difesa-attesa');
    document.getElementById('imprevisto-waiting').classList.toggle('hidden', phase !== 'imprevisto-attesa');
    document.getElementById('giornalista-writer').classList.toggle('hidden', phase !== 'imprevisto-giornalista');
    document.getElementById('jury-voting').classList.toggle('hidden', phase !== 'voto');
    document.getElementById('ai-judging').classList.toggle('hidden', phase !== 'ai');
  }

  function showDifesaEvidence(text) {
    document.getElementById('evidence-difesa-card').classList.remove('hidden');
    document.getElementById('trial-difesa-text').textContent = text;
  }

  // --- Imprevisti ----------------------------------------------------------

  function showImprevistoWaiting(tipo, autore) {
    const el = document.getElementById('imprevisto-waiting-text');
    const dots = '<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    el.innerHTML = tipo === 'foto'
      ? `Lia sta sviluppando una foto appena depositata agli atti${dots}`
      : `${escapeHtml(autore || 'Un cronista')} sta scrivendo un titolo di giornale sul caso${dots}`;
    document.getElementById('evidence-imprevisto-card').classList.add('hidden');
  }

  // Il cronista non ha libertà di parola: puo' solo riempire gli spazi vuoti
  // del titolo scriptato. Qui costruiamo la frase alternando testo e input.
  function renderGiornalistaTemplate(parts) {
    const wrap = document.getElementById('giornalista-template');
    wrap.innerHTML = '';
    parts.forEach((part, i) => {
      wrap.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'blank-input';
        input.maxLength = 120;
        input.dataset.blankIndex = String(i);
        input.placeholder = '...';
        wrap.appendChild(input);
      }
    });
  }

  function readGiornalistaBlanks() {
    return [...document.querySelectorAll('#giornalista-template .blank-input')].map(i => i.value);
  }

  function showImprevistoEvidence({ tipo, testo, autore }) {
    const card = document.getElementById('evidence-imprevisto-card');
    card.classList.remove('hidden');
    document.getElementById('imprevisto-label').textContent = tipo === 'foto'
      ? '📷 Foto agli atti (descritta da Lia)'
      : `📰 Titolo di giornale${autore ? ' — cronista: ' + autore : ''}`;
    document.getElementById('imprevisto-text').textContent = testo || '-';
  }

  function renderRecapImprevisto(imprevisto) {
    const card = document.getElementById('recap-imprevisto-card');
    if (!card) return;
    if (!imprevisto || !imprevisto.testo) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    document.getElementById('recap-imprevisto-label').textContent = imprevisto.tipo === 'foto'
      ? '📷 Imprevisto: foto agli atti (Lia)'
      : `📰 Imprevisto: titolo di giornale${imprevisto.autore ? ' — ' + imprevisto.autore : ''}`;
    document.getElementById('recap-imprevisto-text').textContent = imprevisto.testo;
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

  function renderVerdict({ accusa, difesa, imprevisto, votiGiuria, votoAI, motivazioneAI, esitoFinale, orientamentoGiuria, ribaltamento }) {
    document.getElementById('recap-accusa').textContent = accusa;
    document.getElementById('recap-difesa').textContent = difesa;
    renderRecapImprevisto(imprevisto);
    document.getElementById('recap-ai-motivazione').textContent = motivazioneAI;
    document.getElementById('recap-ai-voto').textContent = votoAI === 'assolvi' ? 'ASSOLVE' : 'CONDANNA';

    const overrideEl = document.getElementById('recap-ai-override');
    if (overrideEl) {
      if (ribaltamento) {
        overrideEl.textContent = orientamentoGiuria === 'assolto'
          ? '⚖️ La giuria era favorevole, ma il giudice ha ribaltato il verdetto: decide lui.'
          : '⚖️ La giuria era contraria, ma il giudice ha ribaltato il verdetto: decide lui.';
        overrideEl.classList.remove('hidden');
      } else {
        overrideEl.textContent = '';
        overrideEl.classList.add('hidden');
      }
    }

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

    document.getElementById('matchend-countdown-block').classList.remove('hidden');
    document.getElementById('rematch-vote-block').classList.add('hidden');
  }

  function setMatchEndStatus(text) {
    document.getElementById('matchend-status').textContent = text;
  }

  // --- Fase di voto rivincita, subito dopo la classifica --------------------

  function renderRematchVote(endsAt) {
    document.getElementById('matchend-countdown-block').classList.add('hidden');
    document.getElementById('rematch-vote-block').classList.remove('hidden');
    document.getElementById('pause-banner-rivincta').classList.add('hidden');
    setRematchStatus('');
    setRematchButtonsEnabled(true);
    setTimerRunning(document.getElementById('rivincta-timer'), endsAt);
  }

  function setRematchStatus(text) {
    document.getElementById('rematch-status').textContent = text;
  }

  function setRematchButtonsEnabled(enabled) {
    document.getElementById('btn-rematch-si').disabled = !enabled;
    document.getElementById('btn-rematch-no').disabled = !enabled;
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
    showImprevistoWaiting, renderGiornalistaTemplate, readGiornalistaBlanks, showImprevistoEvidence,
    setVoteStatus, renderVerdict,
    renderMatchEnd, setMatchEndStatus,
    renderRematchVote, setRematchStatus, setRematchButtonsEnabled,
  };
})();
