import { SNAP } from "./constants.js";
import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";
import { syncMobileFocusLift } from "./mobile-focus-lift.js";

/**
 * Pin prompt above the software keyboard (Visual Viewport inset).
 * Always re-lock document scroll first — iOS scrolls the page on focus.
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

  if (focused) {
    syncMobileFocusLift(controller);
  }

  if (keyboardOpen && typing && focused) {
    const gap = measureCssVarLength("--v2-mobile-keyboard-gap") || 6;
    const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
    const vv = window.visualViewport;
    // Pin to the visual viewport bottom (not layout viewport) so the prompt
    // stays above the keyboard even when Safari shifts offsetTop.
    const visualBottomGap = vv
      ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height))
      : inset;
    const bottom = Math.max(0, visualBottomGap + gap - promptDrop);

    controller._keyboardDocked = true;
    controller.frameEl.classList.add("is-mobile-keyboard");
    controller.frameEl.style.removeProperty("top");
    controller.frameEl.style.bottom = `${bottom}px`;
    document.body.classList.add("is-mobile-keyboard-open");
    syncMobileFocusLift(controller);
    return;
  }

  if (focused && !keyboardOpen) {
    if (controller._keyboardDocked) {
      clearKeyboardDock(controller, { keepFocusLayout: true });
    }
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
  document.body.classList.remove("is-mobile-keyboard-open");

  if (!controller._mobileMode || !controller.mainEl) {
    if (!keepFocusLayout) syncMobileFocusLift(controller);
    return;
  }

  const anchors = controller._refreshAnchors();
  if (!anchors) return;

  const target = {
    [SNAP.MOBILE_EXPANDED]: anchors.expandedTop ?? anchors.topLock,
    [SNAP.MOBILE_COLLAPSED]: anchors.readingTop ?? anchors.collapsedTop,
    [SNAP.MOBILE_FOCUS]: controller._mobileChatSheet
      ? anchors.mapFocusTop ?? anchors.typingTop
      : anchors.homePromptTop
  }[controller.activeSnap] ?? anchors.homePromptTop;

  controller._applyTop(target, { snap: controller.activeSnap });
  if (!keepFocusLayout) syncMobileFocusLift(controller);
}
