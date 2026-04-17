/* ───────────────────────────────────────────────────
   PINK CAT — wanders the bottom of the screen,
   escapes off-screen when crawl results arrive.
   Call window.catSpawn() to create a new instance.
─────────────────────────────────────────────────── */
(function () {
  'use strict';

  const CAT_W  = 194;   // cat div width  (must match CSS)
  const WALK_V = 80;    // px/s while wandering
  const RUN_V  = 1400;  // px/s while escaping

  /* ── Create one cat instance ───────────────────── */
  function createCat() {
    // Remove any existing cat first
    const old = document.getElementById('cat');
    if (old) old.remove();

    /* ── Build DOM ─────────────────────────────────── */
    const cat = document.createElement('div');
    cat.id = 'cat';
    cat.innerHTML = `
      <div class="c-wrap">
        <div class="c-shadow"></div>
        <div class="c-tail"></div>
        <div class="c-body">
          <div class="c-leg c-leg-fl"></div>
          <div class="c-leg c-leg-fr"></div>
          <div class="c-leg c-leg-bl"></div>
          <div class="c-leg c-leg-br"></div>
        </div>
        <div class="c-head">
          <div class="c-ear c-ear-l"><span class="c-ear-in"></span></div>
          <div class="c-ear c-ear-r"><span class="c-ear-in"></span></div>
          <div class="c-eye c-eye-l"><span class="c-pupil"></span></div>
          <div class="c-eye c-eye-r"><span class="c-pupil"></span></div>
          <div class="c-nose"></div>
          <div class="c-mouth">ω</div>
          <div class="c-whisker c-wl"></div>
          <div class="c-whisker c-wr"></div>
        </div>
      </div>`;
    document.body.appendChild(cat);

    const wrap = cat.querySelector('.c-wrap');

    /* ── State ─────────────────────────────────────── */
    let x      = rnd(80, window.innerWidth - CAT_W - 80);
    let tX     = x;
    let vel    = 0;
    let state  = 'idle';
    let lastTs = null;
    let tmr    = null;
    let done   = false;

    setX(x);
    face(1);
    setState('idle');

    /* ── Walk in from offscreen ────────────────────── */
    const fromRight = Math.random() > 0.5;
    x   = fromRight ? window.innerWidth + 20 : -CAT_W - 20;
    tX  = rnd(120, window.innerWidth - CAT_W - 120);
    vel = fromRight ? -WALK_V * 1.4 : WALK_V * 1.4;
    face(fromRight ? -1 : 1);
    setX(x);
    setState('walking');

    /* ── RAF tick ──────────────────────────────────── */
    function tick(ts) {
      if (done) return;
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.08);
      lastTs = ts;

      if (vel !== 0) {
        if ((vel > 0 && x >= tX) || (vel < 0 && x <= tX)) {
          x = tX;
          setX(x);
          setState('idle');
          schedule();
        } else {
          x += vel * dt;
          setX(x);
        }
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    /* ── Scheduling ────────────────────────────────── */
    function schedule() {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        if (!done && state === 'idle') wander();
      }, rnd(1400, 4200));
    }

    function wander() {
      const lo = 50, hi = window.innerWidth - CAT_W - 50;
      let t, tries = 0;
      do { t = rnd(lo, hi); } while (Math.abs(t - x) < 90 && ++tries < 12);
      tX  = t;
      vel = t > x ? WALK_V : -WALK_V;
      face(vel > 0 ? 1 : -1);
      setState('walking');
    }

    /* ── Sparkles ──────────────────────────────────── */
    const GLYPHS  = ['✦', '✧', '✶', '⋆', '✦'];
    const COLORS  = ['#FFD700', '#FFC200', '#FFB3C1', '#FF85A1', '#FFD700', '#FF69B4'];
    const sparkleInterval = setInterval(() => {
      if (done) { clearInterval(sparkleInterval); return; }
      if (state !== 'walking' && state !== 'running') return;

      const facingRight = wrap.style.transform !== 'scaleX(-1)';
      // Tail end: left side when facing right, right side when facing left
      const tailX = facingRight
        ? x + 38 + (Math.random() - 0.5) * 14
        : x + CAT_W - 38 + (Math.random() - 0.5) * 14;

      const sp = document.createElement('span');
      sp.className = 'cat-sparkle';
      sp.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      sp.style.color    = COLORS[Math.floor(Math.random() * COLORS.length)];
      sp.style.fontSize = (14 + Math.random() * 12) + 'px';
      sp.style.left     = Math.round(tailX) + 'px';
      // Cat bottom: 0 from viewport bottom. Tail area ~50-90px up.
      sp.style.bottom   = Math.round(50 + Math.random() * 40) + 'px';
      sp.style.setProperty('--sdx', (Math.random() * 18 - 9) + 'px');
      document.body.appendChild(sp);
      setTimeout(() => sp.remove(), 750);
    }, 320);

    /* ── Escape ────────────────────────────────────── */
    function escape() {
      if (done) return;
      done = true;
      clearTimeout(tmr);
      clearInterval(sparkleInterval);
      document.querySelectorAll('.cat-sparkle').forEach(s => s.remove());

      vel = 0;
      setState('idle');

      const LAUNCH_V = 520;   // px/s upward
      const GRAVITY  = 1100;  // px/s²
      const H_SPEED  = 900;   // px/s horizontal

      const distLeft  = x;
      const distRight = window.innerWidth - x - CAT_W;
      const sign      = distLeft < distRight ? -1 : 1;
      face(sign);

      setTimeout(() => {
        cat.classList.add('cat-jump');

        let jumpTs = null;
        const startX = x;

        function jumpTick(ts) {
          if (!jumpTs) jumpTs = ts;
          const t = (ts - jumpTs) / 1000;

          const newX = startX + sign * H_SPEED * t;
          const rise = LAUNCH_V * t - 0.5 * GRAVITY * t * t;

          cat.style.bottom = Math.max(0, rise) + 'px';
          cat.style.left   = Math.round(newX) + 'px';

          const offLeft  = newX + CAT_W < -20;
          const offRight = newX > window.innerWidth + 20;
          if (offLeft || offRight) { cat.remove(); return; }

          requestAnimationFrame(jumpTick);
        }

        requestAnimationFrame(jumpTick);
      }, 60);
    }

    /* ── Helpers ───────────────────────────────────── */
    function setState(s) {
      state = s;
      cat.classList.remove('state-idle', 'state-walking', 'state-running');
      cat.classList.add('state-' + s);
      if (s === 'idle') vel = 0;
    }

    function face(dir) {
      wrap.style.transform = dir === 1 ? 'scaleX(1)' : 'scaleX(-1)';
    }

    function setX(v) { cat.style.left = Math.round(v) + 'px'; }

    /* ── Clamp on resize ───────────────────────────── */
    window.addEventListener('resize', () => {
      if (done) return;
      const maxX = window.innerWidth - CAT_W - 50;
      if (x > maxX) { x = maxX; setX(x); }
    });

    // Expose escape for this instance
    window.catEscape = escape;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Spawn on page load
  createCat();

  // Expose spawn so app.js can call it for each new crawl
  window.catSpawn = createCat;
})();
