/**
 * Random sky-blue orb drift behind the node map.
 * Orbs stay in .v2-main under whatimado-map, wander independently, and swap layer order.
 */

/** @typedef {{ el: HTMLElement, x: number, y: number, tx: number, ty: number, scale: number, tScale: number, speed: number, z: number }} OrbState */

const REDUCE_MQ = "(prefers-reduced-motion: reduce)";

/**
 * @param {number} min
 * @param {number} max
 */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} orbEl
 */
function pickTarget(host, orbEl) {
  const hw = host.clientWidth || 1;
  const hh = host.clientHeight || 1;
  const ow = orbEl.offsetWidth || 320;
  const oh = orbEl.offsetHeight || 320;
  /* Keep most of the glow inside the map visual band; allow dipping behind the prompt. */
  const maxX = Math.max(8, hw - ow * 0.35);
  const maxY = Math.max(8, hh - oh * 0.25);
  return {
    x: rand(-ow * 0.2, maxX),
    y: rand(-oh * 0.12, maxY * 0.92),
    scale: rand(0.88, 1.14)
  };
}

/**
 * @param {OrbState[]} orbs
 */
function shuffleLayers(orbs) {
  const order = orbs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  order.forEach((orbIndex, z) => {
    const orb = orbs[orbIndex];
    if (!orb) return;
    orb.z = z + 1;
    orb.el.style.zIndex = String(orb.z);
  });
}

export function initAmbientOrbs() {
  const host = document.querySelector(".v2-ambient-orbs");
  if (!(host instanceof HTMLElement)) return;

  const els = [...host.querySelectorAll(".v2-ambient-orb")].filter(
    (el) => el instanceof HTMLElement
  );
  if (els.length < 2) return;

  /** @type {OrbState[]} */
  const orbs = els.map((el, i) => {
    const start = pickTarget(host, el);
    el.style.transform = `translate3d(${start.x}px, ${start.y}px, 0) scale(${start.scale})`;
    el.style.zIndex = String(i + 1);
    return {
      el,
      x: start.x,
      y: start.y,
      tx: start.x,
      ty: start.y,
      scale: start.scale,
      tScale: start.scale,
      speed: rand(0.008, 0.018),
      z: i + 1
    };
  });

  let raf = 0;
  let lastSwap = performance.now();
  let reduced = window.matchMedia(REDUCE_MQ).matches;

  const retarget = () => {
    for (const orb of orbs) {
      const next = pickTarget(host, orb.el);
      orb.tx = next.x;
      orb.ty = next.y;
      orb.tScale = next.scale;
      orb.speed = rand(0.007, 0.02);
    }
  };

  const paintStatic = () => {
    orbs.forEach((orb, i) => {
      const parked =
        i === 0
          ? { x: host.clientWidth * 0.08, y: host.clientHeight * 0.12, scale: 1 }
          : { x: host.clientWidth * 0.42, y: host.clientHeight * 0.28, scale: 1.05 };
      orb.x = parked.x;
      orb.y = parked.y;
      orb.scale = parked.scale;
      orb.el.style.transform = `translate3d(${parked.x}px, ${parked.y}px, 0) scale(${parked.scale})`;
    });
    shuffleLayers(orbs);
  };

  const tick = (now) => {
    if (reduced) {
      raf = 0;
      return;
    }

    for (const orb of orbs) {
      const dx = orb.tx - orb.x;
      const dy = orb.ty - orb.y;
      const ds = orb.tScale - orb.scale;
      orb.x += dx * orb.speed;
      orb.y += dy * orb.speed;
      orb.scale += ds * orb.speed;
      orb.el.style.transform = `translate3d(${orb.x}px, ${orb.y}px, 0) scale(${orb.scale})`;

      if (Math.hypot(dx, dy) < 18 && Math.abs(ds) < 0.02) {
        const next = pickTarget(host, orb.el);
        orb.tx = next.x;
        orb.ty = next.y;
        orb.tScale = next.scale;
        orb.speed = rand(0.007, 0.02);
      }
    }

    if (now - lastSwap > rand(5200, 11000)) {
      shuffleLayers(orbs);
      lastSwap = now;
    }

    raf = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    if (reduced) {
      paintStatic();
      return;
    }
    retarget();
    lastSwap = performance.now();
    raf = window.requestAnimationFrame(tick);
  };

  const mq = window.matchMedia(REDUCE_MQ);
  const onMotionChange = () => {
    reduced = mq.matches;
    start();
  };
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", onMotionChange);
  else mq.addListener?.(onMotionChange);

  window.addEventListener("resize", () => {
    if (reduced) paintStatic();
    else retarget();
  });

  start();
}
