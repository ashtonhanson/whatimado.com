import { SNAP } from "./constants.js";
import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";
import { syncMobileFocusLift } from "./mobile-focus-lift.js";

/** Pin prompt above the software keyboard via Visual Viewport — no page scroll */
export function syncMobileKeyboard(controller) {
  if (!controller._mobileMode) return;

  const inset = measureKeyboardInset();
  document.documentElement.style.setProperty("--v2-keyboard-inset", `${inset}px`);

  if (window.scrollX || window.scrollY) {
    window.scrollTo(0, 0);
  }

  const keyboardOpen = inset > 48;
  const typing =
    controller.activeSnap === SNAP.MOBILE_FOCUS ||
    controller.frameEl.classList.contains("is-mobile-typing");

  if (keyboardOpen && typing) {
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

export function clearKeyboardDock(controller) {
  if (!controller._keyboardDocked && !controller.frameEl.classList.contains("is-mobile-keyboard")) {
    document.body.classList.remove("is-mobile-keyboard-open");
    syncMobileFocusLift(controller);
    return;
  }

  controller._keyboardDocked = false;
  controller.frameEl.classList.remove("is-mobile-keyboard");
  controller.frameEl.style.removeProperty("bottom");
  document.body.classList.remove("is-mobile-keyboard-open");

  if (!controller._mobileMode || !controller.mainEl) return;

  const anchors = controller._refreshAnchors();
  if (!anchors) return;

  const target =
    controller.activeSnap === SNAP.MOBILE_COLLAPSED ? anchors.collapsedTop : anchors.homePromptTop;
  controller._applyTop(target, { snap: controller.activeSnap });
  syncMobileFocusLift(controller);
}
