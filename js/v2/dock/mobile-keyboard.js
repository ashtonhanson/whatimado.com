import { MOBILE_FOCUS_RELEASE_MS, SNAP } from "./constants.js";
import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";
import { syncMobileFocusLift } from "./mobile-focus-lift.js";

/** Pin prompt above the software keyboard via Visual Viewport — no page scroll */
export function syncMobileKeyboard(controller) {
  if (!controller._mobileMode) return;

  const inset = measureKeyboardInset();
  document.documentElement.style.setProperty("--v2-keyboard-inset", `${inset}px`);

  const keyboardOpen = inset > 48;
  const typing =
    controller.activeSnap === SNAP.MOBILE_FOCUS ||
    controller.frameEl.classList.contains("is-mobile-typing");

  if (keyboardOpen && typing) {
    if (window.scrollX || window.scrollY) {
      window.scrollTo(0, 0);
    }
    const gap = measureCssVarLength("--v2-mobile-keyboard-gap") || 6;
    const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
    controller._keyboardDocked = true;
    controller.frameEl.classList.add("is-mobile-keyboard");
    controller.frameEl.style.removeProperty("top");
    controller.frameEl.style.bottom = `${Math.max(0, inset + gap - promptDrop)}px`;
    document.body.classList.add("is-mobile-keyboard-open");
    syncMobileFocusLift(controller);
    return;
  }

  clearKeyboardDock(controller);
  syncMobileFocusLift(controller);
}

export function clearKeyboardDock(
  controller,
  { animate = false, keepFocusLayout = false, durationMs = MOBILE_FOCUS_RELEASE_MS } = {}
) {
  if (!controller._keyboardDocked && !controller.frameEl.classList.contains("is-mobile-keyboard")) {
    document.body.classList.remove("is-mobile-keyboard-open");
    if (!keepFocusLayout) syncMobileFocusLift(controller);
    return;
  }

  controller._keyboardDocked = false;
  controller.frameEl.classList.remove("is-mobile-keyboard");
  controller.frameEl.style.removeProperty("bottom");
  document.body.classList.remove("is-mobile-keyboard-open");

  if (!controller._mobileMode || !controller.mainEl) {
    if (!keepFocusLayout) syncMobileFocusLift(controller);
    return;
  }

  const anchors = controller._refreshAnchors();
  if (!anchors) return;

  const target =
    controller.activeSnap === SNAP.MOBILE_COLLAPSED ? anchors.collapsedTop : anchors.homePromptTop;

  if (animate && controller._motionEnabled) {
    controller._easeToAnchor(target, controller.activeSnap, {
      durationMs,
      onTick: () => {
        if (keepFocusLayout || document.body.classList.contains("is-mobile-composer-focus")) {
          syncMobileFocusLift(controller, { allowResync: false, animateMap: false });
        }
      }
    });
    return;
  }

  controller._applyTop(target, { snap: controller.activeSnap });
  if (!keepFocusLayout) syncMobileFocusLift(controller);
}
