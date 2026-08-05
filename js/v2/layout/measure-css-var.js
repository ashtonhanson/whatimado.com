/**
 * Shared CSS custom-property measurement helpers.
 */

/**
 * Keyboard overlap above the layout viewport bottom (Visual Viewport API).
 * @returns {number}
 */
export function measureKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/** @returns {number} */
export function viewportHeight() {
  return window.innerHeight;
}

/**
 * Resolve a CSS custom property to pixels (handles clamp/calc via layout).
 * @param {string} varName
 * @param {HTMLElement} [contextEl]
 */
export function measureCssVarLength(varName, contextEl = document.documentElement) {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;height:var(" +
    varName +
    ");width:0;";
  contextEl.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

/** Focus band rise is authored on body — :root fallback reads as 0. */
export function measureMobileFocusBandRise() {
  if (!document.body.classList.contains("is-mobile-composer-focus")) return 0;
  return measureCssVarLength("--v2-mobile-focus-band-rise", document.body);
}

/** @returns {number} */
export function measureMobileFocusMapRise() {
  if (!document.body.classList.contains("is-mobile-composer-focus")) return 0;
  return measureCssVarLength("--v2-mobile-focus-map-rise", document.body);
}
