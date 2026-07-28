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

  function renderLobby(code, players) {
    document.getElementById('lobby-code').textContent = code;
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

  function renderTrialAccusa({ imputato, accusatore, accusa }) {
    document.getElementById('trial-imputato-name').textContent = imputato;
    document.getElementById('trial-accusatore-name').textContent = accusatore;
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
          <span class="public-lobby-meta">${l.playerCount} in aula &middot; fascicolo n. ${l.caseNumber}</span>
        </span>
        <button class="btn btn-join-small" type="button">Entra</button>
      `;
      li.querySelector('button').addEventListener('click', () => onJoin(l.code));
      list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    showView, setConnectionStatus, setHomeError, renderLobby, renderPublicLobbies,
    renderTrialAccusa, setPhase, showDifesaEvidence, setTimer,
    setVoteStatus, renderVerdict,
  };
})();
