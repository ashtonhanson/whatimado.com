import { measureCssVarLength } from "../layout/measure-css-var.js";
import { MOBILE_MQ, SCALE_CENTER_Y, VIEW_H, VIEW_W, ZOOM_MIN } from "./constants.js";
import {
  clampPanYForOpenHome,
  clampPanYForTopPad,
  getNodeLabelMetrics,
  getNodeRadii,
  readGraphShiftY
} from "./geometry.js";

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

  const scaleX = VIEW_W / stageRect.width;
  const scaleY = VIEW_H / stageRect.height;
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

  const scaleY = VIEW_H / stageRect.height;
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
 * Open-home camera: pan + optional fit-zoom so the constellation clears both
 * the menu bar and Path Finder without changing relative node proportions.
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

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const scaleY = VIEW_H / stageRect.height;

  const brandRect = brand?.getBoundingClientRect();
  const kickerRect = kicker?.getBoundingClientRect();
  const textTop = brandRect?.top ?? kickerRect?.top ?? stageRect.bottom;
  const anchorScreenY = textTop - gapPx - driftSlackPx;

  const menuClearY = (() => {
    if (!MOBILE_MQ.matches) {
      return stageRect.top + (measureCssVarLength("--v2-map-graph-top-pad") || 16);
    }
    const rail = document.querySelector(".v2-rail-brand");
    if (rail) {
      const bottom = rail.getBoundingClientRect().bottom;
      if (bottom > 0) return bottom + 8;
    }
    return (measureCssVarLength("--v2-mobile-header-h") || 56) + 8;
  })();

  const span = Math.max(1, bounds.maxY - bounds.minY);
  const availablePx = Math.max(48, anchorScreenY - menuClearY);
  const naturalPx = (span * stageRect.height) / VIEW_H;
  /* Open-home may need to shrink below pinch-min so both menu + Path Finder clear */
  const zoom = Math.max(0.55, Math.min(1, (availablePx / naturalPx) * 0.94));

  // Pin top of graph to menu clearance at this zoom (scale around SCALE_CENTER_Y)
  const panY =
    (menuClearY - stageRect.top) * scaleY -
    shiftY -
    zoom * bounds.minY -
    (1 - zoom) * SCALE_CENTER_Y;
  const panX = VIEW_W / 2 - bounds.cx;

  return { panX, panY, zoom };
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

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const scaleY = VIEW_H / stageRect.height;
  const gapPx = 52;

  const anchorScreenY = frameRect.top - gapPx;
  const panY = clampPanYForTopPad(
    (anchorScreenY - stageRect.top) * scaleY - shiftY - bounds.maxY,
    bounds,
    stageRect,
    shiftY
  );
  const panX = VIEW_W / 2 - bounds.cx;

  return { panX, panY };
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

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const scaleY = VIEW_H / stageRect.height;
  const gapPx = 12;
  const anchorScreenY = mainRect.top + frameTopMainPx - gapPx;
  const panY = clampPanYForTopPad(
    (anchorScreenY - stageRect.top) * scaleY - shiftY - bounds.maxY,
    bounds,
    stageRect,
    shiftY
  );
  const panX = VIEW_W / 2 - bounds.cx;

  return { panX, panY };
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
  const scaleY = VIEW_H / stageRect.height;

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
