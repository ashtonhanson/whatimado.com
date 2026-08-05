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

  if (mobile && composerFocus) {
    frameEl?.syncMobileKeyboard();
    return;
  }

  frameEl?.remeasureDock();

  // Mobile sheet snaps are independent of the node map — don't re-lay it out.
  if (mobile) return;

  if (!frameEl?.isDockSettling()) {
    mapEl?.syncFrameGravity({ animate: false });
  }
}
