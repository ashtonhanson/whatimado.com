import { MOBILE_FOCUS_RELEASE_MS, MOBILE_LAYOUT_FADE_MS } from "./constants.js";
import { clearKeyboardDock } from "./mobile-keyboard.js";
import {
  measureCssVarLength,
  measureKeyboardInset,
  measureMobileFocusBandRise,
  measureMobileFocusMapRise
} from "../layout/measure-css-var.js";

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

/** Re-pack map + hero after rotation while the composer stays focused. */
export function scheduleMobileComposerFocusResync(controller) {
  if (!controller._mobileMode || !document.body.classList.contains("is-mobile-composer-focus")) {
    return;
  }

  const run = () => syncMobileFocusLift(controller, { allowResync: false, animateMap: false });

  requestAnimationFrame(run);

  clearFocusOrientationTimers(controller);
  controller._focusOrientationTimer = window.setTimeout(run, 150);
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

/** Smoothly leave composer focus — crossfade kicker while frame eases off the keyboard. */
export function releaseMobileComposerFocus(controller, { onComplete } = {}) {
  if (!controller._mobileMode) {
    onComplete?.();
    return;
  }

  cancelMobileComposerFocusRelease(controller);

  if (!document.body.classList.contains("is-mobile-composer-focus")) {
    clearKeyboardDock(controller);
    onComplete?.();
    return;
  }

  const kicker = document.getElementById("frame-kicker");
  const wasKeyboard = controller._keyboardDocked;
  kicker?.classList.add("is-mobile-composer-unfocusing");

  clearKeyboardDock(controller, {
    animate: true,
    keepFocusLayout: true,
    durationMs: MOBILE_FOCUS_RELEASE_MS
  });

  const fadeMs =
    wasKeyboard && controller._motionEnabled ? MOBILE_FOCUS_RELEASE_MS : MOBILE_LAYOUT_FADE_MS;

  controller._focusReleaseTimer = window.setTimeout(() => {
    document.body.classList.remove("is-mobile-composer-focus");
    document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
    document.getElementById("possibility-map")?.resetMobileFocusBand?.({ animate: true });
    kicker?.classList.remove("is-mobile-composer-unfocusing");
    controller._focusReleaseTimer = null;
    onComplete?.();
  }, fadeMs);
}

export function syncMobileFocusLift(controller, { allowResync = true, animateMap = true } = {}) {
  if (!controller._mobileMode) return;

  if (!document.body.classList.contains("is-mobile-composer-focus")) {
    document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
    document.getElementById("possibility-map")?.resetMobileFocusBand?.({ animate: true });
    return;
  }

  const kicker = document.getElementById("frame-kicker");
  const mapEl = document.getElementById("possibility-map");
  if (!kicker) return;

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const mapHeadGap = measureCssVarLength("--v2-mobile-focus-map-head-gap") || 10;
  const youHeroGap = measureCssVarLength("--v2-mobile-focus-you-hero-gap") || 0;
  const bandRise = measureMobileFocusBandRise();
  const mapRise = measureMobileFocusMapRise();
  const keyboardOpen = measureKeyboardInset() > 48;
  const bandTop = headerH + mapHeadGap;

  const applyStackLayout = () => {
    const frameRect = controller.frameEl.getBoundingClientRect();
    const brandEl = kicker.querySelector(".v2-kicker-brand");
    const youRect = mapEl?.getStartNodeScreenRect?.();
    let kickerShift = 0;

    /** Anchor hero stack from the prompt frame top — updated every layout pass */
    document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);

    if (youRect && brandEl) {
      const brandTop = brandEl.getBoundingClientRect().top + bandRise;
      kickerShift = Math.round(youRect.bottom + mapRise + youHeroGap - brandTop);
    } else if (youRect) {
      const kickerRect = kicker.getBoundingClientRect();
      kickerShift = Math.round(
        youRect.bottom + mapRise + youHeroGap - (kickerRect.top + bandRise)
      );
    }

    document.documentElement.style.setProperty(
      "--v2-mobile-focus-kicker-shift",
      `${kickerShift}px`
    );
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");

    if (youRect) {
      const mapBandBottom = youRect.bottom + youHeroGap;
      document.documentElement.style.setProperty(
        "--v2-mobile-focus-band-h",
        `${Math.max(0, mapBandBottom - bandTop)}px`
      );
    }
  };

  mapEl?.syncMobileFocusBand?.({ animate: animateMap });
  applyStackLayout();
  requestAnimationFrame(() => {
    applyStackLayout();
    requestAnimationFrame(applyStackLayout);
  });

  if (keyboardOpen && allowResync && !controller._focusLiftResyncScheduled) {
    controller._focusLiftResyncScheduled = true;
    window.setTimeout(() => {
      controller._focusLiftResyncScheduled = false;
      if (document.body.classList.contains("is-mobile-composer-focus")) {
        syncMobileFocusLift(controller, { allowResync: false });
      }
    }, 150);
  }
}
