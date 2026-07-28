// Se configurato (JUDGEMENT_CONFIG.SERVER_DISCOVERY_URL), all'avvio prova a
// leggere l'indirizzo del server pubblicato dal backend su un Gist GitHub
// pubblico (vedi backend/kitab/cloudflare-tunnel.sh + publish-gist.js) e
// precompila il campo "server" della home, così non serve incollarlo a
// mano ogni volta che il tunnel Cloudflare cambia indirizzo.
//
// Non sovrascrive mai un valore che l'utente ha già scritto di persona.

(function () {
  const url = JUDGEMENT_CONFIG.SERVER_DISCOVERY_URL;
  if (!url) return;

  const input = document.getElementById('input-server-url');
  if (!input) return;

  fetch(url, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('risposta non ok: ' + res.status);
      return res.json();
    })
    .then((data) => {
      if (!data || typeof data.url !== 'string' || !data.url) return;
      if (input.value.trim()) return; // l'utente ha già scritto qualcosa: non tocchiamo
      input.value = data.url;
      input.placeholder = data.url + ' (rilevato automaticamente)';
    })
    .catch((err) => {
      console.warn('[server-discovery] impossibile scoprire l\'indirizzo del server:', err.message);
    });
})();
