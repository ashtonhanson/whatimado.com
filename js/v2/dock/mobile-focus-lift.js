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
  const heroClearGap = measureCssVarLength("--v2-mobile-focus-hero-gap") || 5;
  const youHeroGap = measureCssVarLength("--v2-mobile-focus-you-hero-gap") || 0;
  const bandRise = measureMobileFocusBandRise();
  const mapRise = measureMobileFocusMapRise();

  const subEl = kicker.querySelector(".v2-kicker-sub");
  const brandEl = kicker.querySelector(".v2-kicker-brand");
  const keyboardOpen = measureKeyboardInset() > 48;
  const bandTop = headerH + mapHeadGap;

  const applyStackLayout = () => {
    const freshKickerRect = kicker.getBoundingClientRect();
    const freshFrameRect = controller.frameEl.getBoundingClientRect();
    const youRect = mapEl?.getStartNodeScreenRect?.();
    let kickerShift = 0;

    if (youRect && brandEl) {
      const brandTop = brandEl.getBoundingClientRect().top + bandRise;
      kickerShift = Math.round(youRect.bottom + mapRise + youHeroGap - brandTop);
    } else if (youRect) {
      kickerShift = Math.round(
        youRect.bottom + mapRise + youHeroGap - (freshKickerRect.top + bandRise)
      );
    }

    document.documentElement.style.setProperty(
      "--v2-mobile-focus-kicker-shift",
      `${kickerShift}px`
    );

    const composer = controller.frameEl.querySelector(".whatimado-frame__composer");
    const promptTop = composer?.getBoundingClientRect().top ?? freshFrameRect.top;
    const subBottom = (subEl ?? kicker).getBoundingClientRect().bottom;
    const bandBottom = promptTop - heroClearGap;
    const lift = Math.max(0, Math.ceil(subBottom - bandBottom));

    if (youRect) {
      const mapBandBottom = youRect.bottom + youHeroGap;
      document.documentElement.style.setProperty(
        "--v2-mobile-focus-band-h",
        `${Math.max(0, mapBandBottom - bandTop)}px`
      );
    }

    document.documentElement.style.setProperty("--v2-mobile-focus-lift", `${lift}px`);
  };

  mapEl?.syncMobileFocusBand?.({ animate: animateMap });
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
