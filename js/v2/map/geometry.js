import { BOUND_PAD_X, BOUND_PAD_Y, NODE_LABEL_CAP, NODE_LABEL_OFFSET, VIEW_H, VIEW_W } from "./constants.js";

/** @returns {{ minX: number, maxX: number, minY: number, maxY: number }} */
export function getMapBounds() {
  const { lg } = getNodeRadii();
  const padX = BOUND_PAD_X + lg * 0.35;
  const padTop = BOUND_PAD_Y + lg * 0.55;
  const padBottom = BOUND_PAD_Y + lg * 0.25;
  return {
    minX: padX,
    maxX: VIEW_W - padX,
    minY: padTop,
    maxY: VIEW_H - padBottom
  };
}

/** @param {number} lg */
export function getNodeLabelMetrics(lg) {
  return {
    offset: Math.max(NODE_LABEL_OFFSET, lg * 0.55),
    cap: Math.max(NODE_LABEL_CAP, lg * 1)
  };
}

/** Read top inset for graph gravity from CSS token (screen px) */
function readGraphTopPadPx() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;height:var(--v2-map-graph-top-pad);width:0;";
  document.documentElement.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px > 0 ? px : 16;
}

/** Prevent upward pan from clipping the topmost node labels */
export function clampPanYForTopPad(panY, bounds, stageRect, shiftY) {
  const scaleY = VIEW_H / stageRect.height;
  const topPadSvg = readGraphTopPadPx() * scaleY;
  const panFloor = topPadSvg - bounds.minY - shiftY;
  return Math.max(panY, panFloor);
}

/** Read global upward graph shift from CSS token (fraction of view height) */
export function readGraphShiftY() {
  const style = getComputedStyle(document.documentElement);
  const frac = Number.parseFloat(style.getPropertyValue("--v2-map-graph-shift-y")) || 0.15;
  return -frac * VIEW_H;
}

/** SVG units per screen pixel — used for hand-tool canvas panning */
export function svgScale(svg) {
  if (!svg) return 1;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return 1;
  return VIEW_W / rect.width;
}

/** Read node radii from CSS tokens so sizing stays consistent across breakpoints */
export function getNodeRadii() {
  const style = getComputedStyle(document.documentElement);
  const lg = parseFloat(style.getPropertyValue("--v2-map-node-lg")) || 8.5;
  const sm = parseFloat(style.getPropertyValue("--v2-map-node-sm")) || 6.4;
  return { lg, sm };
}

/** @param {number} t */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Drift offset matching the visual keyframe path (calm, noticeable hover).
 * @param {number} elapsedMs
 * @param {number} delaySec
 * @param {number} durationSec
 */
export function driftOffset(elapsedMs, delaySec, durationSec) {
  const elapsedSec = elapsedMs / 1000;
  const local = (((elapsedSec - delaySec) % durationSec) + durationSec) % durationSec / durationSec;
  const keys = [
    [0, 0, 0],
    [0.33, 6, -7],
    [0.66, -5, 6],
    [1, 0, 0]
  ];

  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, x0, y0] = keys[i];
    const [t1, x1, y1] = keys[i + 1];
    if (local >= t0 && local <= t1) {
      const segment = (local - t0) / (t1 - t0);
      const eased = easeInOut(segment);
      return {
        x: x0 + (x1 - x0) * eased,
        y: y0 + (y1 - y0) * eased
      };
    }
  }

  return { x: 0, y: 0 };
}

/**
 * Trim line to circle edges while using center coords as source of truth.
 * @param {number} ax @param {number} ay @param {number} ar
 * @param {number} bx @param {number} by @param {number} br
 */
export function trimLineToNodeEdges(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len <= ar + br) {
    return { x1: ax, y1: ay, x2: bx, y2: by };
  }
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: ax + ux * ar,
    y1: ay + uy * ar,
    x2: bx - ux * br,
    y2: by - uy * br
  };
}

/** @param {string} value */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
