import { SNAP } from "./constants.js";
import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";
import { syncMobileFocusLift } from "./mobile-focus-lift.js";

/**
 * Pin prompt above the software keyboard (Visual Viewport inset).
 * No window.scrollTo / scrollIntoView. Instant bottom dock + lift sync.
 */
export function syncMobileKeyboard(controller) {
  if (!controller._mobileMode) return;

  const inset = measureKeyboardInset();
  document.documentElement.style.setProperty("--v2-keyboard-inset", `${inset}px`);

  const keyboardOpen = inset > 48;
  const typing =
    controller.activeSnap === SNAP.MOBILE_FOCUS ||
    controller.frameEl.classList.contains("is-mobile-typing");
  const focused = document.body.classList.contains("is-mobile-composer-focus");

  if (keyboardOpen && typing && focused) {
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

  if (focused && !keyboardOpen) {
    if (controller._keyboardDocked) {
      clearKeyboardDock(controller, { keepFocusLayout: true });
    }
    syncMobileFocusLift(controller);
    return;
  }

  clearKeyboardDock(controller);
}

export function clearKeyboardDock(controller, { keepFocusLayout = false } = {}) {
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
  controller._applyTop(target, { snap: controller.activeSnap });
  if (!keepFocusLayout) syncMobileFocusLift(controller);
}
