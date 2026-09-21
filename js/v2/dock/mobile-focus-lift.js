/**
 * Mobile composer focus — fight iOS Safari's focus scroll, then pack a
 * deterministic stack: menu → gap → map → hero/subtitle → prompt → keyboard.
 */

import { measureCssVarLength } from "../layout/measure-css-var.js";

/** Menu → map gap while focused (px). Hardcoded — CSS var measurement was unreliable. */
const FOCUS_MAP_HEAD_GAP_PX = -6;
/** Map → hero gap while focused (px). */
const FOCUS_MAP_HERO_GAP_PX = 6;
/**
 * Hero/subtitle → prompt gap while focused (px).
 * Raising this moves hero+subtitle up (map-head nudges alone only grew the map).
 */
const FOCUS_HERO_PROMPT_GAP_PX = 13;

function lockDocumentScroll() {
  if (window.scrollX || window.scrollY) {
    window.scrollTo(0, 0);
  }
  if (document.documentElement.scrollTop) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body.scrollTop) {
    document.body.scrollTop = 0;
  }
}

/** @param {HTMLElement} el */
function clearPinStyles(el) {
  el.style.removeProperty("position");
  el.style.removeProperty("top");
  el.style.removeProperty("left");
  el.style.removeProperty("right");
  el.style.removeProperty("width");
  el.style.removeProperty("height");
  el.style.removeProperty("transform");
  el.style.removeProperty("z-index");
  el.style.removeProperty("overflow");
  el.style.removeProperty("--v2-map-svg-h");
  delete el.dataset.focusPinned;
  delete el.dataset.readingPinned;
  delete el.dataset.pinH;
}

/**
 * @param {HTMLElement} map
 * @param {{ top: number, left: number, width: number, height: number, zIndex: string }} box
 */
function applyMapPin(map, box) {
  map.style.position = "fixed";
  map.style.top = `${Math.round(box.top)}px`;
  map.style.left = `${Math.round(box.left)}px`;
  map.style.width = `${Math.round(box.width)}px`;
  map.style.height = `${Math.round(box.height)}px`;
  map.style.right = "auto";
  map.style.transform = "none";
  map.style.overflow = "hidden";
  map.style.zIndex = box.zIndex;
  map.style.setProperty("--v2-map-svg-h", `${Math.round(box.height)}px`);
}

/** Recenter the constellation in the pinned stage when height changes. */
function fitPinnedMap(map) {
  const nextH = Math.round(map.getBoundingClientRect().height);
  const prevH = Number(map.dataset.pinH || 0);
  if (Math.abs(nextH - prevH) < 6) return;
  map.dataset.pinH = String(nextH);
  const host = /** @type {HTMLElement & { fitLockedScene?: (opts?: { animate?: boolean }) => void }} */ (map);
  requestAnimationFrame(() => {
    host.fitLockedScene?.({ animate: false });
  });
}

/**
 * Pack map + hero into the band between the menu and the prompt frame.
 * Re-runs on every sync so keyboard dock updates reflow the stack.
 * @param {import("./frame-dock-controller.js").FrameDockController} controller
 */
export function pinMobileFocusChrome(controller) {
  lockDocumentScroll();

  const map = document.getElementById("possibility-map");
  const kicker = document.getElementById("frame-kicker");
  if (!map || !controller?.frameEl) return;

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const mapHeadGap = FOCUS_MAP_HEAD_GAP_PX;
  const heroGap = FOCUS_HERO_PROMPT_GAP_PX;
  const mapHeroGap = FOCUS_MAP_HERO_GAP_PX;

  const gutter = measureCssVarLength("--v2-main-gutter") || 14;
  const frameRect = controller.frameEl.getBoundingClientRect();
  const promptTop = frameRect.top;
  const contentLeft = gutter;
  const contentWidth = Math.max(0, window.innerWidth - gutter * 2);
  const mapTop = Math.round(headerH + mapHeadGap);
  const kickerVisible =
    Boolean(kicker) &&
    document.body.dataset.phase === "open" &&
    !kicker.classList.contains("hidden") &&
    !kicker.classList.contains("is-dismissing");

  if (!kickerVisible) {
    const mapBottom = Math.round(promptTop - 10);
    const mapHeight = Math.max(72, mapBottom - mapTop);
    applyMapPin(map, {
      top: mapTop,
      left: contentLeft,
      width: contentWidth,
      height: mapHeight,
      zIndex: "42"
    });
    map.dataset.focusPinned = "1";
    delete map.dataset.readingPinned;
    if (kicker) clearPinStyles(kicker);
    fitPinnedMap(map);
    return;
  }

  if (!kicker) return;

  const kickerReserve = measureCssVarLength("--v2-kicker-reserve") || 56;
  const kickerHeight = Math.max(
    kickerReserve,
    Math.ceil(kicker.scrollHeight || kicker.getBoundingClientRect().height || kickerReserve)
  );

  const kickerBottom = Math.round(promptTop - heroGap);
  const available = kickerBottom - mapTop;

  // Prefer keeping full kicker; give remaining band to the map.
  let usedKickerH = Math.min(kickerHeight, Math.max(36, available - 72));
  let mapHeight = Math.max(72, available - usedKickerH - mapHeroGap);
  let kickerTop = mapTop + mapHeight + mapHeroGap;

  // If prompt sits too high (keyboard), compress map first, then kicker.
  if (kickerTop + usedKickerH > kickerBottom) {
    usedKickerH = Math.max(36, kickerBottom - mapTop - mapHeroGap - 72);
    mapHeight = Math.max(72, kickerBottom - mapTop - mapHeroGap - usedKickerH);
    kickerTop = mapTop + mapHeight + mapHeroGap;
  }

  applyMapPin(map, {
    top: mapTop,
    left: contentLeft,
    width: contentWidth,
    height: Math.round(mapHeight),
    zIndex: "40"
  });
  map.dataset.focusPinned = "1";
  delete map.dataset.readingPinned;

  kicker.style.position = "fixed";
  kicker.style.top = `${Math.round(kickerTop)}px`;
  kicker.style.left = `${contentLeft}px`;
  kicker.style.width = `${contentWidth}px`;
  kicker.style.height = `${Math.round(usedKickerH)}px`;
  kicker.style.right = "auto";
  kicker.style.transform = "none";
  kicker.style.zIndex = "30";
  kicker.dataset.focusPinned = "1";
  fitPinnedMap(map);
}

export function unpinMobileFocusChrome(controller) {
  const map = document.getElementById("possibility-map");
  const kicker = document.getElementById("frame-kicker");
  if (kicker) clearPinStyles(kicker);
  if (!map) return;
  if (controller?._mobileChatSheet) {
    delete map.dataset.focusPinned;
    return;
  }
  clearPinStyles(map);
}

/**
 * Fit the node map in the band between the menu and the chat frame.
 * Chat ¾ snap: constellation lives above the glass, not under it.
 * @param {import("./frame-dock-controller.js").FrameDockController} controller
 */
export function syncMobileReadingMap(controller) {
  if (!controller?._mobileMode || !controller.frameEl) return;

  const map = document.getElementById("possibility-map");
  if (!map) return;

  if (!controller._mobileChatSheet) {
    if (map.dataset.readingPinned === "1") clearPinStyles(map);
    return;
  }

  const expanded = controller.frameEl.classList.contains("is-mobile-expanded");
  if (expanded) return;

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const gutter = measureCssVarLength("--v2-main-gutter") || 14;
  const frameTop = controller.frameEl.getBoundingClientRect().top;
  const bandTop = headerH + 4;
  const gapAboveFrame = 14;
  const bandH = Math.max(0, frameTop - bandTop - gapAboveFrame);
  if (bandH < 40) return;

  const fillScreen = controller.frameEl.classList.contains("is-mobile-typing");
  const contentLeft = gutter;
  const contentWidth = Math.max(0, window.innerWidth - gutter * 2);
  const edgePad = fillScreen ? 4 : Math.max(8, Math.round(bandH * 0.06));
  const mapH = Math.max(fillScreen ? 88 : 72, Math.round(bandH - edgePad * 2));
  const mapTop = Math.round(bandTop + Math.max(0, (bandH - mapH) / 2));

  applyMapPin(map, {
    top: mapTop,
    left: contentLeft,
    width: contentWidth,
    height: mapH,
    zIndex: "42"
  });
  map.dataset.readingPinned = "1";
  delete map.dataset.focusPinned;
  fitPinnedMap(map);
}

export function unpinMobileReadingMap() {
  const map = document.getElementById("possibility-map");
  if (map?.dataset.readingPinned === "1") {
    clearPinStyles(map);
  }
}

/** Clear leftover orientation timers from older focus resync storms. */
export function clearFocusOrientationTimers(controller) {
  if (controller._focusOrientationTimer !== null) {
    window.clearTimeout(controller._focusOrientationTimer);
    controller._focusOrientationTimer = null;
  }
  if (controller._focusOrientationTimer2 !== null) {
    window.clearTimeout(controller._focusOrientationTimer2);
    controller._focusOrientationTimer2 = null;
  }
}

/** Keep scroll locked + chrome packed while focused. */
export function scheduleMobileComposerFocusResync(controller) {
  syncMobileFocusLift(controller);
}

export function cancelMobileComposerFocusRelease(controller) {
  if (controller._focusReleaseTimer !== null) {
    window.clearTimeout(controller._focusReleaseTimer);
    controller._focusReleaseTimer = null;
  }
  if (controller._focusReleaseRaf !== null) {
    cancelAnimationFrame(controller._focusReleaseRaf);
    controller._focusReleaseRaf = null;
  }
}

/** Instant blur — restore landing absolute positioning. */
export function releaseMobileComposerFocus(controller, { onComplete } = {}) {
  cancelMobileComposerFocusRelease(controller);
  document.body.classList.remove("is-mobile-composer-focus");
  document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
  unpinMobileFocusChrome(controller);
  lockDocumentScroll();
  if (controller._mobileChatSheet) syncMobileReadingMap(controller);
  onComplete?.();
}

/**
 * While focused: lock scroll and pack map/hero between menu and prompt.
 */
export function syncMobileFocusLift(controller) {
  if (!controller._mobileMode) return;

  if (!document.body.classList.contains("is-mobile-composer-focus")) {
    document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
    unpinMobileFocusChrome(controller);
    if (controller._mobileChatSheet) syncMobileReadingMap(controller);
    return;
  }

  lockDocumentScroll();
  pinMobileFocusChrome(controller);

  const frameRect = controller.frameEl.getBoundingClientRect();
  document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
}
