import { FLICK_VEL_BIAS, SNAP } from "./constants.js";
import { measureCssVarLength, viewportHeight } from "../layout/measure-css-var.js";

/**
 * Top Lock — aligned with sidebar top edges in main coordinates.
 * @param {HTMLElement} mainEl
 */
export function measureTopLock(mainEl) {
  const mainRect = mainEl.getBoundingClientRect();
  const rail =
    document.querySelector(".v2-rail--left") || document.querySelector(".v2-rail--right");

  if (!rail) return 0;

  const railRect = rail.getBoundingClientRect();
  return Math.max(0, railRect.top - mainRect.top);
}

/**
 * Home Base — one-third from viewport top (hero-covered position after dismiss).
 * @param {HTMLElement} mainEl
 */
export function measureHomeBase(mainEl) {
  const mainRect = mainEl.getBoundingClientRect();
  const vh = viewportHeight();
  const viewportHome = vh / 3;
  return viewportHome - mainRect.top;
}

/**
 * Upper gap: frame top → composer top (used for symmetric bottom cushion).
 * @param {HTMLElement} frameEl
 */
export function measureFrameTopToComposerGap(frameEl) {
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  if (!composer) return 0;

  const frameRect = frameEl.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  return Math.max(0, composerRect.top - frameRect.top);
}

/**
 * Gap between frame outer bottom and composer top — legacy metric.
 * @param {HTMLElement} frameEl
 */
export function measureFrameBottomToComposerGap(frameEl) {
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  if (!composer) return 0;

  const frameRect = frameEl.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  return Math.max(0, frameRect.bottom - composerRect.top);
}

/**
 * Minimum collapsed panel chrome on mobile (drag handle + composer + inset).
 * @param {HTMLElement} frameEl
 */
export function measureMobileFrameChrome(frameEl) {
  const drag = frameEl.querySelector(".whatimado-frame__drag-rail");
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  const dragH = drag?.getBoundingClientRect().height ?? 26;
  const composerH = composer?.getBoundingClientRect().height ?? 68;
  return Math.max(104, dragH + composerH + 14);
}

/**
 * Distance from frame top edge to composer top (layout px).
 * @param {HTMLElement} frameEl
 */
export function measureMobileComposerOffset(frameEl) {
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  if (!composer) return measureMobileFrameChrome(frameEl) - 68;
  return Math.max(0, composer.offsetTop);
}

/**
 * Mobile anchors — map/kicker stay fixed; frame glides between typing and bottom reading.
 * @param {HTMLElement} mainEl
 * @param {HTMLElement} frameEl
 */
export function measureMobileAnchors(mainEl, frameEl) {
  const mainRect = mainEl.getBoundingClientRect();
  const mainH = mainEl.clientHeight;
  const vh = viewportHeight();
  const quarterIn = measureCssVarLength("--v2-mobile-quarter-in") || 24;
  const bottomInset = measureCssVarLength("--v2-mobile-bottom-inset") || 12;
  const promptKickerGap = measureCssVarLength("--v2-mobile-prompt-kicker-gap") || 6;
  const composerOffset = measureMobileComposerOffset(frameEl);
  const chromeH = measureMobileFrameChrome(frameEl);

  const kicker = document.getElementById("frame-kicker");
  let homePromptTop = Math.max(0, vh * 0.5 - quarterIn - mainRect.top - composerOffset);
  if (kicker) {
    const kickerRect = kicker.getBoundingClientRect();
    const composer = frameEl.querySelector(".whatimado-frame__composer");
    const typingCompact =
      frameEl.classList.contains("is-mobile-typing") &&
      !frameEl.classList.contains("is-mobile-reading");
    const anchorOffset =
      typingCompact && composer ? Math.max(0, composer.offsetTop) : 0;
    homePromptTop = kickerRect.bottom - mainRect.top + promptKickerGap - anchorOffset;
  }

  /** Typing/focus — same as home load: just below the subheader */
  const typingTop = homePromptTop;

  const content = frameEl.querySelector(".whatimado-frame__body-content");
  const contentH = content?.scrollHeight ?? 0;
  const frameH = Math.max(chromeH, chromeH + contentH + 8);
  const bottomTop = Math.max(typingTop, mainH - frameH - bottomInset);

  /**
   * Reading — prompt frame top at ¼ viewport so the sheet covers the lower ¾.
   * Node map sits in the remaining band under the menu.
   */
  const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
  const readingTop = Math.max(0, vh * 0.25 - mainRect.top - promptDrop);

  return {
    topLock: typingTop,
    homeBase: typingTop,
    bottomCushion: bottomTop,
    maxGrowTop: typingTop,
    focusTop: typingTop,
    typingTop,
    homePromptTop,
    collapsedTop: readingTop,
    chromeH,
    bottomInset,
    mainH
  };
}

/**
 * @param {number} topPx
 * @param {number} velocityY
 * @param {{ collapsedTop: number, focusTop: number }} anchors
 */
export function resolveMobileSnap(topPx, velocityY, anchors) {
  const mid = (anchors.collapsedTop + anchors.typingTop) / 2;
  const biasedTop = topPx + velocityY * FLICK_VEL_BIAS;
  return biasedTop <= mid ? SNAP.MOBILE_FOCUS : SNAP.MOBILE_COLLAPSED;
}

export function measureAnchors(mainEl, frameEl, cache = {}) {
  const mainH = mainEl.clientHeight;
  const topLock = measureTopLock(mainEl);
  const homeBase = measureHomeBase(mainEl);

  /**
   * Bottom Cushion — authoritative snap from clean screenshot.
   * Frame top sits at mainH minus the fixed offset token.
   * Do not clamp with minDockedH — that heuristic (~225px) always beat the
   * screenshot token (~92px) and pushed the anchor ~130px too high.
   */
  const snapTopOffset = measureCssVarLength("--v2-bottom-snap-top-offset");
  let bottomCushion = mainH - snapTopOffset;

  bottomCushion = Math.max(bottomCushion, topLock);

  const minFrameBand = 48;
  const clampedHomeBase = Math.min(homeBase, bottomCushion - minFrameBand);

  return {
    topLock,
    homeBase: Math.max(topLock, clampedHomeBase),
    bottomCushion,
    mainH
  };
}

/**
 * Midway gravity zone boundaries between anchor pairs.
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 */
export function computeSnapZones(anchors) {
  return {
    midTopHome: (anchors.topLock + anchors.homeBase) / 2,
    midHomeBottom: (anchors.homeBase + anchors.bottomCushion) / 2
  };
}

/**
 * @param {number} topPx
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 */
export function clampTop(topPx, anchors) {
  return Math.max(anchors.topLock, Math.min(topPx, anchors.bottomCushion));
}

/**
 * Choose snap target from position, midway zones, and release velocity (flick bias).
 * @param {number} topPx
 * @param {number} velocityY px/frame — positive = moving downward
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 * @returns {typeof SNAP[keyof typeof SNAP]}
 */
export function resolveSnap(topPx, velocityY, anchors) {
  const { midTopHome, midHomeBottom } = computeSnapZones(anchors);

  /** Velocity shifts the effective release point for natural flick overshoot */
  const biasedTop = topPx + velocityY * FLICK_VEL_BIAS;

  if (biasedTop < midTopHome) return SNAP.TOP;
  if (biasedTop < midHomeBottom) return SNAP.HOME;
  return SNAP.BOTTOM;
}

/**
 * @param {number} frameTop
 * @param {HTMLElement} mainEl
 */
export function mapDimStrength(frameTop, mainEl) {
  const mapEl = document.getElementById("possibility-map");
  const mainRect = mainEl.getBoundingClientRect();

  /** Graph band only — not the full-height pan surface (which caused constant dimming) */
  const mapStage = mapEl?.querySelector(".whatimado-map__stage");
  const mapBottom = mapStage
    ? mapStage.getBoundingClientRect().bottom - mainRect.top
    : mapEl
      ? mapEl.getBoundingClientRect().bottom - mainRect.top
      : mainEl.clientHeight * 0.42;

  if (frameTop >= mapBottom) return 0;
  const overlap = mapBottom - frameTop;
  return Math.min(1, overlap / Math.max(mapBottom * 0.85, 120));
}
