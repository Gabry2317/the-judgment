// Se configurato (JUDGEMENT_CONFIG.SERVER_DISCOVERY_URL), all'avvio legge
// l'indirizzo del server pubblicato dal backend su un Gist GitHub pubblico
// (vedi backend/kitab/cloudflare-tunnel.sh + publish-gist.js) e lo usa in
// automatico. Il campo "server" non è mai visibile nell'interfaccia: chi
// gioca deve solo inserire il proprio nome.
//
// Se la scoperta fallisce (Gist non raggiungibile, non configurato,
// server offline, ecc.) il client ripiega automaticamente sulla modalità
// demo locale, come già previsto quando l'indirizzo server è vuoto.

(function () {
  const input = document.getElementById('input-server-url');
  if (!input) return;

  // Override manuale per debug/sviluppo: apri il client con
  // ?server=http://localhost:3000 per bypassare la scoperta automatica,
  // senza dover mostrare alcun campo nell'interfaccia.
  const manualOverride = new URLSearchParams(location.search).get('server');
  if (manualOverride) {
    input.value = manualOverride;
    return;
  }

  const url = JUDGEMENT_CONFIG.SERVER_DISCOVERY_URL;
  if (!url) return;

  fetch(url, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('risposta non ok: ' + res.status);
      return res.json();
    })
    .then((data) => {
      if (!data || typeof data.url !== 'string' || !data.url) {
        throw new Error('indirizzo mancante nella risposta');
      }
      input.value = data.url;
    })
    .catch((err) => {
      console.warn('[server-discovery] impossibile scoprire l\'indirizzo del server, si resta in modalità demo:', err.message);
    });
})();
