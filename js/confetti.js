// Coriandoli leggeri in puro DOM/CSS, nessuna libreria esterna: funzionano
// anche aprendo il sito con file:// senza connessione a internet.

const Confetti = (() => {
  const COLORS = ['#2b3a55', '#b3503f', '#3f7d63', '#b8892b'];

  function burst(count = 26) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      const duration = 1.8 + Math.random() * 1.2;
      piece.style.animationDuration = duration + 's';
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 0.3) * 1000);
    }
  }

  return { burst };
})();
