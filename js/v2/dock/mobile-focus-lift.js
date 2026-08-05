import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";

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
    document.body.style.removeProperty("--v2-mobile-focus-prompt-top");
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
    document.getElementById("possibility-map")?.resetMobileFocusBand?.({ animate: true });
    return;
  }

  const kicker = document.getElementById("frame-kicker");
  const mapEl = document.getElementById("possibility-map");
  if (!kicker) return;

  const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
  const mapHeadGap = measureCssVarLength("--v2-mobile-focus-map-head-gap") || 10;
  const youHeroGap = measureCssVarLength("--v2-mobile-focus-you-hero-gap", document.body) || 5;
  const keyboardOpen = measureKeyboardInset() > 48;
  const bandTop = headerH + mapHeadGap;

  const applyHeroAnchor = () => {
    const frameRect = controller.frameEl.getBoundingClientRect();
    document.body.style.setProperty("--v2-mobile-focus-prompt-top", `${frameRect.top}px`);
    document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");

    const youRect = mapEl?.getStartNodeScreenRect?.();
    if (youRect) {
      document.documentElement.style.setProperty(
        "--v2-mobile-focus-band-h",
        `${Math.max(0, youRect.bottom + youHeroGap - bandTop)}px`
      );
    }
  };

  const resyncMap = (animate) => {
    applyHeroAnchor();
    mapEl?.syncMobileFocusBand?.({ animate });
  };

  resyncMap(animateMap);
  requestAnimationFrame(() => {
    resyncMap(false);
    requestAnimationFrame(() => resyncMap(false));
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
