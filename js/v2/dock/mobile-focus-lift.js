import {
  measureCssVarLength,
  measureKeyboardInset,
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
  run();
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });

  clearFocusOrientationTimers(controller);
  controller._focusOrientationTimer = window.setTimeout(run, 150);
  controller._focusOrientationTimer2 = window.setTimeout(run, 420);
}

export function syncMobileFocusLift(controller, { allowResync = true, animateMap = true } = {}) {
  if (!controller._mobileMode) return;

  if (!document.body.classList.contains("is-mobile-composer-focus")) {
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
  const heroClearGap = measureCssVarLength("--v2-mobile-focus-hero-gap", document.body) || 10;
  const youHeroGap = measureCssVarLength("--v2-mobile-focus-you-hero-gap", document.body) || 5;
  const mapRise = measureMobileFocusMapRise();
  const keyboardOpen = measureKeyboardInset() > 48;
  const bandTop = headerH + mapHeadGap;

  const applyStackLayout = () => {
    const freshFrameRect = controller.frameEl.getBoundingClientRect();
    const youRect = mapEl?.getStartNodeScreenRect?.();
    const brandEl = kicker.querySelector(".v2-kicker-brand");
    const subEl = kicker.querySelector(".v2-kicker-sub");

    /** YOU node → hero title gap (landing stack) */
    if (youRect && brandEl) {
      document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
      const brandTopBase = brandEl.getBoundingClientRect().top;
      const kickerShift = Math.round(youRect.bottom + mapRise + youHeroGap - brandTopBase);
      document.documentElement.style.setProperty(
        "--v2-mobile-focus-kicker-shift",
        `${kickerShift}px`
      );
    }

    /** Lift map + hero so subtitle clears the prompt box frame */
    const subBottom = (subEl ?? kicker).getBoundingClientRect().bottom;
    const bandBottom = freshFrameRect.top - heroClearGap;
    const lift = Math.max(0, Math.ceil(subBottom - bandBottom));
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", `${lift}px`);

    if (youRect) {
      document.documentElement.style.setProperty(
        "--v2-mobile-focus-band-h",
        `${Math.max(0, youRect.bottom + youHeroGap - bandTop)}px`
      );
    }
  };

  mapEl?.syncMobileFocusBand?.({ animate: animateMap });
  applyStackLayout();
  requestAnimationFrame(() => {
    mapEl?.syncMobileFocusBand?.({ animate: false });
    applyStackLayout();
    requestAnimationFrame(() => {
      mapEl?.syncMobileFocusBand?.({ animate: false });
      applyStackLayout();
    });
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
