/**
 * Sync frame dock + map gravity after content or viewport changes.
 * @param {{
 *   frameEl?: import("../components/whatimado-frame.js").WhatimadoFrame | null,
 *   mapEl?: import("../components/whatimado-map.js").WhatimadoMap | null
 * }} ctx
 */
export function notifyFrameLayout({ frameEl, mapEl }) {
  frameEl?.notifyContentChange();
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  const composerFocus = document.body.classList.contains("is-mobile-composer-focus");

  if (mobile) {
    frameEl?.remeasureDock();
    if (composerFocus) {
      frameEl?.scheduleMobileComposerFocusResync();
      return;
    }
  } else {
    frameEl?.remeasureDock();
  }

  if (!frameEl?.isDockSettling()) {
    mapEl?.syncFrameGravity({ animate: false });
  }
}
