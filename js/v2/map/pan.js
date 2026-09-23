import { measureCssVarLength } from "../layout/measure-css-var.js";
import { MOBILE_MQ, SCALE_CENTER_X, SCALE_CENTER_Y, VIEW_H, VIEW_W, ZOOM_MIN } from "./constants.js";
import {
  clampPanYForOpenHome,
  clampPanYForTopPad,
  getNodeLabelMetrics,
  getNodeRadii,
  readGraphShiftY
} from "./geometry.js";

/**
 * SVG units per screen pixel. Uses the live viewBox so a tall desktop stage
 * stays uniformly scaled instead of assuming the 800×240 box is stretched.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {DOMRect} stageRect
 */
function unitsPerPixel(mapEl, stageRect) {
  const svg = mapEl._svg || mapEl.querySelector(".whatimado-map__svg");
  const box = svg?.viewBox?.baseVal;
  return {
    scaleX: box?.width > 0 && stageRect.width > 0 ? box.width / stageRect.width : VIEW_W / stageRect.width,
    scaleY: box?.height > 0 && stageRect.height > 0 ? box.height / stageRect.height : VIEW_H / stageRect.height
  };
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function getGraphBounds(mapEl) {
  if (!mapEl._liveNodes.length) {
    return {
      minX: 0,
      maxX: VIEW_W,
      minY: 0,
      maxY: VIEW_H,
      cx: VIEW_W / 2,
      cy: VIEW_H / 2
    };
  }

  const { lg, sm } = getNodeRadii();
  const { offset: labelOffset, cap: labelCap } = getNodeLabelMetrics(lg);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of mapEl._liveNodes) {
    const cx = node.x * VIEW_W;
    const cy = node.y * VIEW_H;
    const r = node.type === "start" || node.type === "path" ? lg : sm;
    minX = Math.min(minX, cx - r);
    maxX = Math.max(maxX, cx + r);
    minY = Math.min(minY, cy - r - labelOffset - labelCap);
    maxY = Math.max(maxY, cy + r);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function getFrameCenterInSvgCoords(mapEl) {
  const frame = document.getElementById("dynamic-frame");
  const stage = mapEl.querySelector(".whatimado-map__stage");
  if (!frame || !stage) return null;

  const frameRect = frame.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return null;

  const { scaleX, scaleY } = unitsPerPixel(mapEl, stageRect);
  const centerScreenX = (frameRect.left + frameRect.right) / 2;
  const centerScreenY = (frameRect.top + frameRect.bottom) / 2;

  return {
    x: (centerScreenX - stageRect.left) * scaleX,
    y: (centerScreenY - stageRect.top) * scaleY
  };
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function getStageCenterInSvgCoords(mapEl) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  if (!stage) return null;

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return null;

  const { scaleY } = unitsPerPixel(mapEl, stageRect);
  return {
    x: VIEW_W / 2,
    y: (stageRect.height / 2) * scaleY
  };
}

/** @returns {boolean} */
export function isOpenHomePhase() {
  return document.body.dataset.phase === "open";
}


/**
 * Screen Y the constellation must stay below (menu bar on mobile, top pad on desktop).
 * @param {DOMRect} stageRect
 */
function menuClearScreenY(stageRect) {
  if (!MOBILE_MQ.matches) {
    return stageRect.top + (measureCssVarLength("--v2-map-graph-top-pad") || 16);
  }
  const rail = document.querySelector(".v2-rail-brand");
  if (rail) {
    const bottom = rail.getBoundingClientRect().bottom;
    if (bottom > 0) return bottom + 8;
  }
  return (measureCssVarLength("--v2-mobile-header-h") || 56) + 8;
}

/**
 * Fit the constellation in a screen band and center it there.
 * Bottom of the graph stays at or above bottomScreenY.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {number} topScreenY
 * @param {number} bottomScreenY
 * @returns {{ panX: number, panY: number, zoom: number }}
 */
function computeCenteredBandCamera(mapEl, topScreenY, bottomScreenY) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  if (!stage) return { panX: 0, panY: 0, zoom: 1 };

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0, zoom: 1 };

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const { scaleY } = unitsPerPixel(mapEl, stageRect);
  const span = Math.max(1, bounds.maxY - bounds.minY);
  const availablePx = Math.max(48, bottomScreenY - topScreenY);
  const naturalPx = span / scaleY;
  const zoom = Math.max(0.55, Math.min(1, (availablePx / naturalPx) * 0.88));
  const fittedPx = naturalPx * zoom;
  let graphTop = topScreenY + Math.max(0, availablePx - fittedPx) / 2;
  if (graphTop + fittedPx > bottomScreenY) graphTop = bottomScreenY - fittedPx;

  const yPrime = (graphTop - stageRect.top) * scaleY;
  const panY = yPrime - shiftY - SCALE_CENTER_Y - zoom * (bounds.minY - SCALE_CENTER_Y);
  const panX = VIEW_W / 2 - bounds.cx;
  return { panX, panY, zoom };
}

/**
 * Open-home camera: center the constellation between the menu and Path Finder.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {number} gapPx
 * @param {number} driftSlackPx
 */
function computeOpenHomeCamera(mapEl, gapPx, driftSlackPx) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const kicker = document.getElementById("frame-kicker");
  const brand = kicker?.querySelector(".v2-kicker-brand");
  if (!stage) return { panX: 0, panY: 0, zoom: 1 };

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0, zoom: 1 };

  const brandRect = brand?.getBoundingClientRect();
  const kickerRect = kicker?.getBoundingClientRect();
  const textTop = brandRect?.top ?? kickerRect?.top ?? stageRect.bottom;
  const bottom = textTop - gapPx - driftSlackPx;
  return computeCenteredBandCamera(mapEl, menuClearScreenY(stageRect), bottom);
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeMobileOpenHomePan(mapEl) {
  const gapPx = Math.max(14, measureCssVarLength("--v2-mobile-you-hero-gap") || 14);
  const driftSlackPx = 10;
  return computeOpenHomeCamera(mapEl, gapPx, driftSlackPx);
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeOpenHomeGravityPan(mapEl) {
  if (MOBILE_MQ.matches) {
    return computeMobileOpenHomePan(mapEl);
  }

  const gapPx = Math.max(14, measureCssVarLength("--v2-hero-node-gap") || 14);
  return computeOpenHomeCamera(mapEl, gapPx, 0);
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeChatFrameGravityPan(mapEl) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const frame = document.getElementById("dynamic-frame");
  if (!stage || !frame) return { panX: 0, panY: 0 };

  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

  const clearance = measureCssVarLength("--v2-map-frame-clearance") || 16;
  return computeCenteredBandCamera(
    mapEl,
    menuClearScreenY(stageRect),
    frameRect.top - clearance
  );
}

/**
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {number} frameTopMainPx
 * @returns {{ panX: number, panY: number }}
 */
export function computeChatFrameGravityPanAtMainTop(mapEl, frameTopMainPx) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const main = document.querySelector(".v2-main");
  if (!stage || !main) return { panX: 0, panY: 0 };

  const mainRect = main.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

  const clearance = measureCssVarLength("--v2-map-frame-clearance") || 16;
  return computeCenteredBandCamera(
    mapEl,
    menuClearScreenY(stageRect),
    mainRect.top + frameTopMainPx - clearance
  );
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeDefaultFrameGravityPan(mapEl) {
  const bounds = getGraphBounds(mapEl);
  const frameCenter = getFrameCenterInSvgCoords(mapEl);
  if (!frameCenter) return { panX: 0, panY: 0 };

  const shiftY = readGraphShiftY();
  return {
    panX: frameCenter.x - bounds.cx,
    panY: frameCenter.y - shiftY - bounds.cy
  };
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeDefaultScenePan(mapEl) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const stageCenter = getStageCenterInSvgCoords(mapEl);
  if (!stage || !stageCenter) return { panX: 0, panY: 0 };

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const panX = VIEW_W / 2 - bounds.cx;
  const panY = clampPanYForTopPad(
    stageCenter.y - shiftY - bounds.cy,
    bounds,
    stageRect,
    shiftY
  );

  return { panX, panY };
}

/**
 * Place one node in the middle of the open gap above the prompt, not the frame's center.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {string} nodeId
 * @returns {{ panX: number, panY: number }}
 */
export function computePanForNodeAboveFrame(mapEl, nodeId) {
  const node = mapEl._liveNodes.find((entry) => entry.id === nodeId);
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const frame = document.getElementById("dynamic-frame");
  if (!node || !stage || !frame) return computeChatFrameGravityPan(mapEl);

  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return computeChatFrameGravityPan(mapEl);

  const top = menuClearScreenY(stageRect);
  const bottom = Math.max(top + 48, frameRect.top);
  const { scaleX, scaleY } = unitsPerPixel(mapEl, stageRect);
  const shiftY = readGraphShiftY();
  const zoom = mapEl._zoom || 1;
  const nodeX = node.x * VIEW_W;
  const nodeY = node.y * VIEW_H;
  const anchorX = (stageRect.width / 2) * scaleX;
  const anchorY = ((top + bottom) / 2 - stageRect.top) * scaleY;

  return {
    panX: anchorX - SCALE_CENTER_X - zoom * (nodeX - SCALE_CENTER_X),
    panY: anchorY - shiftY - SCALE_CENTER_Y - zoom * (nodeY - SCALE_CENTER_Y)
  };
}

/**
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {string} nodeId
 * @returns {{ panX: number, panY: number }}
 */
export function computePanForFocalNode(mapEl, nodeId) {
  const node = mapEl._liveNodes.find((entry) => entry.id === nodeId);
  const anchor = mapEl._frameCoupled
    ? getFrameCenterInSvgCoords(mapEl)
    : getStageCenterInSvgCoords(mapEl);
  if (!node || !anchor) {
    return mapEl._frameCoupled
      ? computeDefaultFrameGravityPan(mapEl)
      : computeDefaultScenePan(mapEl);
  }

  const shiftY = readGraphShiftY();
  const nodeX = node.x * VIEW_W;
  const nodeY = node.y * VIEW_H;

  return {
    panX: anchor.x - nodeX,
    panY: anchor.y - shiftY - nodeY
  };
}

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeMobileFocusBandPan(mapEl) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  if (!stage) return { panX: 0, panY: 0 };

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const { scaleY } = unitsPerPixel(mapEl, stageRect);

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const mapHeadGap = measureCssVarLength("--v2-mobile-focus-map-head-gap") || 10;
  const bandTop = headerH + mapHeadGap;

  const panX = VIEW_W / 2 - bounds.cx;
  const panY = clampPanYForTopPad(
    (bandTop - stageRect.top) * scaleY - shiftY - bounds.minY,
    bounds,
    stageRect,
    shiftY
  );

  return { panX, panY };
}

/**
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {number} clientX
 * @param {number} clientY
 */
export function clientToSvg(mapEl, clientX, clientY) {
  if (!mapEl._svg) return { x: 0, y: 0 };
  const pt = mapEl._svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = mapEl._svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}
