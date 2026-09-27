/* Rhythm-strip drawing shared by the game and the public leaderboard. */
window.Strip = (function () {
  function setup(c) {
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  // one PQRST complex; x in [0,1) -> upward deflection
  function pqrst(x) {
    const g = (m, s, a) => a * Math.exp(-((x - m) ** 2) / (2 * s * s));
    return g(.18, .025, .12) - g(.30, .008, .12) + g(.32, .012, 1) - g(.345, .01, .28) + g(.55, .045, .25);
  }
  function vfib(t) { return .28 * Math.sin(t * 23) + .18 * Math.sin(t * 37 + 1) + .12 * Math.sin(t * 53 + 2); }

  let heroRAF = null;
  // VF -> shock -> sinus, drawn once across the strip
  function hero(canvas) {
    if (!canvas) return;
    const { ctx, w, h } = setup(canvas);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const beatW = 150, amp = h * .36, base = h * .62;
    const yAt = x => x < w * .42 ? base - amp * vfib(x / 40) : x < w * .5 ? base : base - amp * pqrst(((x - w * .5) / beatW) % 1);
    const drawTo = lim => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#ee3c36"; ctx.lineJoin = "round"; ctx.beginPath();
      for (let x = 0; x <= lim; x++) { const y = yAt(x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      if (lim > w * .42) {
        ctx.strokeStyle = "#84d1f5"; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(w * .46, 22); ctx.lineTo(w * .46, h - 10); ctx.stroke();
        ctx.fillStyle = "#84d1f5"; ctx.font = '700 12px "Source Sans 3", Arial, sans-serif';
        ctx.fillText("SHOCK", w * .46 + 6, 18);
      }
    };
    cancelAnimationFrame(heroRAF);
    if (reduce) { drawTo(w); return; }
    const t0 = performance.now();
    const step = t => { const lim = Math.min(w, (t - t0) / 2200 * w); drawTo(lim); if (lim < w) heroRAF = requestAnimationFrame(step); };
    heroRAF = requestAnimationFrame(step);
  }
  return { setup, pqrst, vfib, hero };
})();
