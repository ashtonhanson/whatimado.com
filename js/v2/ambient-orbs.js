/**
 * Soft sky-blue orbs drift behind the node map band (above the prompt).
 */

/** @typedef {{
 *   el: HTMLElement,
 *   angle: number,
 *   omega: number,
 *   rx: number,
 *   ry: number,
 *   tRx: number,
 *   tRy: number,
 *   scale: number,
 *   tScale: number,
 *   z: number
 * }} OrbState */

const REDUCE_MQ = "(prefers-reduced-motion: reduce)";

/**
 * @param {number} min
 * @param {number} max
 */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Visible constellation band: map stage clipped by the prompt frame top.
 * @param {HTMLElement} main
 */
function mapBandRect(main) {
  const map = document.querySelector("whatimado-map");
  const stage = map?.querySelector(".whatimado-map__stage");
  const frame = document.querySelector("whatimado-frame");
  const mainRect = main.getBoundingClientRect();
  const stageRect = (stage || map)?.getBoundingClientRect();
  if (!stageRect || stageRect.width < 40 || stageRect.height < 40) {
    return { top: 0, left: 0, width: main.clientWidth, height: Math.max(140, main.clientHeight * 0.42) };
  }
  const frameTop = frame?.getBoundingClientRect().top ?? stageRect.bottom;
  const top = Math.max(0, stageRect.top - mainRect.top);
  const left = Math.max(0, stageRect.left - mainRect.left);
  const width = Math.max(40, stageRect.width);
  const bottom = Math.min(stageRect.bottom, frameTop - 4);
  const height = Math.max(100, bottom - stageRect.top);
  return { top, left, width, height };
}

/**
 * @param {HTMLElement} el
 * @param {{ top: number, left: number, width: number, height: number }} band
 */
function placeBandEl(el, band) {
  el.style.top = `${Math.round(band.top)}px`;
  el.style.left = `${Math.round(band.left)}px`;
  el.style.width = `${Math.round(band.width)}px`;
  el.style.height = `${Math.round(band.height)}px`;
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

function shellIsReady() {
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  if (mobile) return document.body.classList.contains("is-mobile-shell-ready");
  return document.body.classList.contains("is-shell-ready");
}

export function initAmbientOrbs() {
  const main = document.querySelector(".v2-main");
  const host = document.querySelector(".v2-ambient-orbs");
  if (!(main instanceof HTMLElement) || !(host instanceof HTMLElement)) return;

  const els = [...host.querySelectorAll(".v2-ambient-orb")].filter(
    (el) => el instanceof HTMLElement
  );
  if (els.length < 2) return;

  /** @type {OrbState[]} */
  const orbs = els.map((el, i) => {
    const phase = i * Math.PI + rand(-0.35, 0.35);
    el.style.zIndex = String(i + 1);
    return {
      el,
      angle: phase,
      omega: (i % 2 === 0 ? 1 : -1) * rand(0.00055, 0.00095),
      rx: 160,
      ry: 90,
      tRx: 160,
      tRy: 90,
      scale: 1,
      tScale: 1,
      z: i + 1
    };
  });

  let raf = 0;
  let lastRetarget = 0;
  let lastSwap = 0;
  let reduced = window.matchMedia(REDUCE_MQ).matches;
  let band = mapBandRect(main);
  let running = false;

  const sizeOrbsToBand = () => {
    /* Larger than the band so soft edges read as a background wash. */
    const base = Math.max(220, Math.min(band.width, band.height) * 1.45);
    orbs.forEach((orb, i) => {
      const dim = Math.round(base * (i === 0 ? 1 : 1.22));
      orb.el.style.width = `${dim}px`;
      orb.el.style.height = `${dim}px`;
    });
  };

  const layoutBand = () => {
    band = mapBandRect(main);
    placeBandEl(host, band);
    sizeOrbsToBand();
  };

  const retargetOrbit = () => {
    const minAxis = Math.min(band.width, band.height);
    for (const orb of orbs) {
      orb.tRx = rand(minAxis * 0.18, minAxis * 0.42);
      orb.tRy = rand(minAxis * 0.14, minAxis * 0.36);
      orb.tScale = rand(0.94, 1.16);
      const dir = orb.omega >= 0 ? 1 : -1;
      orb.omega = dir * rand(0.0005, 0.0011);
    }
  };

  const paintOrb = (orb) => {
    const ow = orb.el.offsetWidth || 280;
    const oh = orb.el.offsetHeight || 280;
    const cx = band.width * 0.5 - ow * 0.5;
    const cy = band.height * 0.5 - oh * 0.5;
    const x = cx + Math.cos(orb.angle) * orb.rx;
    const y = cy + Math.sin(orb.angle) * orb.ry;
    orb.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${orb.scale})`;
  };

  const paintStatic = () => {
    layoutBand();
    orbs.forEach((orb, i) => {
      orb.angle = i * Math.PI + 0.4;
      const minAxis = Math.min(band.width, band.height);
      orb.rx = minAxis * (0.2 + i * 0.08);
      orb.ry = minAxis * (0.14 + i * 0.06);
      orb.scale = 1 + i * 0.04;
      paintOrb(orb);
    });
    shuffleLayers(orbs);
  };

  const tick = (now) => {
    if (reduced || !running) {
      raf = 0;
      return;
    }

    if (now - lastRetarget > 5500) {
      retargetOrbit();
      lastRetarget = now;
    }
    if (now - lastSwap > rand(5000, 9000)) {
      shuffleLayers(orbs);
      lastSwap = now;
    }

    for (const orb of orbs) {
      orb.angle += orb.omega;
      orb.rx += (orb.tRx - orb.rx) * 0.016;
      orb.ry += (orb.tRy - orb.ry) * 0.016;
      orb.scale += (orb.tScale - orb.scale) * 0.025;
      paintOrb(orb);
    }

    raf = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    layoutBand();
    if (!shellIsReady()) {
      running = false;
      return;
    }
    running = true;
    if (reduced) {
      paintStatic();
      return;
    }
    retargetOrbit();
    lastRetarget = performance.now();
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
    layoutBand();
    if (reduced) paintStatic();
    else retargetOrbit();
  });

  const frame = document.querySelector("whatimado-frame");
  if (frame) {
    const mo = new MutationObserver(() => layoutBand());
    mo.observe(frame, { attributes: true, attributeFilter: ["data-snap", "class", "style"] });
  }

  const bodyMo = new MutationObserver(() => {
    if (shellIsReady()) start();
  });
  bodyMo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  start();
}
