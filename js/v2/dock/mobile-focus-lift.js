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
  el.style.removeProperty("--v2-map-svg-h");
  delete el.dataset.focusPinned;
  delete el.dataset.readingPinned;
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
  if (!map || !kicker || !controller?.frameEl) return;

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const mapHeadGap = FOCUS_MAP_HEAD_GAP_PX;
  const heroGap = FOCUS_HERO_PROMPT_GAP_PX;
  const mapHeroGap = FOCUS_MAP_HERO_GAP_PX;

  const gutter = measureCssVarLength("--v2-main-gutter") || 14;
  const frameRect = controller.frameEl.getBoundingClientRect();
  const promptTop = frameRect.top;
  const contentLeft = gutter;
  const contentWidth = Math.max(0, window.innerWidth - gutter * 2);

  // Natural kicker height (content), fall back to reserve token
  const kickerReserve = measureCssVarLength("--v2-kicker-reserve") || 56;
  const kickerHeight = Math.max(
    kickerReserve,
    Math.ceil(kicker.scrollHeight || kicker.getBoundingClientRect().height || kickerReserve)
  );

  const mapTop = Math.round(headerH + mapHeadGap);
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

  map.style.position = "fixed";
  map.style.top = `${mapTop}px`;
  map.style.left = `${contentLeft}px`;
  map.style.width = `${contentWidth}px`;
  map.style.height = `${Math.round(mapHeight)}px`;
  map.style.right = "auto";
  map.style.transform = "none";
  map.style.zIndex = "40";
  map.style.setProperty("--v2-map-svg-h", `${Math.round(mapHeight)}px`);
  map.dataset.focusPinned = "1";

  kicker.style.position = "fixed";
  kicker.style.top = `${Math.round(kickerTop)}px`;
  kicker.style.left = `${contentLeft}px`;
  kicker.style.width = `${contentWidth}px`;
  kicker.style.height = `${Math.round(usedKickerH)}px`;
  kicker.style.right = "auto";
  kicker.style.transform = "none";
  kicker.style.zIndex = "46";
  kicker.dataset.focusPinned = "1";
}

export function unpinMobileFocusChrome() {
  const map = document.getElementById("possibility-map");
  const kicker = document.getElementById("frame-kicker");
  if (map) clearPinStyles(map);
  if (kicker) clearPinStyles(kicker);
}

/**
 * After send — center the node map in the band between the menu and the
 * reading prompt frame (top at ~¾ viewport).
 * @param {import("./frame-dock-controller.js").FrameDockController} controller
 */
export function syncMobileReadingMap(controller) {
  if (!controller?._mobileMode || !controller.frameEl) return;

  const map = document.getElementById("possibility-map");
  if (!map) return;

  if (!controller.frameEl.classList.contains("is-mobile-reading")) {
    if (map.dataset.readingPinned === "1") {
      clearPinStyles(map);
    }
    return;
  }

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const gutter = measureCssVarLength("--v2-main-gutter") || 14;
  const frameTop = controller.frameEl.getBoundingClientRect().top;
  const bandTop = headerH;
  const bandH = Math.max(0, frameTop - bandTop);
  if (bandH < 48) return;

  const contentLeft = gutter;
  const contentWidth = Math.max(0, window.innerWidth - gutter * 2);
  const mapH = Math.max(96, Math.round(bandH * 0.82));
  const mapTop = Math.round(bandTop + (bandH - mapH) / 2);

  map.style.position = "fixed";
  map.style.top = `${mapTop}px`;
  map.style.left = `${contentLeft}px`;
  map.style.width = `${contentWidth}px`;
  map.style.height = `${mapH}px`;
  map.style.right = "auto";
  map.style.transform = "none";
  map.style.zIndex = "40";
  map.style.setProperty("--v2-map-svg-h", `${mapH}px`);
  map.dataset.readingPinned = "1";
  delete map.dataset.focusPinned;
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
  unpinMobileFocusChrome();
  lockDocumentScroll();
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
    unpinMobileFocusChrome();
    return;
  }

  lockDocumentScroll();
  pinMobileFocusChrome(controller);

  const frameRect = controller.frameEl.getBoundingClientRect();
  document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
}
