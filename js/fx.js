/* =====================================================================
   The Judgement — fx.js
   Solo effetti visivi: pulviscolo, fasci di luce, onde al click,
   macchina da scrivere, bilancia animata. Nessuna logica di gioco.
   ===================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- 1. Fasci di luce ---------------- */
  function addGodrays() {
    if (reduced) return;
    var d = document.createElement("div");
    d.className = "fx-godrays";
    d.setAttribute("aria-hidden", "true");
    document.body.appendChild(d);
  }

  /* ---------------- 2. Pulviscolo dorato ---------------- */
  function addDust() {
    if (reduced) return;
    var canvas = document.createElement("canvas");
    canvas.id = "fx-dust";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    var motes = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var target = Math.round(Math.min(70, window.innerWidth / 18));
      motes = [];
      for (var i = 0; i < target; i++) motes.push(spawn(true));
    }

    function spawn(anywhere) {
      return {
        x: Math.random() * window.innerWidth,
        y: anywhere ? Math.random() * window.innerHeight : window.innerHeight + 10,
        r: 0.6 + Math.random() * 1.8,
        vy: -(0.08 + Math.random() * 0.28),
        vx: (Math.random() - 0.5) * 0.18,
        a: 0.12 + Math.random() * 0.4,
        ph: Math.random() * Math.PI * 2
      };
    }

    var running = true;
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });

    function frame(t) {
      if (!running) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y += m.vy;
        m.x += m.vx + Math.sin(t / 2600 + m.ph) * 0.16;
        if (m.y < -12) motes[i] = spawn(false);
        var tw = 0.65 + 0.35 * Math.sin(t / 700 + m.ph);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(239,215,155," + (m.a * tw).toFixed(3) + ")";
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(frame);
  }

  /* ---------------- 3. Onda al click sui bottoni ---------------- */
  function addRipples() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".btn");
      if (!btn || reduced) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2.2;
      var r = document.createElement("span");
      r.className = "fx-ripple";
      r.style.width = r.style.height = size + "px";
      r.style.left = (e.clientX - rect.left) + "px";
      r.style.top = (e.clientY - rect.top) + "px";
      btn.appendChild(r);
      setTimeout(function () { r.remove(); }, 620);
    });
  }

  /* ---------------- 4. Bilancia animata (SVG) ---------------- */
  var SCALES_SVG =
    '<svg class="fx-scales" viewBox="0 0 120 76" aria-hidden="true">' +
    '<defs><linearGradient id="fxGold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="76">' +
    '<stop offset="0%" stop-color="#efd79b"/><stop offset="55%" stop-color="#d3a544"/>' +
    '<stop offset="100%" stop-color="#8a651a"/></linearGradient></defs>' +
    '<g stroke="url(#fxGold)" stroke-width="2.4" fill="none" stroke-linecap="round">' +
    '<path d="M60 20 V62"/><path d="M44 66 H76"/><path d="M50 66 q10 -6 20 0"/>' +
    '<g class="beam-group">' +
    '<path d="M22 26 H98"/>' +
    '<g class="pan-left"><path d="M22 26 L14 42 M22 26 L30 42"/><path d="M11 42 q11 12 22 0" fill="rgba(211,165,68,0.18)"/></g>' +
    '<g class="pan-right"><path d="M98 26 L90 42 M98 26 L106 42"/><path d="M87 42 q11 12 22 0" fill="rgba(211,165,68,0.18)"/></g>' +
    '</g>' +
    '<circle cx="60" cy="16" r="4" fill="url(#fxGold)" stroke="none"/>' +
    '</g></svg>';

  function addScales() {
    var lobby = document.querySelector("#view-lobby .dossier");
    if (lobby && !lobby.querySelector(".fx-scales")) {
      var wrap = document.createElement("div");
      wrap.innerHTML = SCALES_SVG;
      lobby.insertBefore(wrap.firstChild, lobby.firstChild);
    }
    var home = document.querySelector("#view-home .dossier .tagline");
    if (home && !document.querySelector("#view-home .fx-divider")) {
      var div = document.createElement("div");
      div.className = "fx-divider";
      div.innerHTML = "<span>Aula n. 07</span>";
      home.parentNode.insertBefore(div, home.nextSibling);
    }
  }

  /* ---------------- 5. Tagline a macchina da scrivere ---------------- */
  function typeTagline() {
    var el = document.querySelector("#view-home .tagline");
    if (!el) return;
    var full = el.textContent.trim();
    if (reduced) return;
    el.textContent = "";
    el.classList.add("fx-typing");
    var i = 0;
    (function step() {
      el.textContent = full.slice(0, ++i);
      if (i < full.length) {
        setTimeout(step, full.charAt(i - 1) === "." ? 180 : 32);
      } else {
        setTimeout(function () { el.classList.remove("fx-typing"); }, 1200);
      }
    })();
  }

  /* ---------------- 6. Stato connessione colorato ---------------- */
  function watchStatus() {
    var el = document.getElementById("connection-status");
    if (!el) return;
    var apply = function () {
      var t = (el.textContent || "").toLowerCase();
      el.classList.toggle("is-online", t.indexOf("non") === -1 && (t.indexOf("conness") !== -1 || t.indexOf("online") !== -1));
      el.classList.toggle("is-offline", t.indexOf("non connesso") !== -1 || t.indexOf("errore") !== -1);
    };
    apply();
    new MutationObserver(apply).observe(el, { childList: true, characterData: true, subtree: true });
  }

  function init() {
    addGodrays();
    addDust();
    addRipples();
    addScales();
    typeTagline();
    watchStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
