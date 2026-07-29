#!/usr/bin/env node
// Pubblica l'indirizzo corrente del tunnel Cloudflare su un Gist GitHub
// pubblico, così il client (statico, su GitHub Pages) può scoprirlo da solo
// senza che tu debba incollarlo a mano ogni volta che cambia.
//
// Uso: node publish-gist.js "https://xxxx.trycloudflare.com"
//
// Richiede nel .env del backend:
//   CLOUDFLARE_GIST_ID     id del Gist (dalla sua URL)
//   CLOUDFLARE_GIST_TOKEN  Personal Access Token GitHub con solo scope "gist"
//   CLOUDFLARE_GIST_FILENAME  nome del file dentro il Gist (default: judgement-server.json)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const GIST_ID = process.env.CLOUDFLARE_GIST_ID;
const GIST_TOKEN = process.env.CLOUDFLARE_GIST_TOKEN;
const GIST_FILENAME = process.env.CLOUDFLARE_GIST_FILENAME || 'judgement-server.json';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('[publish-gist] Uso: node publish-gist.js <url-tunnel>');
    process.exit(1);
  }
  if (!GIST_ID || !GIST_TOKEN) {
    console.error('[publish-gist] CLOUDFLARE_GIST_ID o CLOUDFLARE_GIST_TOKEN mancanti nel .env: salto la pubblicazione automatica.');
    console.error('[publish-gist] Il tunnel resta comunque attivo: incolla questo indirizzo a mano nel client:');
    console.error(`[publish-gist]   ${url}`);
    process.exit(0);
  }

  const content = JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2);

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'the-judgement-kitab',
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[publish-gist] Errore GitHub API (${res.status}): ${errText}`);
      process.exit(1);
    }

    console.log(`[publish-gist] Indirizzo pubblicato con successo sul Gist: ${url}`);
  } catch (err) {
    console.error('[publish-gist] Impossibile contattare l\'API GitHub:', err.message);
    process.exit(1);
  }
}

main();
