import {
  measureCssVarLength,
  measureMobileFocusBandRise,
  measureMobileFocusMapRise
} from "../layout/measure-css-var.js";
import { MOBILE_MQ, VIEW_H, VIEW_W } from "./constants.js";
import { clampPanYForTopPad, getNodeLabelMetrics, getNodeRadii, readGraphShiftY } from "./geometry.js";

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

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeMobileOpenHomePan(mapEl) {
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

/** @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl */
export function computeOpenHomeGravityPan(mapEl) {
  if (MOBILE_MQ.matches) {
    return computeMobileOpenHomePan(mapEl);
  }

  const stage = mapEl.querySelector(".whatimado-map__stage");
  const kicker = document.getElementById("frame-kicker");
  if (!stage) return { panX: 0, panY: 0 };

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

  const bounds = getGraphBounds(mapEl);
  const shiftY = readGraphShiftY();
  const scaleY = VIEW_H / stageRect.height;

  const gapPx = 10;
  const anchorScreenY = kicker
    ? kicker.getBoundingClientRect().top - gapPx
    : stageRect.bottom - gapPx;

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
  const gapPx = 12;

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
  const bandRise = measureMobileFocusBandRise();
  const mapRise = measureMobileFocusMapRise();
  const bandTop = headerH + mapHeadGap - bandRise - mapRise;

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
