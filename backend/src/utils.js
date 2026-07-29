const { LIMITS } = require('./config');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O/1/I ambigui

function generateCode(existingCodes) {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

// Rimuove tag HTML basilari e limita la lunghezza, per evitare injection
// nel DOM lato client (che fa comunque escapeHtml, ma difesa in profondità)
// e per evitare payload abnormi.
function sanitizeText(raw, maxLen) {
  if (typeof raw !== 'string') return '';
  const stripped = raw.replace(/<[^>]*>/g, '').trim();
  return stripped.slice(0, maxLen);
}

function sanitizeNickname(raw) {
  const clean = sanitizeText(raw, LIMITS.nicknameMaxLen);
  return clean || null;
}

// Rate limiter minimale in-memory: una entry per (socketId, azione).
function createRateLimiter(cooldownMs) {
  const lastAction = new Map();
  return function allow(socketId, action) {
    const key = socketId + ':' + action;
    const now = Date.now();
    const last = lastAction.get(key) || 0;
    if (now - last < cooldownMs) return false;
    lastAction.set(key, now);
    return true;
  };
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

module.exports = {
  generateCode,
  sanitizeText,
  sanitizeNickname,
  createRateLimiter,
  pickRandom,
};
