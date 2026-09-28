import { measureCssVarLength } from "../layout/measure-css-var.js";
import { MOBILE_MQ, SCALE_CENTER_X, SCALE_CENTER_Y, VIEW_H, VIEW_W, ZOOM_MAX } from "./constants.js";
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
  const zoom = Math.max(1, Math.min(1.15, (availablePx / naturalPx) * 1.05));
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

  const stage = mapEl.querySelector(".whatimado-map__stage");
  const kicker = document.getElementById("frame-kicker");
  const brand = kicker?.querySelector(".v2-kicker-brand");
  if (!stage) return { panX: 0, panY: 0, zoom: 1 };
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0, zoom: 1 };

  const gapPx = Math.max(14, measureCssVarLength("--v2-hero-node-gap") || 14);
  const textTop = brand?.getBoundingClientRect().top ?? kicker?.getBoundingClientRect().top ?? stageRect.bottom;
  const top = menuClearScreenY(stageRect) + OPEN_HOME_LABEL_ABOVE_PX;
  const bottom = textTop - gapPx - OPEN_HOME_LABEL_BELOW_PX;

  const dots = getNodeBounds(mapEl);
  const shiftY = readGraphShiftY();
  const { scaleY } = unitsPerPixel(mapEl, stageRect);
  const availablePx = Math.max(24, bottom - top);
  const naturalPx = Math.max(1, dots.maxY - dots.minY) / scaleY;
  const zoom = Math.max(OPEN_HOME_ZOOM_MIN, Math.min(1.15, availablePx / naturalPx));
  const graphTop = top + Math.max(0, availablePx - naturalPx * zoom) / 2;
  const yPrime = (graphTop - stageRect.top) * scaleY;
  return {
    panX: VIEW_W / 2 - SCALE_CENTER_X - zoom * (dots.cx - SCALE_CENTER_X),
    panY: yPrime - shiftY - SCALE_CENTER_Y - zoom * (dots.minY - SCALE_CENTER_Y),
    zoom
  };
}

/** Titles stay near 13px at any zoom, so the landing fit reserves pixels for the top title and the one under You. */
const OPEN_HOME_LABEL_ABOVE_PX = 18;
const OPEN_HOME_LABEL_BELOW_PX = 26;
/** Laptop bands are shorter than the constellation; shrink it rather than push titles past the top edge. */
const OPEN_HOME_ZOOM_MIN = 0.6;

/** A short band at home can shrink the roadmap below pinch-zoom's floor rather than tuck it under the prompt. */
const FIT_ZOOM_MIN = 0.5;
/** The phone map is already a quarter of desktop scale; a short band shrinking it further piles the titles up. */
const FIT_ZOOM_MIN_MOBILE = 1;

/**
 * Dot extents only, including how far the idle float lifts them.
 * Titles are drawn at a fixed screen size, so the fit reserves pixels for them.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 */
function getNodeBounds(mapEl) {
  if (!mapEl._liveNodes.length) return getGraphBounds(mapEl);
  const { lg, sm } = getNodeRadii();
  const float = mapEl.querySelector(".whatimado-map__node-float");
  const floatStyle = float ? getComputedStyle(float) : null;
  const lift =
    floatStyle && floatStyle.animationName !== "none"
      ? Math.abs(parseFloat(floatStyle.getPropertyValue("--node-float-amp")) || 0)
      : 0;
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
    minY = Math.min(minY, cy - r - lift);
    maxY = Math.max(maxY, cy + r);
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Screen pixels per SVG unit for the desktop viewBox (`xMidYMin meet`),
 * plus the CSS shift that drops the svg below the timeline.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {DOMRect} stageRect
 */
function svgMeetPaint(mapEl, stageRect) {
  const svg = mapEl._svg || mapEl.querySelector(".whatimado-map__svg");
  const box = svg?.viewBox?.baseVal;
  const vbW = box?.width > 0 ? box.width : VIEW_W;
  const vbH = box?.height > 0 ? box.height : VIEW_H;
  const pxPerUnit = Math.min(stageRect.width / vbW, stageRect.height / vbH);
  const letterY = Math.max(0, stageRect.height - vbH * pxPerUnit);
  const letterX = Math.max(0, stageRect.width - vbW * pxPerUnit);
  const align = svg?.getAttribute("preserveAspectRatio") || "";
  const originY = align.includes("YMin") ? 0 : align.includes("YMax") ? letterY : letterY / 2;
  let paintY = 0;
  if (svg) {
    const transform = getComputedStyle(svg).transform;
    const match = transform && transform !== "none" ? transform.match(/matrix\(([^)]+)\)/) : null;
    if (match) {
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      if (parts.length === 6 && Number.isFinite(parts[5])) paintY = parts[5];
    }
  }
  return { pxPerUnit, originX: letterX / 2, originY, paintY };
}

/**
 * Scale and center the constellation in the band between the timeline and the prompt.
 * Uses the live viewBox meet (uniform) so a tall stage does not stretch the fit.
 * Titles keep a fixed screen size, so `reserve` holds the pixels they reach past the dots.
 * `centerNodeId` stays centered unless that would shrink the map past its floor;
 * then it slides off center only as far as keeps everything on screen.
 * @param {import("../components/whatimado-map/index.js").WhatimadoMap} mapEl
 * @param {{ centerNodeId?: string|null, reserve?: { above: number, below: number, left: number, right: number } }} [options]
 */
export function computeTimelineFrameFit(mapEl, { centerNodeId = null, reserve = null } = {}) {
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const frame = document.getElementById("dynamic-frame");
  if (!stage || !frame) return { panX: 0, panY: 0, zoom: 1 };

  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0, zoom: 1 };

  const timeline = document.getElementById("map-timeline");
  let top = menuClearScreenY(stageRect);
  if (timeline instanceof HTMLElement && !timeline.hidden) {
    const bar = timeline.getBoundingClientRect();
    if (bar.height > 4) top = Math.max(top, bar.bottom + 8);
  }
  const clearance = measureCssVarLength("--v2-map-frame-clearance") || 12;
  const room = reserve || { above: 34, below: 0, left: 96, right: 96 };
  const bottom = frameRect.top - clearance - room.below;
  top += room.above;
  const availablePx = Math.max(24, bottom - top);

  const bounds = getNodeBounds(mapEl);
  const focus = centerNodeId ? mapEl._liveNodes.find((node) => node.id === centerNodeId) : null;
  const { pxPerUnit, originX, originY, paintY } = svgMeetPaint(mapEl, stageRect);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const naturalH = spanY * pxPerUnit;
  const zoomY = availablePx / naturalH;
  const usableW = stageRect.width * 0.96;
  let zoomX;
  let cx;
  let screenCx = stageRect.width / 2;
  const floor = MOBILE_MQ.matches ? FIT_ZOOM_MIN_MOBILE : FIT_ZOOM_MIN;
  const spanZoomX =
    Math.max(0.1, usableW - room.left - room.right) / (Math.max(1, bounds.maxX - bounds.minX) * pxPerUnit);
  if (focus) {
    cx = focus.x * VIEW_W;
    const halfX = Math.max(1, cx - bounds.minX, bounds.maxX - cx);
    const centeredZoomX = Math.max(0.1, usableW / 2 - Math.max(room.left, room.right)) / (halfX * pxPerUnit);
    zoomX = Math.max(centeredZoomX, Math.min(spanZoomX, floor));
  } else {
    cx = bounds.cx;
    zoomX = spanZoomX;
    screenCx += (room.left - room.right) / 2;
  }
  const zoom = MOBILE_MQ.matches
    ? Math.max(FIT_ZOOM_MIN, Math.min(ZOOM_MAX, zoomX, Math.max(floor, zoomY)))
    : Math.max(FIT_ZOOM_MIN, Math.min(ZOOM_MAX, zoomY, zoomX));
  const scale = pxPerUnit * zoom;
  const margin = (stageRect.width - usableW) / 2;
  const overRight = screenCx + (bounds.maxX - cx) * scale + room.right - (stageRect.width - margin);
  const overLeft = margin - (screenCx - (cx - bounds.minX) * scale - room.left);
  if (overRight > 0 && overLeft < 0) screenCx -= Math.min(overRight, -overLeft);
  else if (overLeft > 0 && overRight < 0) screenCx += Math.min(overLeft, -overRight);
  const fittedPx = naturalH * zoom;
  const graphTop = top + Math.max(0, availablePx - fittedPx) / 2;

  const shiftY = readGraphShiftY();
  const userY = (graphTop - stageRect.top - paintY - originY) / pxPerUnit;
  const panY = userY - shiftY - SCALE_CENTER_Y - zoom * (bounds.minY - SCALE_CENTER_Y);
  const userX = (screenCx - originX) / pxPerUnit;
  const panX = userX - SCALE_CENTER_X - zoom * (cx - SCALE_CENTER_X);
  return { panX, panY, zoom };
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
