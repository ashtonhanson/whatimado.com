import { PHASE } from "./phases.js";

export const SHARE_IMAGE_VERSION = "20260928";
export const SHARE_IMAGE_MAP = "/assets/v2/og/og-card.png";
export const SHARE_IMAGE_BLANK = "/assets/v2/og/og-blank.png";

const MAP_PHASES = new Set([PHASE.POSSIBILITIES, PHASE.PATH_SELECTED, PHASE.MISSIONS]);

/**
 * Crawlers only read the static head (og-card). This keeps the live document honest for
 * in-page share tools: no map yet means the blank-slate card.
 * @param {string | undefined} phase
 * @param {string} origin
 */
export function shareImageForPhase(phase, origin) {
  const path = MAP_PHASES.has(/** @type {any} */ (phase)) ? SHARE_IMAGE_MAP : SHARE_IMAGE_BLANK;
  return `${origin}${path}?v=${SHARE_IMAGE_VERSION}`;
}

export function initShareMeta() {
  const targets = document.querySelectorAll('meta[property="og:image"][data-share-live], meta[name="twitter:image"]');
  if (!targets.length) return;
  const sync = () => {
    const url = shareImageForPhase(document.body.dataset.phase, window.location.origin);
    targets.forEach((meta) => {
      if (meta.getAttribute("content") !== url) meta.setAttribute("content", url);
    });
  };
  sync();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["data-phase"] });
}
