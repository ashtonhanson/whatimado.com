import { GLIDE_MAX_SPEED, GLIDE_VEL_SCALE } from "./constants.js";

/** Quintic ease-out — matches node settle feel */
export function easeOutQuint(t) {
  return 1 - (1 - t) ** 5;
}

/**
 * @param {{ y: number, t: number }[]} samples
 * @returns {number}
 */
export function computeReleaseVelocity(samples) {
  if (samples.length < 2) return 0;

  const last = samples[samples.length - 1];
  const prev = samples[Math.max(0, samples.length - 4)];
  const dt = last.t - prev.t;
  if (dt <= 0) return 0;

  const pxPerMs = (last.y - prev.y) / dt;
  const pxPerFrame = pxPerMs * (1000 / 60);
  return Math.max(-GLIDE_MAX_SPEED, Math.min(GLIDE_MAX_SPEED, pxPerFrame * GLIDE_VEL_SCALE));
}
