import { SNAP } from "./constants.js";
import { measureCssVarLength, measureKeyboardInset } from "../layout/measure-css-var.js";
import { syncMobileFocusLift, syncMobileReadingMap } from "./mobile-focus-lift.js";

/** Minimum sheet height (drag rail + composer) so the prompt cannot collapse away. */
const MIN_KEYBOARD_SHEET_H = 132;
/** Ignore brief inset=0 blips while iOS is still opening/closing the keyboard. */
const KEYBOARD_CLOSE_GRACE_MS = 220;

/**
 * Pin prompt above the software keyboard (Visual Viewport inset).
 * Always re-lock document scroll first — iOS scrolls the page on focus.
 *
 * Inside a mission (chat sheet / reading): keep the frame top frozen and only
 * raise the bottom above the keyboard so the composer stays visible. Do not
 * re-anchor top or refit the map — that was jumping the sheet and scaling the
 * constellation into the menu bar.
 */
export function syncMobileKeyboard(controller) {
  if (!controller._mobileMode) return;

  const inset = measureKeyboardInset();
  document.documentElement.style.setProperty("--v2-keyboard-inset", `${inset}px`);

  const keyboardOpen = inset > 48;
  const typing =
    controller.activeSnap === SNAP.MOBILE_FOCUS ||
    controller.frameEl.classList.contains("is-mobile-typing");
  const chatReading =
    Boolean(controller._mobileChatSheet) &&
    (controller.activeSnap === SNAP.MOBILE_COLLAPSED ||
      controller.activeSnap === SNAP.MOBILE_EXPANDED ||
      controller.frameEl.classList.contains("is-mobile-reading"));
  const focused = document.body.classList.contains("is-mobile-composer-focus");

  if (focused) {
    syncMobileFocusLift(controller);
  }

  /*
   * Any focused composer with the keyboard open must stay docked above the keys.
   * Requiring only typing/reading snaps left some states undocked, so the sheet
   * vanished when iOS resized the visual viewport.
   */
  if (keyboardOpen && focused) {
    if (controller._keyboardCloseTimer != null) {
      window.clearTimeout(controller._keyboardCloseTimer);
      controller._keyboardCloseTimer = null;
    }

    const gap = measureCssVarLength("--v2-mobile-keyboard-gap") || 12;
    const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
    const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
    const vv = window.visualViewport;
    // Pin to the visual viewport bottom (not layout viewport) so the prompt
    // stays above the keyboard even when Safari shifts offsetTop.
    const visualBottomGap = vv
      ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height))
      : inset;
    const bottom = Math.max(0, visualBottomGap + gap - promptDrop);

    controller._keyboardDocked = true;
    controller.frameEl.classList.add("is-mobile-keyboard");
    controller.frameEl.style.bottom = `${bottom}px`;
    /* bottom already tracks visualViewport; do not translateY(offsetTop) — that
     * pushed the fixed sheet below the visible area and hid the prompt. */
    controller.frameEl.style.removeProperty("transform");

    if (chatReading || (!typing && controller._mobileChatSheet)) {
      /*
       * Freeze the sheet top for the keyboard session, but clamp so top+bottom
       * never collapse the sheet to zero height (that made the prompt vanish).
       */
      if (!Number.isFinite(controller._keyboardFrozenTop)) {
        const styled = Number.parseFloat(controller.frameEl.style.top);
        const currentTop = Number.isFinite(styled)
          ? styled
          : controller.frameEl.getBoundingClientRect().top;
        controller._keyboardFrozenTop = Math.max(0, currentTop);
      }
      const maxTop = Math.max(headerH + 8, window.innerHeight - bottom - MIN_KEYBOARD_SHEET_H);
      const top = Math.min(controller._keyboardFrozenTop, maxTop);
      controller.frameEl.style.top = `${top}px`;
    } else {
      controller._keyboardFrozenTop = null;
      controller.frameEl.style.removeProperty("top");
    }

    document.body.classList.add("is-mobile-keyboard-open");
    /* Focus lift is a no-op for chat sheets (map frozen); still lock scroll. */
    syncMobileFocusLift(controller);
    return;
  }

  if (focused && !keyboardOpen) {
    if (controller._keyboardDocked) {
      // Debounce: iOS often reports inset 0 for a frame while the keyboard is settling.
      if (controller._keyboardCloseTimer == null) {
        controller._keyboardCloseTimer = window.setTimeout(() => {
          controller._keyboardCloseTimer = null;
          if (!document.body.classList.contains("is-mobile-composer-focus")) return;
          if (measureKeyboardInset() > 48) {
            syncMobileKeyboard(controller);
            return;
          }
          clearKeyboardDock(controller, { keepFocusLayout: true });
        }, KEYBOARD_CLOSE_GRACE_MS);
      }
    }
    return;
  }

  if (controller._keyboardCloseTimer != null) {
    window.clearTimeout(controller._keyboardCloseTimer);
    controller._keyboardCloseTimer = null;
  }
  clearKeyboardDock(controller);
}

export function clearKeyboardDock(controller, { keepFocusLayout = false } = {}) {
  if (controller._keyboardCloseTimer != null) {
    window.clearTimeout(controller._keyboardCloseTimer);
    controller._keyboardCloseTimer = null;
  }

  if (!controller._keyboardDocked && !controller.frameEl.classList.contains("is-mobile-keyboard")) {
    document.body.classList.remove("is-mobile-keyboard-open");
    controller.frameEl.style.removeProperty("transform");
    if (!keepFocusLayout) syncMobileFocusLift(controller);
    if (controller._mobileChatSheet) syncMobileReadingMap(controller);
    return;
  }

  controller._keyboardDocked = false;
  controller._keyboardFrozenTop = null;
  controller.frameEl.classList.remove("is-mobile-keyboard");
  document.body.classList.remove("is-mobile-keyboard-open");
  controller.frameEl.style.removeProperty("transform");

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
  if (controller._mobileChatSheet) syncMobileReadingMap(controller);
}
