// Giudice AI: usa le API Groq (endpoint compatibile OpenAI /chat/completions)
// per analizzare accusa + difesa e produrre un verdetto motivato.
// Se la chiave API manca o la chiamata fallisce, ricade su un verdetto
// neutro generato localmente, così il processo può comunque concludersi.

const { SERVER } = require('./config');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Sei il giudice AI del tribunale virtuale "The Judgement".
Ricevi il testo di un'accusa (spesso assurda, comica o inventata: fa parte del gioco)
e la difesa scritta dall'imputato. Il tuo compito:
1. Valuta la qualità argomentativa della difesa rispetto all'accusa (coerenza,
   creatività, capacità di persuasione), NON la veridicità dei fatti: è un gioco.
2. Scrivi una motivazione breve (massimo 3 frasi), in italiano, con tono da
   giudice: formale ma può essere ironico se il contesto è comico.
3. Esprimi un voto: "assolvi" se la difesa è convincente, "condanna" se non lo è.

Rispondi SOLO con un oggetto JSON valido, senza markdown, senza testo fuori
dal JSON, in questo identico formato:
{"votoAI": "assolvi" | "condanna", "motivazioneAI": "testo della motivazione"}`;

function buildUserPrompt(accusa, difesa) {
  return `ACCUSA:\n${accusa}\n\nDIFESA DELL'IMPUTATO:\n${difesa || '(nessuna difesa presentata in tempo)'}`;
}

function fallbackVerdict(reason) {
  const favorevole = Math.random() > 0.5;
  return {
    votoAI: favorevole ? 'assolvi' : 'condanna',
    motivazioneAI:
      (favorevole
        ? 'In assenza di un\'analisi AI disponibile, il tribunale concede il beneficio del dubbio.'
        : 'In assenza di un\'analisi AI disponibile, il tribunale non ravvisa elementi sufficienti a discolpa.') +
      (reason ? ` (${reason})` : ''),
  };
}

function extractJson(text) {
  if (!text) return null;
  // Rimuove eventuali code fence ```json ... ``` che il modello a volte aggiunge
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function judge({ accusa, difesa }) {
  if (!SERVER.groqApiKey) {
    return fallbackVerdict('GROQ_API_KEY non configurata sul server');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVER.groqApiKey}`,
      },
      body: JSON.stringify({
        model: SERVER.groqModel,
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(accusa, difesa) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('Groq API error', response.status, errText);
      return fallbackVerdict(`errore API Groq (${response.status})`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);

    if (!parsed || (parsed.votoAI !== 'assolvi' && parsed.votoAI !== 'condanna')) {
      console.error('Groq: risposta non valida', content);
      return fallbackVerdict('risposta AI non interpretabile');
    }

    return {
      votoAI: parsed.votoAI,
      motivazioneAI:
        typeof parsed.motivazioneAI === 'string' && parsed.motivazioneAI.trim()
          ? parsed.motivazioneAI.trim().slice(0, 1000)
          : 'Il giudice AI non ha fornito una motivazione dettagliata.',
    };
  } catch (err) {
    console.error('Groq: chiamata fallita', err.message);
    return fallbackVerdict('impossibile contattare le API Groq');
  }
}

module.exports = { judge };
