/**
 * Subtle vertical drift on the docked prompt frame — mirrors node hover motion.
 * Visual-only (transform); does not affect layout or snap anchors.
 */

const BREATHE_DURATION_SEC = 11;
const BREATHE_DELAY_SEC = 0.4;

/** Same keyframe path as map node drift (whatimado-map.js driftOffset) */
const DRIFT_KEYS = [
  [0, 0, 0],
  [0.33, 6, -7],
  [0.66, -5, 6],
  [1, 0, 0]
];

/** Node drift peak Y in SVG units — used to normalize amplitude */
const DRIFT_Y_PEAK = 7;

/** @param {number} t */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * @param {number} elapsedMs
 * @param {number} delaySec
 * @param {number} durationSec
 */
function driftOffsetY(elapsedMs, delaySec, durationSec) {
  const elapsedSec = elapsedMs / 1000;
  const local =
    ((((elapsedSec - delaySec) % durationSec) + durationSec) % durationSec) / durationSec;
  for (let i = 0; i < DRIFT_KEYS.length - 1; i += 1) {
    const [t0, , y0] = DRIFT_KEYS[i];
    const [t1, , y1] = DRIFT_KEYS[i + 1];
    if (local >= t0 && local <= t1) {
      const segment = (local - t0) / (t1 - t0);
      const eased = easeInOut(segment);
      return y0 + (y1 - y0) * eased;
    }
  }
  return 0;
}

import { measureCssVarLength } from "./layout/measure-css-var.js";

export class FrameBreatheController {
  /**
   * @param {HTMLElement} hostEl whatimado-frame host — checked for drag/settle classes
   * @param {HTMLElement} innerEl .whatimado-frame__inner — receives translateY
   */
  constructor(hostEl, innerEl) {
    this._host = hostEl;
    this._inner = innerEl;
    this._raf = null;
    this._active = false;
    this._startMs = 0;
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  start() {
    if (this._reducedMotion || this._active) return;
    this._active = true;
    this._startMs = performance.now();
    this._tick();
  }

  stop() {
    this._active = false;
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._inner) this._inner.style.removeProperty("transform");
  }

  /** Pause transform while the frame is being repositioned */
  _hostIsBusy() {
    return (
      this._host.classList.contains("is-dragging") ||
      this._host.classList.contains("is-gliding") ||
      this._host.classList.contains("is-settling")
    );
  }

  _tick() {
    if (!this._active) return;

    if (this._hostIsBusy()) {
      this._inner.style.removeProperty("transform");
    } else {
      const elapsed = performance.now() - this._startMs;
      const driftY = driftOffsetY(elapsed, BREATHE_DELAY_SEC, BREATHE_DURATION_SEC);
      const amplitudePx = measureCssVarLength("--v2-frame-breathe-amplitude") || 3;
      const yPx = (driftY / DRIFT_Y_PEAK) * amplitudePx;
      this._inner.style.transform = `translateY(${yPx}px)`;
    }

    this._raf = requestAnimationFrame(() => this._tick());
  }
}
