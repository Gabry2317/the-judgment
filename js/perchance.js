// Generazione immagini con l'API di Perchance (https://perchance.org/perchance-ai-api).
//
// Come funziona (API "da browser", senza chiavi): si apre un iframe nascosto
// sull'URL del generatore con la richiesta nella query string e si ascoltano i
// messaggi (postMessage) di risposta. Prima, una volta sola, si "scalda"
// Perchance aprendo https://perchance.org in un iframe (serve per il controllo
// anti-bot).
//
// ATTENZIONE - NON TESTATO CON IL SERVIZIO REALE: la pagina ufficiale
// dell'API non era leggibile quando ho scritto questo file. Sono certi solo:
//   - l'URL https://perchance.org/perchance-ai-api con parametro `prompt`
//     e un `id` scelto da noi;
//   - le risposte arrivano con data.api === 'perchance-image-api' e
//     data.result.id uguale al nostro id.
// Il nome dei parametri extra (negativePrompt, seed) e il campo con l'URL
// dell'immagine sono dedotti: se qualcosa non va apri la console del browser,
// cerca i messaggi "[perchance]" (stampo ogni risposta) e correggi PARAMS /
// extractImageUrl qui sotto. Prova veloce dalla console:
//   PerchanceImage.generate({ prompt: 'a red teapot' }).then(console.log)

const PerchanceImage = (() => {
  const API_URL = 'https://perchance.org/perchance-ai-api'; // alternativa: https://null.perchance.org/perchance-ai-api
  const WARMUP_URL = 'https://perchance.org';
  const PARAMS = { prompt: 'prompt', negativePrompt: 'negativePrompt', seed: 'seed', id: 'id' };
  let warmedAt = 0;

  function hiddenIframe(src) {
    const f = document.createElement('iframe');
    f.src = src;
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;border:0;pointer-events:none;';
    document.body.appendChild(f);
    return f;
  }

  // Da chiamare presto (es. alla connessione): apre Perchance una volta per sessione.
  // `force`: richiamalo quando il server ti sceglie come generatore, così
  // la verifica anti-bot è fresca (si rifà al massimo ogni 10 minuti).
  function warmUp(force) {
    const now = Date.now();
    if (warmedAt && now - warmedAt < (force ? 2 * 60 * 1000 : 10 * 60 * 1000)) return;
    warmedAt = now;
    const f = hiddenIframe(WARMUP_URL);
    setTimeout(() => f.remove(), 15000);
  }

  // Cerca l'URL dell'immagine nella risposta, provando i nomi di campo più probabili.
  function extractImageUrl(result) {
    if (!result) return null;
    const candidates = [result.url, result.imageUrl, result.image, result.src, result.images && result.images[0]];
    for (const c of candidates) {
      const v = typeof c === 'string' ? c : c && c.url;
      if (typeof v === 'string' && /^https:\/\//.test(v)) return v;
    }
    return null;
  }

  // Risolve con l'URL (https) dell'immagine generata, o rifiuta (errore/timeout).
  function generate({ prompt, negativePrompt, seed, timeoutMs = 45000 }) {
    warmUp();
    return new Promise((resolve, reject) => {
      const id = 'jd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const p = new URLSearchParams();
      p.set(PARAMS.id, id);
      p.set(PARAMS.prompt, prompt);
      if (negativePrompt) p.set(PARAMS.negativePrompt, negativePrompt);
      if (Number.isInteger(seed)) p.set(PARAMS.seed, String(seed));

      let frame = null;
      const finish = (fn, value) => {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if (frame) frame.remove();
        fn(value);
      };
      const onMsg = (e) => {
        const d = e.data;
        if (!d || d.api !== 'perchance-image-api' || !d.result || d.result.id !== id) return;
        console.debug('[perchance]', d);
        const err = d.error || d.result.error;
        if (err) return finish(reject, new Error(String(err.message || err)));
        const url = extractImageUrl(d.result);
        if (url) finish(resolve, url);
        // altrimenti potrebbe essere un messaggio di avanzamento: si continua ad aspettare
      };
      const timer = setTimeout(() => finish(reject, new Error('Perchance: tempo scaduto')), timeoutMs);
      window.addEventListener('message', onMsg);
      frame = hiddenIframe(`${API_URL}?${p.toString()}`);
    });
  }

  return { generate, warmUp };
})();
