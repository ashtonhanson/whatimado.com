/** Vertical frame dock — free drag, inertial glide, midway gravity snap */
export const SNAP = {
  TOP: "top",
  HOME: "home",
  BOTTOM: "bottom",
  MOBILE_COLLAPSED: "mobile-collapsed",
  MOBILE_FOCUS: "mobile-focus"
};

const MOBILE_MQ = window.matchMedia("(max-width: 900px)");
const MOBILE_GROW_EASE_MS = 420;
const MOBILE_GLIDE_EASE_MS = 520;
const MOBILE_HINT_DELAY_MS = 380;

/** Glide tuning — aligned with map node release physics */
const GLIDE_VEL_SCALE = 0.52;
const GLIDE_FRICTION = 0.905;
const GLIDE_MIN_SPEED = 0.06;
const GLIDE_MAX_SPEED = 22;

/** Minimum panel height at Bottom Cushion — uses min height, not live offsetHeight */
const MIN_FRAME_HEIGHT = 260;
const BOTTOM_CONTENT_CUSHION = 36;

/** Minimum vertical band between Home Base and Bottom Cushion (fraction of main height) */
const HOME_BOTTOM_MIN_SEP = 0.2;

/** Final ease into anchor after glide settles */
const SNAP_EASE_MS = 680;

/** Flick bias shifts midway thresholds in the direction of travel (px equivalent) */
const FLICK_VEL_BIAS = 0.38;

const KICKER_RESERVE_DEFAULT = "clamp(4.5rem, 11.5vh, 5.75rem)";

/**
 * Keyboard overlap above the layout viewport bottom (Visual Viewport API).
 * @returns {number}
 */
function measureKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/**
 * Viewport height — layout viewport for anchor math; visual when keyboard is open.
 * @returns {number}
 */
function viewportHeight() {
  return window.innerHeight;
}

/**
 * Resolve a CSS custom property to pixels (handles clamp/calc via layout).
 * @param {string} varName e.g. "--v2-composer-content-gap"
 * @param {HTMLElement} [contextEl]
 */
function measureCssVarLength(varName, contextEl = document.documentElement) {
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
function measureMobileFocusBandRise() {
  if (!document.body.classList.contains("is-mobile-composer-focus")) return 0;
  return measureCssVarLength("--v2-mobile-focus-band-rise", document.body);
}

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
 * Three explicit anchor lines for the frame top edge.
 * @param {HTMLElement} mainEl
 * @param {HTMLElement} frameEl
 * @param {{ defaultFrameHeight?: number|null }} [cache]
 */
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

  return {
    topLock: typingTop,
    homeBase: typingTop,
    bottomCushion: bottomTop,
    maxGrowTop: typingTop,
    focusTop: typingTop,
    typingTop,
    homePromptTop,
    collapsedTop: bottomTop,
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

/** Quintic ease-out — matches node settle feel */
function easeOutQuint(t) {
  return 1 - (1 - t) ** 5;
}

/**
 * @param {{ y: number, t: number }[]} samples
 * @returns {number}
 */
function computeReleaseVelocity(samples) {
  if (samples.length < 2) return 0;

  const last = samples[samples.length - 1];
  const prev = samples[Math.max(0, samples.length - 4)];
  const dt = last.t - prev.t;
  if (dt <= 0) return 0;

  const pxPerMs = (last.y - prev.y) / dt;
  const pxPerFrame = pxPerMs * (1000 / 60);
  return Math.max(-GLIDE_MAX_SPEED, Math.min(GLIDE_MAX_SPEED, pxPerFrame * GLIDE_VEL_SCALE));
}

export class FrameDockController {
  /**
   * @param {HTMLElement} frameEl
   * @param {{ onLayout?: () => void, onDockSettled?: () => void, onDockProgress?: (frameTop: number) => void }} [options]
   */
  constructor(frameEl, options = {}) {
    this.frameEl = frameEl;
    this.onLayout = options.onLayout ?? (() => {});
    this.onDockSettled = options.onDockSettled ?? (() => {});
    this.onDockProgress = options.onDockProgress ?? (() => {});
    this.mainEl = /** @type {HTMLElement|null} */ (frameEl.closest(".v2-main"));
    /** @type {typeof SNAP[keyof typeof SNAP]} */
    this.activeSnap = SNAP.HOME;
    /** @type {number} */
    this._topPx = 0;
    /** @type {number} */
    this._velocityY = 0;
    /** @type {boolean} */
    this._docked = false;
    /** @type {boolean} */
    this._dragging = false;
    /** @type {boolean} */
    this._gliding = false;
    /** @type {boolean} */
    this._settling = false;
    /** @type {{ pointerId: number, startY: number, startTop: number }|null} */
    this._pointer = null;
    /** @type {{ y: number, t: number }[]} */
    this._dragSamples = [];
    /** @type {ReturnType<typeof measureAnchors>|null} */
    this._anchors = null;
    /** @type {number|null} */
    this._dragRaf = null;
    /** @type {number|null} */
    this._glideRaf = null;
    /** @type {number|null} */
    this._settleRaf = null;
    /** @type {number} */
    this._pendingClientY = 0;
    /** @type {number|null} */
    this._defaultFrameHeight = null;
    /** @type {boolean} */
    this._motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /** @type {boolean} */
    this._dockTransition = false;
    /** @type {boolean} */
    this._mobileMode = false;
    /** @type {boolean} */
    this._keyboardDocked = false;
    /** @type {boolean} */
    this._focusLiftResyncScheduled = false;
    /** @type {(() => void)|null} */
    this._mobileViewportHandler = null;
  }

  /** @returns {boolean} */
  _isMobile() {
    return MOBILE_MQ.matches;
  }

  _bindMobileViewportWatch() {
    if (this._mobileViewportHandler || !window.visualViewport) return;

    this._mobileViewportHandler = () => {
      if (!this._mobileMode || !this.mainEl) return;
      this.syncMobileKeyboard();
      if (this._keyboardDocked) return;
      this._anchors = null;
      if (this.activeSnap === SNAP.MOBILE_COLLAPSED) {
        this.growForContent();
      } else {
        this.remeasure();
      }
    };

    window.visualViewport.addEventListener("resize", this._mobileViewportHandler);
    window.visualViewport.addEventListener("scroll", this._mobileViewportHandler);
  }

  _unbindMobileViewportWatch() {
    if (!this._mobileViewportHandler || !window.visualViewport) return;
    window.visualViewport.removeEventListener("resize", this._mobileViewportHandler);
    window.visualViewport.removeEventListener("scroll", this._mobileViewportHandler);
    this._mobileViewportHandler = null;
  }

  _syncMobileFocusLift({ allowResync = true } = {}) {
    if (!this._mobileMode) return;

    if (!document.body.classList.contains("is-mobile-composer-focus")) {
      document.documentElement.style.setProperty("--v2-mobile-focus-lift", "0px");
      document.documentElement.style.setProperty("--v2-mobile-focus-kicker-shift", "0px");
      document.getElementById("possibility-map")?.resetMobileFocusBand?.({ animate: true });
      return;
    }

    const kicker = document.getElementById("frame-kicker");
    const mapEl = document.getElementById("possibility-map");
    if (!kicker) return;

    const headerH = measureCssVarLength("--v2-mobile-header-h") || 56;
    const mapHeadGap = measureCssVarLength("--v2-mobile-focus-map-head-gap") || 10;
    const heroClearGap = measureCssVarLength("--v2-mobile-focus-hero-gap") || 14;
    const youHeroGap = measureCssVarLength("--v2-mobile-focus-you-hero-gap") || 0;
    const heroNudge = measureCssVarLength("--v2-mobile-focus-hero-nudge") || 22;
    const bandRise = measureMobileFocusBandRise();

    const subEl = kicker.querySelector(".v2-kicker-sub");
    const brandEl = kicker.querySelector(".v2-kicker-brand");
    const keyboardOpen = measureKeyboardInset() > 48;
    const bandTop = headerH + mapHeadGap - bandRise;

    const applyStackLayout = () => {
      const freshKickerRect = kicker.getBoundingClientRect();
      const freshFrameRect = this.frameEl.getBoundingClientRect();
      const youRect = mapEl?.getStartNodeScreenRect?.();
      let kickerShift = 0;

      if (youRect && brandEl) {
        const brandTop = brandEl.getBoundingClientRect().top + bandRise;
        kickerShift = Math.round(youRect.bottom + youHeroGap - brandTop);
      } else if (youRect) {
        kickerShift = Math.round(youRect.bottom + youHeroGap - (freshKickerRect.top + bandRise));
      }

      document.documentElement.style.setProperty(
        "--v2-mobile-focus-kicker-shift",
        `${kickerShift}px`
      );

      const subBottom =
        (subEl ?? kicker).getBoundingClientRect().bottom + bandRise + kickerShift - heroNudge;
      const bandBottom = freshFrameRect.top - heroClearGap;
      let lift = Math.max(0, Math.ceil(subBottom - bandBottom));

      const brandTop =
        (brandEl?.getBoundingClientRect().top ?? freshKickerRect.top) +
        bandRise +
        kickerShift -
        heroNudge;
      const maxLift = Math.max(0, Math.ceil(brandTop - bandTop));
      lift = Math.min(lift, maxLift);

      if (youRect) {
        const mapBandBottom = youRect.bottom + youHeroGap;
        document.documentElement.style.setProperty(
          "--v2-mobile-focus-band-h",
          `${Math.max(0, mapBandBottom - bandTop)}px`
        );
      }

      document.documentElement.style.setProperty("--v2-mobile-focus-lift", `${lift}px`);
    };

    mapEl?.syncMobileFocusBand?.({ animate: true });
    requestAnimationFrame(() => {
      applyStackLayout();
      requestAnimationFrame(applyStackLayout);
    });

    if (keyboardOpen && allowResync && !this._focusLiftResyncScheduled) {
      this._focusLiftResyncScheduled = true;
      window.setTimeout(() => {
        this._focusLiftResyncScheduled = false;
        if (document.body.classList.contains("is-mobile-composer-focus")) {
          this._syncMobileFocusLift({ allowResync: false });
        }
      }, 150);
    }
  }

  /** Pin prompt above the software keyboard via Visual Viewport — no page scroll */
  syncMobileKeyboard() {
    if (!this._mobileMode) return;

    const inset = measureKeyboardInset();
    document.documentElement.style.setProperty("--v2-keyboard-inset", `${inset}px`);

    if (window.scrollX || window.scrollY) {
      window.scrollTo(0, 0);
    }

    const keyboardOpen = inset > 48;
    const typing =
      this.activeSnap === SNAP.MOBILE_FOCUS || this.frameEl.classList.contains("is-mobile-typing");

    if (keyboardOpen && typing) {
      const gap = measureCssVarLength("--v2-mobile-keyboard-gap") || 6;
      const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
      this._keyboardDocked = true;
      this.frameEl.classList.add("is-mobile-keyboard");
      this.frameEl.style.removeProperty("top");
      this.frameEl.style.bottom = `${Math.max(0, inset + gap - promptDrop)}px`;
      document.body.classList.add("is-mobile-keyboard-open");
      this._syncMobileFocusLift();
      return;
    }

    this._clearKeyboardDock();
    this._syncMobileFocusLift();
  }

  _clearKeyboardDock() {
    if (!this._keyboardDocked && !this.frameEl.classList.contains("is-mobile-keyboard")) {
      document.body.classList.remove("is-mobile-keyboard-open");
      this._syncMobileFocusLift();
      return;
    }

    this._keyboardDocked = false;
    this.frameEl.classList.remove("is-mobile-keyboard");
    this.frameEl.style.removeProperty("bottom");
    document.body.classList.remove("is-mobile-keyboard-open");

    if (!this._mobileMode || !this.mainEl) return;

    const anchors = this._refreshAnchors();
    if (!anchors) return;

    const target =
      this.activeSnap === SNAP.MOBILE_COLLAPSED ? anchors.collapsedTop : anchors.homePromptTop;
    this._applyTop(target, { snap: this.activeSnap });
    this._syncMobileFocusLift();
  }

  /** @returns {number} */
  get topPx() {
    return this._topPx;
  }

  /** True while the frame is easing into dock after hero dismiss. */
  get isInDockTransition() {
    return this._dockTransition || this._settling;
  }

  /** @returns {boolean} */
  get mobileMode() {
    return this._mobileMode;
  }

  /** Map band height — only during hero dismiss; frozen once dock settles */
  _syncMapBandLayout(frameTopPx) {
    document.documentElement.style.setProperty("--v2-docked-frame-top", `${frameTopPx}px`);
  }

  _anchorCache() {
    return { defaultFrameHeight: this._defaultFrameHeight };
  }

  _refreshAnchors() {
    if (!this.mainEl) return null;
    this._anchors = this._mobileMode
      ? measureMobileAnchors(this.mainEl, this.frameEl)
      : measureAnchors(this.mainEl, this.frameEl, this._anchorCache());
    return this._anchors;
  }

  _captureDefaultMetrics() {
    this._defaultFrameHeight = this.frameEl.offsetHeight;
  }

  _stopMotion() {
    if (this._glideRaf !== null) {
      cancelAnimationFrame(this._glideRaf);
      this._glideRaf = null;
    }
    if (this._settleRaf !== null) {
      cancelAnimationFrame(this._settleRaf);
      this._settleRaf = null;
    }
    this._gliding = false;
    this._settling = false;
    this._dockTransition = false;
    this._velocityY = 0;
    this.frameEl.classList.remove("is-gliding", "is-settling");
  }

  /** Mobile home — draggable sheet decoupled from map/kicker */
  enterMobileOpenLayout() {
    if (!this.mainEl || !this._isMobile()) return;

    this._unbindMobileViewportWatch();
    this._mobileMode = true;
    this._stopMotion();
    this._docked = true;
    this.activeSnap = SNAP.MOBILE_FOCUS;
    this._anchors = null;
    this._defaultFrameHeight = null;
    this._dockTransition = false;

    document.documentElement.style.removeProperty("--v2-docked-frame-top");
    document.documentElement.style.removeProperty("--whatimado-frame-top");
    this.frameEl.style.removeProperty("top");
    this.frameEl.classList.add("is-docked", "is-mobile-docked");
    this.frameEl.classList.remove("is-dragging", "is-animating", "is-gliding", "is-settling");
    this.frameEl.removeAttribute("data-snap");
    document.body.classList.remove("is-hero-dismissing");

    requestAnimationFrame(() => {
      const anchors = this._refreshAnchors();
      if (!anchors) return;
      this._applyTop(anchors.homePromptTop, { snap: SNAP.MOBILE_FOCUS });
      this.frameEl.classList.add("is-mobile-typing");
      this.frameEl.classList.remove("is-mobile-reading");
      this._bindMobileViewportWatch();
      window.setTimeout(() => this.playMobileHint(), MOBILE_HINT_DELAY_MS);
      window.dispatchEvent(new Event("resize"));
    });
  }

  /** Glide prompt to bottom after send — clears the view for the response */
  mobileGlideToBottom() {
    if (!this._mobileMode || !this.mainEl) return;

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    this.activeSnap = SNAP.MOBILE_COLLAPSED;
    this.frameEl.classList.add("is-mobile-reading");
    this.frameEl.classList.remove("is-mobile-typing");

    if (this._motionEnabled) {
      this._easeToAnchor(anchors.collapsedTop, SNAP.MOBILE_COLLAPSED, {
        durationMs: MOBILE_GLIDE_EASE_MS
      });
    } else {
      this._applyTop(anchors.collapsedTop, { snap: SNAP.MOBILE_COLLAPSED });
    }
  }

  /** Re-anchor typing position after compact layout (composer flush below kicker) */
  refreshMobileTypingPosition() {
    if (!this._mobileMode || !this.mainEl || this._keyboardDocked) return;

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    if (this._motionEnabled) {
      this._easeToAnchor(anchors.homePromptTop, SNAP.MOBILE_FOCUS, { durationMs: MOBILE_GLIDE_EASE_MS });
    } else {
      this._applyTop(anchors.homePromptTop, { snap: SNAP.MOBILE_FOCUS });
    }
  }

  /** Glide prompt back to typing position — composer top 1/4in above halfway */
  mobileGlideToTyping() {
    if (!this._mobileMode || !this.mainEl) return;

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    this.activeSnap = SNAP.MOBILE_FOCUS;
    this.frameEl.classList.add("is-mobile-typing");
    this.frameEl.classList.remove("is-mobile-reading");

    const target = anchors.homePromptTop;

    if (this._motionEnabled) {
      this._easeToAnchor(target, SNAP.MOBILE_FOCUS, { durationMs: MOBILE_GLIDE_EASE_MS });
    } else {
      this._applyTop(target, { snap: SNAP.MOBILE_FOCUS });
    }
  }

  /** After hero copy fades on mobile — expand reading sheet for messages */
  enterMobileChatMode() {
    if (!this.mainEl || !this._mobileMode) return;
    this.mobileGlideToBottom();
    this.growForContent();
  }

  /** Subtle pull-up hint that the sheet is draggable */
  playMobileHint() {
    if (!this._mobileMode || !this._motionEnabled || this._dragging) return;
    this.frameEl.classList.remove("is-mobile-hint");
    void this.frameEl.offsetWidth;
    this.frameEl.classList.add("is-mobile-hint");
    const cleanup = () => this.frameEl.classList.remove("is-mobile-hint");
    this.frameEl.addEventListener("animationend", cleanup, { once: true });
    window.setTimeout(cleanup, 1400);
  }

  /**
   * Expand bottom-anchored reading sheet as messages accumulate.
   */
  growForContent() {
    if (!this._mobileMode || !this.mainEl || this._dragging || this._gliding || this._settling) {
      return;
    }

    if (this.activeSnap !== SNAP.MOBILE_COLLAPSED) return;

    const anchors = this._refreshAnchors();
    if (!anchors) return;

    const targetTop = anchors.collapsedTop;
    if (Math.abs(targetTop - this._topPx) < 0.75) return;

    if (this._motionEnabled) {
      this._easeToAnchor(targetTop, SNAP.MOBILE_COLLAPSED, { durationMs: MOBILE_GROW_EASE_MS });
    } else {
      this._applyTop(targetTop, { snap: SNAP.MOBILE_COLLAPSED });
    }
  }

  /** Leave mobile sheet mode when viewport widens */
  exitMobileMode() {
    if (!this._mobileMode) return;
    this._clearKeyboardDock();
    this._mobileMode = false;
    this._unbindMobileViewportWatch();
    this.frameEl.classList.remove("is-mobile-docked", "is-mobile-hint");
    const phase = document.body.dataset.phase || "open";
    if (phase === "open") {
      this.enterOpenLayout();
    } else {
      this.enterDockedHome({ animate: false });
    }
  }

  /** Initial open layout — frame at default vh; map band stays independent */
  enterOpenLayout() {
    if (this._mobileMode) {
      this._mobileMode = false;
      this._unbindMobileViewportWatch();
      this.frameEl.classList.remove("is-mobile-docked", "is-mobile-hint");
    }
    if (!this.mainEl) return;

    this._stopMotion();
    const openVh =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--whatimado-frame-top-default")
      ) || 42;

    this._docked = false;
    this.activeSnap = SNAP.HOME;
    this._anchors = null;
    this._defaultFrameHeight = null;

    document.documentElement.style.setProperty("--v2-kicker-reserve", KICKER_RESERVE_DEFAULT);
    document.documentElement.style.removeProperty("--v2-map-dim");
    document.documentElement.style.removeProperty("--v2-docked-frame-top");
    document.documentElement.style.setProperty("--whatimado-frame-top", `${openVh}vh`);

    this.frameEl.classList.remove("is-docked", "is-dragging", "is-animating", "is-gliding", "is-settling");
    this.frameEl.removeAttribute("data-snap");
    this.frameEl.style.removeProperty("top");
    document.body.classList.remove("is-hero-dismissing");

    this._topPx = (this.mainEl.clientHeight * openVh) / 100;
    this._setMapDim(0);
  }

  /** After hero dismiss — glide into Home Base */
  enterDockedHome({ animate = true } = {}) {
    if (!this.mainEl) return;

    this._stopMotion();
    this._docked = true;
    this._dockTransition = Boolean(animate && this._motionEnabled);
    this.activeSnap = SNAP.HOME;
    document.body.classList.add("is-hero-dismissing");
    this.frameEl.classList.add("is-docked");

    requestAnimationFrame(() => {
      this._captureDefaultMetrics();
      if (this.mainEl) {
        const mainRect = this.mainEl.getBoundingClientRect();
        const frameRect = this.frameEl.getBoundingClientRect();
        this._topPx = frameRect.top - mainRect.top;
      }
      this._syncMapBandLayout(this._topPx);
      const anchors = this._refreshAnchors();
      if (!anchors) return;

      if (animate && this._motionEnabled) {
        this._easeToAnchor(anchors.homeBase, SNAP.HOME, { finalizeDock: true });
      } else {
        document.documentElement.style.setProperty("--v2-kicker-reserve", "0px");
        this._applyTop(anchors.homeBase, { snap: SNAP.HOME });
        this.onDockProgress(anchors.homeBase);
        this._finishDockTransition();
      }
    });
  }

  /** @param {typeof SNAP[keyof typeof SNAP]} snapId */
  snapTo(snapId, { animate = true } = {}) {
    if (!this.mainEl) return;

    this._stopMotion();
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    const target = {
      [SNAP.TOP]: anchors.topLock,
      [SNAP.HOME]: anchors.homeBase,
      [SNAP.BOTTOM]: anchors.bottomCushion
    }[snapId];

    this.activeSnap = snapId;
    if (animate && this._motionEnabled) {
      this._easeToAnchor(target, snapId);
    } else {
      this._applyTop(target, { snap: snapId });
    }
  }

  remeasure() {
    if (
      !this._docked ||
      !this.mainEl ||
      this._dragging ||
      this._gliding ||
      this._settling ||
      this._dockTransition
    ) {
      return;
    }

    const anchors = this._refreshAnchors();
    if (!anchors) return;

    if (this._mobileMode) {
      if (this._keyboardDocked) {
        this.syncMobileKeyboard();
        return;
      }
      this.growForContent();
      this._applyTop(clampTop(this._topPx, anchors), { snap: this.activeSnap });
      return;
    }

    const target = {
      [SNAP.TOP]: anchors.topLock,
      [SNAP.HOME]: anchors.homeBase,
      [SNAP.BOTTOM]: anchors.bottomCushion
    }[this.activeSnap];

    this._applyTop(target, { snap: this.activeSnap });
  }

  /**
   * @param {PointerEvent} event
   */
  onDragStart(event) {
    if (!this._docked || !this.mainEl || event.button !== 0) return false;

    this._stopMotion();
    this._dragging = true;
    this._dragSamples = [{ y: event.clientY, t: performance.now() }];
    this._refreshAnchors();

    this._pointer = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: this._topPx
    };
    this._pendingClientY = event.clientY;

    this.frameEl.classList.add("is-dragging");
    this.frameEl.classList.remove("is-animating");
    return true;
  }

  /**
   * @param {PointerEvent} event
   */
  onDragMove(event) {
    if (!this._dragging || !this._pointer || event.pointerId !== this._pointer.pointerId || !this.mainEl) {
      return;
    }

    this._pendingClientY = event.clientY;
    this._dragSamples.push({ y: event.clientY, t: performance.now() });
    if (this._dragSamples.length > 8) this._dragSamples.shift();

    if (this._dragRaf !== null) return;

    this._dragRaf = requestAnimationFrame(() => {
      this._dragRaf = null;
      this._flushDragMove();
    });
  }

  /** Free drag — 1:1 with pointer, no anchor magnetism */
  _flushDragMove() {
    if (!this._dragging || !this._pointer || !this.mainEl || !this._anchors) return;

    const dy = this._pendingClientY - this._pointer.startY;
    const next = clampTop(this._pointer.startTop + dy, this._anchors);
    this._applyTop(next, { layout: false });
  }

  /**
   * @param {PointerEvent} event
   */
  onDragEnd(event) {
    if (!this._dragging || !this._pointer || event.pointerId !== this._pointer.pointerId || !this.mainEl) {
      return;
    }

    if (this._dragRaf !== null) {
      cancelAnimationFrame(this._dragRaf);
      this._dragRaf = null;
      this._flushDragMove();
    }

    this._dragging = false;
    this._pointer = null;
    this.frameEl.classList.remove("is-dragging");

    const releaseVelocity = this._motionEnabled ? computeReleaseVelocity(this._dragSamples) : 0;
    this._dragSamples = [];

    if (Math.abs(releaseVelocity) < GLIDE_MIN_SPEED || !this._motionEnabled) {
      this._finalizeSnap(releaseVelocity);
      return;
    }

    this._velocityY = releaseVelocity;
    this._startGlide();
  }

  /** Inertial glide — friction decay like map nodes, no anchor stickiness mid-glide */
  _startGlide() {
    this._gliding = true;
    this.frameEl.classList.add("is-gliding");

    const step = () => {
      if (!this._gliding || !this.mainEl) return;

      const anchors = this._anchors ?? this._refreshAnchors();
      if (!anchors) {
        this._stopMotion();
        return;
      }

      this._velocityY *= GLIDE_FRICTION;
      let next = this._topPx + this._velocityY;

      if (next <= anchors.topLock) {
        next = anchors.topLock;
        this._velocityY = 0;
      } else if (next >= anchors.bottomCushion) {
        next = anchors.bottomCushion;
        this._velocityY = 0;
      }

      this._applyTop(next, { layout: false });

      if (Math.abs(this._velocityY) < GLIDE_MIN_SPEED) {
        this._gliding = false;
        this.frameEl.classList.remove("is-gliding");
        this._finalizeSnap(this._velocityY);
        return;
      }

      this._glideRaf = requestAnimationFrame(step);
    };

    this._glideRaf = requestAnimationFrame(step);
  }

  /** Once glide slows, pick anchor via midway zones + velocity bias, then ease in */
  _finalizeSnap(velocityY) {
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    let snap;
    let target;

    if (this._mobileMode) {
      snap = resolveMobileSnap(this._topPx, velocityY, anchors);
      target = snap === SNAP.MOBILE_FOCUS ? anchors.typingTop : anchors.collapsedTop;
      this.frameEl.classList.toggle("is-mobile-typing", snap === SNAP.MOBILE_FOCUS);
      this.frameEl.classList.toggle("is-mobile-reading", snap === SNAP.MOBILE_COLLAPSED);
    } else {
      snap = resolveSnap(this._topPx, velocityY, anchors);
      target = {
        [SNAP.TOP]: anchors.topLock,
        [SNAP.HOME]: anchors.homeBase,
        [SNAP.BOTTOM]: anchors.bottomCushion
      }[snap];
    }

    this.activeSnap = snap;

    if (this._motionEnabled) {
      this._easeToAnchor(target, snap);
    } else {
      this._applyTop(target, { snap });
    }
  }

  /** Finalize hero dismiss — sync map band once, then map locks from frame. */
  _finishDockTransition() {
    this._dockTransition = false;
    document.body.classList.remove("is-hero-dismissing");
    document.documentElement.style.setProperty("--v2-kicker-reserve", "0px");
    this._syncMapBandLayout(this._topPx);
    this.onDockSettled();
  }

  /**
   * Smooth quintic ease into the chosen anchor — no oscillation.
   * @param {number} targetTop
   * @param {typeof SNAP[keyof typeof SNAP]} snapId
   * @param {{ finalizeDock?: boolean }} [options]
   */
  _easeToAnchor(targetTop, snapId, { finalizeDock = false, durationMs = SNAP_EASE_MS } = {}) {
    this._stopMotion();
    this._settling = true;
    this.frameEl.classList.add("is-settling");

    const startTop = this._topPx;
    const startTime = performance.now();
    const startKicker = finalizeDock ? measureCssVarLength("--v2-kicker-reserve") : 0;

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutQuint(t);
      const next = startTop + (targetTop - startTop) * eased;

      if (finalizeDock && startKicker > 0) {
        const kickerPx = startKicker * (1 - eased);
        document.documentElement.style.setProperty("--v2-kicker-reserve", `${kickerPx}px`);
      }

      if (finalizeDock) {
        this._syncMapBandLayout(next);
        this.onDockProgress(next);
      }

      this._applyTop(next, { layout: t >= 1, snap: t >= 1 ? snapId : null });

      if (t < 1) {
        this._settleRaf = requestAnimationFrame(tick);
        return;
      }

      this._settling = false;
      this.frameEl.classList.remove("is-settling");
      this.activeSnap = snapId;
      this.frameEl.dataset.snap = snapId;

      if (finalizeDock) {
        this._finishDockTransition();
      }
    };

    this._settleRaf = requestAnimationFrame(tick);
  }

  /**
   * @param {number} topPx
   * @param {{ snap?: typeof SNAP[keyof typeof SNAP]|null, layout?: boolean }} [options]
   */
  _applyTop(topPx, { snap = null, layout = true } = {}) {
    if (!this.mainEl) return;

    if (this._keyboardDocked) return;

    this._topPx = topPx;

    if (this._mobileMode) {
      const mainRect = this.mainEl.getBoundingClientRect();
      const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
      this.frameEl.style.top = `${topPx + mainRect.top + promptDrop}px`;
      this.frameEl.style.bottom = "auto";
    } else {
      this.frameEl.style.top = `${topPx}px`;
    }

    if (snap) {
      this.frameEl.dataset.snap = snap;
    }

    if (!this._mobileMode) {
      this._setMapDim(mapDimStrength(topPx, this.mainEl));
    }
    if (layout) {
      this.onLayout();
      if (this._mobileMode) this._syncMobileFocusLift();
    }
  }

  /** @param {number} strength 0–1 */
  _setMapDim(strength) {
    document.documentElement.style.setProperty("--v2-map-dim", String(Math.max(0, Math.min(1, strength))));
    this.frameEl.style.setProperty("--v2-frame-elevation", String(Math.max(0, Math.min(1, strength))));
  }
}

export const EASE_MS = SNAP_EASE_MS;
export const EASE_CURVE = "cubic-bezier(0.32, 0.94, 0.42, 1)";
