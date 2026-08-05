import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";

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

/** Viewport/orientation: one immediate lift sync — no timed retries. */
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
  document.getElementById("frame-kicker")?.classList.remove("is-mobile-composer-unfocusing");
}

/** Instant blur — clear focus class + lift vars (keyboard dock cleared by syncMobileKeyboard). */
export function releaseMobileComposerFocus(controller, { onComplete } = {}) {
  cancelMobileComposerFocusRelease(controller);
  document.body.classList.remove("is-mobile-composer-focus");
  document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
  onComplete?.();
}

/**
 * Deterministic focus lift only.
 * Landing map/hero transforms stay as baseline; when the keyboard is open and
 * the composer is focused, lift map+hero together so hero sits above the
 * keyboard-pinned prompt. No map pan, no scroll, no multi-pass timers.
 */
export function syncMobileFocusLift(controller) {
  if (!controller._mobileMode) return;

  if (!document.body.classList.contains("is-mobile-composer-focus")) {
    document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
    return;
  }

  const kicker = document.getElementById("frame-kicker");
  if (!kicker) return;

  const frameRect = controller.frameEl.getBoundingClientRect();
  document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);
  document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");

  if (measureKeyboardInset() <= 48) {
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    return;
  }

  const heroGap = measureCssVarLength("--v2-mobile-focus-hero-gap", document.body) || 8;
  const currentLift = measureCssVarLength("--v2-mobile-focus-lift") || 0;
  // Transform already includes -lift; recover landing (unlifted) kicker bottom.
  const unliftedKickerBottom = kicker.getBoundingClientRect().bottom + currentLift;
  const targetKickerBottom = frameRect.top - heroGap;
  const lift = Math.max(0, Math.round(unliftedKickerBottom - targetKickerBottom));
  document.documentElement.style.setProperty("--v2-mobile-focus-lift", `${lift}px`);
}
