/**
 * Mobile composer focus — fight iOS Safari's focus scroll.
 *
 * Map/hero are position:absolute (scroll with the document). The prompt is
 * position:fixed. Safari scrolls the page on textarea focus, which ejects
 * map/hero off-screen while the prompt stays behind. Fix: lock scroll to 0
 * and pin map/hero as fixed at their landing screen rects for the focus session.
 */

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
function clearFocusPinStyles(el) {
  el.style.removeProperty("position");
  el.style.removeProperty("top");
  el.style.removeProperty("left");
  el.style.removeProperty("right");
  el.style.removeProperty("width");
  el.style.removeProperty("height");
  el.style.removeProperty("transform");
  el.style.removeProperty("z-index");
  delete el.dataset.focusPinned;
}

/** Freeze map + hero at their current on-screen rects so document scroll cannot move them. */
export function pinMobileFocusChrome() {
  lockDocumentScroll();

  const map = document.getElementById("possibility-map");
  const kicker = document.getElementById("frame-kicker");

  /** @param {HTMLElement|null} el @param {number} z */
  const pin = (el, z) => {
    if (!el || el.dataset.focusPinned === "1") return;
    const rect = el.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.top = `${Math.round(rect.top)}px`;
    el.style.left = `${Math.round(rect.left)}px`;
    el.style.width = `${Math.round(rect.width)}px`;
    el.style.height = `${Math.round(rect.height)}px`;
    el.style.right = "auto";
    el.style.transform = "none";
    el.style.zIndex = String(z);
    el.dataset.focusPinned = "1";
  };

  pin(map, 40);
  pin(kicker, 46);
}

export function unpinMobileFocusChrome() {
  const map = document.getElementById("possibility-map");
  const kicker = document.getElementById("frame-kicker");
  if (map) clearFocusPinStyles(map);
  if (kicker) clearFocusPinStyles(kicker);
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

/** Keep scroll locked + chrome pinned while focused. */
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
 * While focused: lock document scroll and keep map/hero pinned.
 * No translateY "lift" — that compounded Safari scroll and emptied the screen.
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
  pinMobileFocusChrome();

  const frameRect = controller.frameEl.getBoundingClientRect();
  document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
}
