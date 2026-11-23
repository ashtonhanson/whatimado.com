/**
 * Sky-blue orbs cycle smoothly behind the node map band (above the prompt).
 * A matching context frame lights when a framed chat section is open.
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
 *   phase: number,
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
    return { top: 0, left: 0, width: main.clientWidth, height: Math.max(120, main.clientHeight * 0.4) };
  }
  const frameTop = frame?.getBoundingClientRect().top ?? stageRect.bottom;
  const top = Math.max(0, stageRect.top - mainRect.top);
  const left = Math.max(0, stageRect.left - mainRect.left);
  const width = Math.max(40, stageRect.width);
  const bottom = Math.min(stageRect.bottom, frameTop - 8);
  const height = Math.max(80, bottom - stageRect.top);
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

/** Framed chat sections that already carry an open-context highlight. */
export function framedOpenContextActive() {
  return Boolean(
    document.querySelector(
      "#mission-stages .v2-mission.is-open-context:not(.is-done) .v2-mission-done-acc__bar"
    ) ||
      document.querySelector(".v2-path-card.is-open-context") ||
      document.querySelector("#selection-panel.is-open-context")
  );
}

/** Show/hide the map-band frame that mirrors the open chat section. */
export function syncMapContextFrame() {
  const frame = document.querySelector(".v2-map-context-frame");
  if (!(frame instanceof HTMLElement)) return;
  frame.classList.toggle("is-active", framedOpenContextActive());
}

export function initAmbientOrbs() {
  const main = document.querySelector(".v2-main");
  const host = document.querySelector(".v2-ambient-orbs");
  const contextFrame = document.querySelector(".v2-map-context-frame");
  if (!(main instanceof HTMLElement) || !(host instanceof HTMLElement)) return;

  const els = [...host.querySelectorAll(".v2-ambient-orb")].filter(
    (el) => el instanceof HTMLElement
  );
  if (els.length < 2) return;

  /** @type {OrbState[]} */
  const orbs = els.map((el, i) => {
    const phase = i * Math.PI + rand(-0.2, 0.2);
    el.style.zIndex = String(i + 1);
    return {
      el,
      angle: phase,
      omega: (i % 2 === 0 ? 1 : -1) * rand(0.00035, 0.00055),
      rx: 120,
      ry: 70,
      tRx: 120,
      tRy: 70,
      scale: 1,
      tScale: 1,
      phase,
      z: i + 1
    };
  });

  let raf = 0;
  let lastRetarget = 0;
  let lastSwap = 0;
  let reduced = window.matchMedia(REDUCE_MQ).matches;
  let band = mapBandRect(main);

  const sizeOrbsToBand = () => {
    const minAxis = Math.max(120, Math.min(band.width, band.height));
    const base = minAxis * 0.7;
    orbs.forEach((orb, i) => {
      const dim = Math.round(base * (i === 0 ? 1 : 1.18));
      orb.el.style.width = `${dim}px`;
      orb.el.style.height = `${dim}px`;
    });
  };

  const layoutBand = () => {
    band = mapBandRect(main);
    placeBandEl(host, band);
    sizeOrbsToBand();
    if (contextFrame instanceof HTMLElement) {
      const inset = Math.max(8, Math.min(18, band.width * 0.02));
      placeBandEl(contextFrame, {
        top: band.top + inset,
        left: band.left + inset,
        width: Math.max(40, band.width - inset * 2),
        height: Math.max(40, band.height - inset * 2)
      });
    }
  };

  const retargetOrbit = () => {
    const minAxis = Math.min(band.width, band.height);
    for (const orb of orbs) {
      /* Keep travel inside the band so overflow:hidden does not erase them. */
      orb.tRx = rand(minAxis * 0.06, minAxis * 0.18);
      orb.tRy = rand(minAxis * 0.05, minAxis * 0.14);
      orb.tScale = rand(0.92, 1.08);
      /* Keep opposite-ish motion so they cycle around each other. */
      const dir = orb.omega >= 0 ? 1 : -1;
      orb.omega = dir * rand(0.00028, 0.00062);
    }
  };

  const paintOrb = (orb) => {
    const ow = orb.el.offsetWidth || 200;
    const oh = orb.el.offsetHeight || 200;
    const cx = band.width * 0.5 - ow * 0.5;
    const cy = band.height * 0.5 - oh * 0.5;
    const x = cx + Math.cos(orb.angle) * orb.rx;
    const y = cy + Math.sin(orb.angle) * orb.ry;
    orb.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${orb.scale})`;
  };

  const paintStatic = () => {
    layoutBand();
    orbs.forEach((orb, i) => {
      orb.angle = i * Math.PI + 0.35;
      const minAxis = Math.min(band.width, band.height);
      orb.rx = minAxis * (0.1 + i * 0.04);
      orb.ry = minAxis * (0.08 + i * 0.03);
      orb.scale = 1 + i * 0.03;
      paintOrb(orb);
    });
    shuffleLayers(orbs);
    syncMapContextFrame();
  };

  const tick = (now) => {
    if (reduced) {
      raf = 0;
      return;
    }

    if (now - lastRetarget > 7000) {
      retargetOrbit();
      lastRetarget = now;
    }
    if (now - lastSwap > rand(6500, 12000)) {
      shuffleLayers(orbs);
      lastSwap = now;
    }

    for (const orb of orbs) {
      orb.angle += orb.omega;
      orb.rx += (orb.tRx - orb.rx) * 0.012;
      orb.ry += (orb.tRy - orb.ry) * 0.012;
      orb.scale += (orb.tScale - orb.scale) * 0.02;
      paintOrb(orb);
    }

    raf = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    layoutBand();
    if (reduced) {
      paintStatic();
      return;
    }
    retargetOrbit();
    lastRetarget = performance.now();
    lastSwap = performance.now();
    raf = window.requestAnimationFrame(tick);
    syncMapContextFrame();
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

  /* Prompt snap / dock changes the band height. */
  const frame = document.querySelector("whatimado-frame");
  if (frame) {
    const mo = new MutationObserver(() => {
      layoutBand();
      syncMapContextFrame();
    });
    mo.observe(frame, { attributes: true, attributeFilter: ["data-snap", "class", "style"] });
  }

  /* Open-context class toggles elsewhere. */
  const bodyMo = new MutationObserver(() => syncMapContextFrame());
  bodyMo.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  start();
}
