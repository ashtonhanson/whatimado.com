import {
  GLIDE_FRICTION,
  GLIDE_MIN_SPEED,
  KICKER_RESERVE_DEFAULT,
  MOBILE_GLIDE_EASE_MS,
  MOBILE_GROW_EASE_MS,
  MOBILE_MQ,
  SNAP,
  SNAP_EASE_MS
} from "./constants.js";
import {
  clampTop,
  mapDimStrength,
  measureAnchors,
  measureMobileAnchors,
  resolveMobileSnap,
  resolveSnap
} from "./anchors.js";
import { computeReleaseVelocity, easeOutQuint } from "./glide.js";
import {
  clearFocusOrientationTimers,
  cancelMobileComposerFocusRelease,
  releaseMobileComposerFocus,
  scheduleMobileComposerFocusResync,
  syncMobileFocusLift,
  syncMobileReadingMap,
  unpinMobileReadingMap
} from "./mobile-focus-lift.js";
import { clearKeyboardDock, syncMobileKeyboard } from "./mobile-keyboard.js";
import { measureCssVarLength } from "../layout/measure-css-var.js";

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
    /** @type {number|null} */
    this._dimMapBottom = null;
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
    /**
     * After first send — sheet is floor-pinned (composer at screen bottom)
     * through the three chat snaps. Landing stays a compact mid bar.
     * @type {boolean}
     */
    this._mobileChatSheet = false;
    /** @type {boolean} */
    this._keyboardDocked = false;
    /** Frozen frame top (px) while the keyboard is open on a chat sheet. */
    this._keyboardFrozenTop = null;
    /** @type {number|null} */
    this._keyboardCloseTimer = null;
    /** @type {boolean} */
    this._focusLiftResyncScheduled = false;
    /** @type {number|null} */
    this._focusOrientationTimer = null;
    /** @type {number|null} */
    this._focusOrientationTimer2 = null;
    /** @type {number|null} */
    this._focusReleaseTimer = null;
    /** @type {number|null} */
    this._focusReleaseRaf = null;
    /** @type {(() => void)|null} */
    this._mobileViewportHandler = null;
    /** @type {(() => void)|null} */
    this._mobileOrientationHandler = null;
  }

  /** @returns {boolean} */
  _isMobile() {
    return MOBILE_MQ.matches;
  }

  _bindMobileViewportWatch() {
    if (this._mobileViewportHandler || !window.visualViewport) return;

    this._mobileViewportHandler = () => {
      if (!this._mobileMode || !this.mainEl) return;
      if (document.body.classList.contains("is-mobile-composer-focus")) {
        window.scrollTo(0, 0);
        this.syncMobileKeyboard();
        return;
      }
      this.syncMobileKeyboard();
      if (this._keyboardDocked) return;
      this._anchors = null;
      if (this.activeSnap === SNAP.MOBILE_COLLAPSED) {
        this.growForContent();
      } else {
        this.remeasure();
      }
    };

    this._mobileOrientationHandler = () => {
      if (!this._mobileMode || !this.mainEl) return;
      this.syncMobileKeyboard();
      if (
        this._keyboardDocked ||
        document.body.classList.contains("is-mobile-composer-focus")
      ) {
        return;
      }
      this._anchors = null;
      this.remeasure();
    };

    window.visualViewport.addEventListener("resize", this._mobileViewportHandler);
    window.visualViewport.addEventListener("scroll", this._mobileViewportHandler);
    window.addEventListener("orientationchange", this._mobileOrientationHandler);
  }

  _unbindMobileViewportWatch() {
    if (!this._mobileViewportHandler || !window.visualViewport) return;
    window.visualViewport.removeEventListener("resize", this._mobileViewportHandler);
    window.visualViewport.removeEventListener("scroll", this._mobileViewportHandler);
    this._mobileViewportHandler = null;
    if (this._mobileOrientationHandler) {
      window.removeEventListener("orientationchange", this._mobileOrientationHandler);
      this._mobileOrientationHandler = null;
    }
    clearFocusOrientationTimers(this);
  }

  /** Re-pack map + hero after rotation while the composer stays focused. */
  scheduleMobileComposerFocusResync() {
    scheduleMobileComposerFocusResync(this);
  }

  cancelMobileComposerFocusRelease() {
    cancelMobileComposerFocusRelease(this);
  }

  releaseMobileComposerFocus(onComplete) {
    releaseMobileComposerFocus(this, { onComplete });
  }

  _syncMobileFocusLift(options) {
    syncMobileFocusLift(this, options);
  }

  /** Pin prompt above the software keyboard via Visual Viewport — no page scroll */
  syncMobileKeyboard() {
    syncMobileKeyboard(this);
  }

  _clearKeyboardDock() {
    clearKeyboardDock(this);
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

  /** @returns {boolean} */
  get keyboardDocked() {
    return this._keyboardDocked;
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
    this._mobileChatSheet = false;
    this._stopMotion();
    this._docked = true;
    this.activeSnap = SNAP.MOBILE_FOCUS;
    this._anchors = null;
    this._defaultFrameHeight = null;
    this._dockTransition = false;

    this._clearOpenHomeCompact();
    document.documentElement.style.removeProperty("--v2-docked-frame-top");
    document.documentElement.style.removeProperty("--whatimado-frame-top");
    this.frameEl.style.removeProperty("top");
    this.frameEl.classList.add("is-docked", "is-mobile-docked");
    this.frameEl.classList.remove("is-dragging", "is-animating", "is-gliding", "is-settling");
    document.body.classList.remove("is-frame-dragging");
    this.frameEl.dataset.snap = SNAP.MOBILE_FOCUS;
    document.body.classList.remove("is-hero-dismissing");

    requestAnimationFrame(() => {
      const anchors = this._refreshAnchors();
      if (!anchors) {
        document.body.classList.add("is-mobile-shell-ready");
        return;
      }
      /* A restored chat enters the sheet in the same frame; landing layout must not undo it. */
      if (!this._mobileChatSheet) {
        /* Park the homepage prompt as a floored bottom strip so overflow:hidden cannot clip it. */
        this.frameEl.classList.add("is-mobile-typing");
        this.frameEl.classList.remove("is-mobile-reading", "is-mobile-expanded");
        document.body.classList.remove("is-mobile-reading", "is-mobile-expanded");
        const openPromptTop = anchors.mapFocusTop ?? anchors.typingTop ?? anchors.homePromptTop;
        this._applyTop(openPromptTop, { snap: SNAP.MOBILE_FOCUS });
        unpinMobileReadingMap();
      }
      this._bindMobileViewportWatch();
      requestAnimationFrame(() => {
        document.body.classList.add("is-mobile-shell-ready");
        window.dispatchEvent(new Event("resize"));
      });
    });
  }

  /** After send — floor the composer, park at mid reading (sheet covers lower ¾) */
  mobileGlideToBottom() {
    if (!this._mobileMode || !this.mainEl) return;

    this._mobileChatSheet = true;
    // Drop keyboard pin + focus packing so the sheet can settle to the floor.
    if (this._keyboardDocked || this.frameEl.classList.contains("is-mobile-keyboard")) {
      this._keyboardDocked = false;
      this._keyboardFrozenTop = null;
      if (this._keyboardCloseTimer != null) {
        window.clearTimeout(this._keyboardCloseTimer);
        this._keyboardCloseTimer = null;
      }
      this.frameEl.classList.remove("is-mobile-keyboard");
      document.body.classList.remove("is-mobile-keyboard-open");
      this.frameEl.style.removeProperty("transform");
    }
    releaseMobileComposerFocus(this);

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    this.activeSnap = SNAP.MOBILE_COLLAPSED;
    this._applyMobileSnapClasses(SNAP.MOBILE_COLLAPSED);

    const target = anchors.readingTop ?? anchors.collapsedTop;
    const syncMap = () => this._syncMobileSheetMap();

    if (this._motionEnabled) {
      this._easeToAnchor(target, SNAP.MOBILE_COLLAPSED, {
        durationMs: MOBILE_GLIDE_EASE_MS,
        onTick: syncMap,
        onComplete: syncMap
      });
    } else {
      this._applyTop(target, { snap: SNAP.MOBILE_COLLAPSED });
      syncMap();
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

  /** Glide to typing / map-focus strip (landing mid-bar, or floor strip after chat) */
  mobileGlideToTyping() {
    if (!this._mobileMode || !this.mainEl) return;

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    this.activeSnap = SNAP.MOBILE_FOCUS;
    this._applyMobileSnapClasses(SNAP.MOBILE_FOCUS);

    const target = this._mobileChatSheet
      ? anchors.mapFocusTop ?? anchors.typingTop
      : anchors.homePromptTop;
    const syncMap = () => this._syncMobileSheetMap();

    if (this._motionEnabled) {
      this._easeToAnchor(target, SNAP.MOBILE_FOCUS, {
        durationMs: MOBILE_GLIDE_EASE_MS,
        onTick: syncMap,
        onComplete: syncMap
      });
    } else {
      this._applyTop(target, { snap: SNAP.MOBILE_FOCUS });
      syncMap();
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
    const syncMap = () => this._syncMobileSheetMap();
    if (Math.abs(targetTop - this._topPx) < 0.75) {
      syncMap();
      return;
    }

    if (this._motionEnabled) {
      this._easeToAnchor(targetTop, SNAP.MOBILE_COLLAPSED, {
        durationMs: MOBILE_GROW_EASE_MS,
        onTick: syncMap,
        onComplete: syncMap
      });
    } else {
      this._applyTop(targetTop, { snap: SNAP.MOBILE_COLLAPSED });
      syncMap();
    }
  }

  /** Leave mobile sheet mode when viewport widens */
  exitMobileMode() {
    if (!this._mobileMode) return;
    this._clearKeyboardDock();
    this._mobileMode = false;
    this._unbindMobileViewportWatch();
    this._mobileChatSheet = false;
    this.frameEl.classList.remove(
      "is-mobile-docked",
      "is-mobile-hint",
      "is-mobile-reading",
      "is-mobile-expanded",
      "is-mobile-sheet-floored"
    );
    document.body.classList.remove("is-mobile-reading", "is-mobile-expanded");
    unpinMobileReadingMap();
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
    /* Body carries the open-home band; :root stays on the chat snap (25vh). */
    const openVh =
      Number.parseFloat(
        getComputedStyle(document.body).getPropertyValue("--whatimado-frame-top-default")
      ) ||
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--whatimado-frame-top-default")
      ) ||
      48;

    /** Landing snap is BOTTOM; HOME is the 3/4 sheet (frame top at 25vh). */
    this._docked = true;
    this.activeSnap = SNAP.BOTTOM;
    this._anchors = null;
    this._defaultFrameHeight = null;

    this._clearOpenHomeCompact();
    if (MOBILE_MQ.matches) {
      document.documentElement.style.removeProperty("--v2-kicker-reserve");
      document.documentElement.style.removeProperty("--whatimado-frame-top-default");
    } else {
      document.documentElement.style.setProperty("--v2-kicker-reserve", KICKER_RESERVE_DEFAULT);
    }
    document.documentElement.style.removeProperty("--v2-map-dim");
    document.documentElement.style.removeProperty("--v2-docked-frame-top");
    /* +15px grows the map band; section gap matches map → demo → Path Finder → prompt. */
    document.documentElement.style.setProperty(
      "--whatimado-frame-top",
      `calc(${openVh}vh + 15px + var(--v2-home-section-gap, 1.25rem))`
    );

    this.frameEl.classList.add("is-docked");
    this.frameEl.classList.remove("is-dragging", "is-animating", "is-gliding", "is-settling");
    document.body.classList.remove("is-frame-dragging");
    this.frameEl.dataset.snap = SNAP.BOTTOM;
    this.frameEl.style.removeProperty("top");
    document.body.classList.remove("is-hero-dismissing");

    /* Desktop landing may sit below openVh (frame.css keeps room for the map), so read where it rendered. */
    const measuredTop = this.frameEl.getBoundingClientRect().top - this.mainEl.getBoundingClientRect().top;
    this._topPx = Number.isFinite(measuredTop) && measuredTop > 0 ? measuredTop : (this.mainEl.clientHeight * openVh) / 100;
    this.frameEl.dataset.openLandingTop = String(Math.round(this._topPx));
    this._setMapDim(0);
  }

  /** Drop three-quarter compact vars so the default landing CSS can take over. */
  _clearOpenHomeCompact() {
    document.body.removeAttribute("data-home-snap");
    document.documentElement.style.removeProperty("--v2-home-compact-scale");
    document.documentElement.style.removeProperty("--v2-home-compact-gap");
    document.documentElement.style.removeProperty("--v2-open-compact-kicker-top");
    document.documentElement.style.removeProperty("--v2-open-compact-kicker-h");
    document.documentElement.style.removeProperty("--v2-open-compact-map-h");
    document.documentElement.style.removeProperty("--v2-kicker-top");
    document.documentElement.style.removeProperty("--v2-map-svg-h");
  }

  /**
   * Pack map + demo + Path Finder into the band above a raised prompt (3/4 snap).
   * @param {number} frameTopPx Dock top in main coords (mobile may paint slightly lower)
   */
  _applyOpenHomeCompact(frameTopPx) {
    if (!this.mainEl) return;
    const sectionGap = measureCssVarLength("--v2-home-section-gap") || 20;
    const mainTop = this.mainEl.getBoundingClientRect().top;
    /* Prefer the painted frame edge so padding matches what the user sees. */
    const paintedTop = this.frameEl.getBoundingClientRect().top - mainTop;
    const frameEdge = Number.isFinite(paintedTop) && paintedTop > 0 ? paintedTop : frameTopPx;
    const mapEl = document.querySelector("whatimado-map");
    const svg = mapEl?.querySelector(".whatimado-map__svg");
    const svgTop = (svg?.getBoundingClientRect().top ?? mapEl?.getBoundingClientRect().top ?? 0) - mainTop;
    const bandTop = Math.max(0, Number.isFinite(svgTop) ? svgTop : 0);
    const total = Math.max(96, frameEdge - bandTop);
    const scale = Math.max(0.52, Math.min(1, total / 260));
    const gap = Math.max(10, Math.min(sectionGap, Math.round(sectionGap * Math.max(0.7, scale))));
    const inner = Math.max(80, total - gap * 2);

    document.body.dataset.homeSnap = "three-quarter";
    document.documentElement.style.setProperty("--v2-home-compact-scale", String(scale));
    document.documentElement.style.setProperty("--v2-home-compact-gap", `${gap}px`);

    /* Measure kicker content at this scale, then give leftover height to the map. */
    const kicker = document.getElementById("frame-kicker");
    document.documentElement.style.setProperty("--v2-kicker-top", `${frameEdge - gap - 140}px`);
    document.documentElement.style.setProperty("--v2-kicker-reserve", "140px");
    document.documentElement.style.setProperty("--v2-open-compact-kicker-h", "140px");
    void kicker?.offsetHeight;
    let measuredKicker = kicker?.scrollHeight || 0;
    if (kicker) {
      const demo = kicker.querySelector(".v2-kicker-demo");
      const sub = kicker.querySelector(".v2-kicker-sub");
      if (demo && sub) {
        measuredKicker = Math.max(
          measuredKicker,
          Math.ceil(sub.getBoundingClientRect().bottom - demo.getBoundingClientRect().top)
        );
      }
    }
    const kickerH = Math.min(Math.max(measuredKicker + 6, 72), Math.round(inner * 0.48));
    const mapH = Math.max(64, inner - kickerH);

    document.documentElement.style.setProperty("--v2-open-compact-map-h", `${mapH}px`);
    document.documentElement.style.setProperty("--v2-open-compact-kicker-h", `${kickerH}px`);
    document.documentElement.style.setProperty("--v2-map-svg-h", `${mapH}px`);
    document.documentElement.style.setProperty("--v2-kicker-reserve", `${kickerH}px`);

    void mapEl?.offsetHeight;
    const liveSvgBottom =
      (svg?.getBoundingClientRect().bottom ?? bandTop + mapH + mainTop) - mainTop;
    const kickerTop = Math.max(bandTop + mapH + gap, liveSvgBottom + gap);
    const maxKickerTop = Math.max(bandTop, frameEdge - gap - kickerH);
    const pinnedTop = Math.min(kickerTop, maxKickerTop);

    document.documentElement.style.setProperty("--v2-open-compact-kicker-top", `${pinnedTop}px`);
    document.documentElement.style.setProperty("--v2-kicker-top", `${pinnedTop}px`);
    this.onLayout();
    requestAnimationFrame(() => {
      document.querySelector("whatimado-map")?.unlockFrameCoupling?.();
    });
  }

  /** After first prompt — fade home copy; stay at landing so the map stays fully visible */
  enterDockedHome({ animate = true } = {}) {
    if (!this.mainEl) return;

    this._stopMotion();
    this._docked = true;
    this.frameEl.classList.add("is-docked");

    const mainRect = this.mainEl.getBoundingClientRect();
    const frameRect = this.frameEl.getBoundingClientRect();
    this._topPx = frameRect.top - mainRect.top;
    this._syncMapBandLayout(this._topPx);

    this._dockTransition = Boolean(animate && this._motionEnabled);
    this.activeSnap = SNAP.HOME;
    document.body.classList.add("is-hero-dismissing");

    requestAnimationFrame(() => {
      this._captureDefaultMetrics();
      const anchors = this._refreshAnchors();
      if (!anchors) return;

      const alreadyHome = Math.abs(this._topPx - anchors.homeBase) < 8;

      if (animate && this._motionEnabled && !alreadyHome) {
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
      [SNAP.BOTTOM]: anchors.bottomCushion,
      [SNAP.MOBILE_EXPANDED]: anchors.expandedTop ?? anchors.topLock,
      [SNAP.MOBILE_COLLAPSED]: anchors.readingTop ?? anchors.collapsedTop,
      [SNAP.MOBILE_FOCUS]: anchors.mapFocusTop ?? anchors.typingTop
    }[snapId];
    if (!Number.isFinite(target)) return;

    this.activeSnap = snapId;
    if (this._mobileMode) this._applyMobileSnapClasses(snapId);
    if (animate && this._motionEnabled) {
      this._easeToAnchor(target, snapId, {
        onTick: this._mobileMode ? () => this._syncMobileSheetMap() : undefined,
        onComplete: () => {
          if (this._mobileMode) this._syncMobileSheetMap({ fit: true });
          this.frameEl.dispatchEvent(new CustomEvent("dock-settled", { bubbles: true }));
        }
      });
    } else {
      this._applyTop(target, { snap: snapId });
      if (this._mobileMode) this._syncMobileSheetMap({ fit: true });
      this.frameEl.dispatchEvent(new CustomEvent("dock-settled", { bubbles: true }));
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
      if (this._keyboardDocked || document.body.classList.contains("is-mobile-composer-focus")) {
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

    /** Bake CSS vh top into main-relative px so the first move is 1:1 */
    const mainRect = this.mainEl.getBoundingClientRect();
    const frameRect = this.frameEl.getBoundingClientRect();
    this._topPx = frameRect.top - mainRect.top - this._timelineInsetPx();

    const mapEl = document.getElementById("possibility-map");
    const mapStage = mapEl?.querySelector(".whatimado-map__stage");
    this._dimMapBottom = mapStage
      ? mapStage.getBoundingClientRect().bottom - mainRect.top
      : this.mainEl.clientHeight * 0.42;

    this._pointer = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: this._topPx
    };
    this._pendingClientY = event.clientY;

    this.frameEl.classList.add("is-dragging");
    this.frameEl.classList.remove("is-animating");
    document.body.classList.add("is-frame-dragging");
    this.frameEl.dispatchEvent(new CustomEvent("frame-drag-start", { bubbles: true }));
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
    if (this._mobileMode && this._mobileChatSheet) {
      const anchors = this._anchors;
      const readingTop = anchors.readingTop ?? anchors.collapsedTop;
      const expandedTop = anchors.expandedTop ?? anchors.topLock;
      const mapFocusTop = anchors.mapFocusTop ?? anchors.typingTop;
      const midExpandRead = (expandedTop + readingTop) / 2;
      const midReadMap = (readingTop + mapFocusTop) / 2;
      if (next <= midExpandRead) {
        this._applyMobileSnapClasses(SNAP.MOBILE_EXPANDED);
      } else if (next <= midReadMap) {
        this._applyMobileSnapClasses(SNAP.MOBILE_COLLAPSED);
      } else {
        this._applyMobileSnapClasses(SNAP.MOBILE_FOCUS);
      }
      this._syncMobileSheetMap();
    }
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
    const startTop = this._pointer.startTop;
    this._pointer = null;
    this.frameEl.classList.remove("is-dragging");
    document.body.classList.remove("is-frame-dragging");
    this.frameEl.dispatchEvent(new CustomEvent("frame-drag-end", { bubbles: true }));
    this._dimMapBottom = null;

    const releaseVelocity = this._motionEnabled ? computeReleaseVelocity(this._dragSamples) : 0;
    this._dragSamples = [];

    /** Clicking the rail without a real pull must not snap away from the landing spot */
    if (Math.abs(this._topPx - startTop) < 6 && Math.abs(releaseVelocity) < GLIDE_MIN_SPEED) {
      return;
    }

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
      if (this._mobileMode) this._syncMobileSheetMap();

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

    const openHome =
      document.body.dataset.phase === "open" && !document.body.classList.contains("is-hero-dismissing");

    let snap;
    let target;

    if (this._mobileMode && !this._mobileChatSheet) {
      /* Open home: focus = landing under kicker, collapsed = 3/4 (25vh), expanded = under menu. */
      const openAnchors = {
        ...anchors,
        typingTop: anchors.homePromptTop,
        mapFocusTop: anchors.homePromptTop
      };
      snap = resolveMobileSnap(this._topPx, velocityY, openAnchors);
      target = {
        [SNAP.MOBILE_EXPANDED]: anchors.expandedTop ?? anchors.topLock,
        [SNAP.MOBILE_COLLAPSED]: anchors.readingTop ?? anchors.collapsedTop,
        [SNAP.MOBILE_FOCUS]: anchors.homePromptTop ?? anchors.mapFocusTop
      }[snap];
      this._applyMobileSnapClasses(snap);
    } else if (this._mobileMode) {
      snap = resolveMobileSnap(this._topPx, velocityY, anchors);
      target = {
        [SNAP.MOBILE_EXPANDED]: anchors.expandedTop ?? anchors.topLock,
        [SNAP.MOBILE_COLLAPSED]: anchors.readingTop ?? anchors.collapsedTop,
        [SNAP.MOBILE_FOCUS]: anchors.mapFocusTop ?? anchors.typingTop
      }[snap];
      this._applyMobileSnapClasses(snap);
    } else {
      snap = resolveSnap(this._topPx, velocityY, anchors);
      /* Open home BOTTOM = default landing; HOME = 3/4 sheet at 25vh. */
      if (openHome && snap === SNAP.BOTTOM) {
        this.enterOpenLayout();
        this.frameEl.dispatchEvent(new CustomEvent("dock-settled", { bubbles: true }));
        return;
      }
      target = {
        [SNAP.TOP]: anchors.topLock,
        [SNAP.HOME]: anchors.homeBase,
        [SNAP.BOTTOM]: anchors.bottomCushion
      }[snap];
    }

    this.activeSnap = snap;

    /* Only the 3/4 sheet packs the home stack; top/expanded covers the map. */
    const compactSnaps = snap === SNAP.HOME || snap === SNAP.MOBILE_COLLAPSED;
    const landingSnaps = snap === SNAP.MOBILE_FOCUS || snap === SNAP.BOTTOM;

    const afterSettle = () => {
      if (openHome && compactSnaps) {
        this._applyOpenHomeCompact(this._topPx);
      } else if (openHome && landingSnaps) {
        this._clearOpenHomeCompact();
        if (this._mobileMode && !this._mobileChatSheet) {
          /* Restore landing kicker/map CSS band without restarting the whole open shell. */
          document.documentElement.style.removeProperty("--v2-kicker-reserve");
          document.documentElement.style.removeProperty("--whatimado-frame-top-default");
        }
      }
      if (this._mobileMode) this._syncMobileSheetMap({ fit: true });
      this.frameEl.dispatchEvent(new CustomEvent("dock-settled", { bubbles: true }));
    };

    if (this._motionEnabled) {
      this._easeToAnchor(target, snap, {
        durationMs: this._mobileMode ? MOBILE_GLIDE_EASE_MS : SNAP_EASE_MS,
        onTick: this._mobileMode
          ? () => {
              this._syncMobileSheetMap();
              if (openHome && compactSnaps) this._applyOpenHomeCompact(this._topPx);
            }
          : openHome && compactSnaps
            ? () => this._applyOpenHomeCompact(this._topPx)
            : undefined,
        onComplete: afterSettle
      });
    } else {
      this._applyTop(target, { snap });
      afterSettle();
    }
  }

  /** @param {typeof SNAP[keyof typeof SNAP]} snap */
  _applyMobileSnapClasses(snap) {
    const expanded = snap === SNAP.MOBILE_EXPANDED;
    const reading = snap === SNAP.MOBILE_COLLAPSED || expanded;
    const mapFocus = snap === SNAP.MOBILE_FOCUS;
    const floored = this._mobileChatSheet && (expanded || snap === SNAP.MOBILE_COLLAPSED);
    this.frameEl.classList.toggle("is-mobile-typing", mapFocus);
    this.frameEl.classList.toggle("is-mobile-reading", reading);
    this.frameEl.classList.toggle("is-mobile-expanded", expanded);
    this.frameEl.classList.toggle("is-mobile-sheet-floored", floored);
    document.body.classList.toggle("is-mobile-reading", reading);
    document.body.classList.toggle("is-mobile-expanded", expanded);
  }

  /**
   * Mid snap: fit map in menu→frame gap.
   * Bottom snap: fill the screen above the composer strip.
   * Top snap: leave map frozen (no resize).
   */
  _syncMobileSheetMap({ fit = false } = {}) {
    if (!this._mobileMode) return;
    this._fitSheetMap = fit;
    syncMobileReadingMap(this);
    this._fitSheetMap = false;
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
  _easeToAnchor(targetTop, snapId, { finalizeDock = false, durationMs = SNAP_EASE_MS, onTick, onComplete } = {}) {
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
      onTick?.(next, t);

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

      onComplete?.();
    };

    this._settleRaf = requestAnimationFrame(tick);
  }

  /** Height of the mission summary. Added to the painted frame top, not the drag position. */
  _timelineInsetPx() {
    if (!document.body.classList.contains("has-map-timeline")) return 0;
    return measureCssVarLength("--v2-timeline-h") || 0;
  }

  /**
   * Where the phone frame paints for a dock top.
   * @param {number} topPx
   */
  _mobileFrameScreenTop(topPx) {
    const mainTop = this.mainEl?.getBoundingClientRect().top ?? 0;
    const promptDrop = measureCssVarLength("--v2-mobile-prompt-drop") || 8;
    return topPx + mainTop + promptDrop + this._timelineInsetPx();
  }

  /** Re-apply the current dock top after the timeline shows or hides. */
  refreshTimelineInset() {
    if (!Number.isFinite(this._topPx) || !this._docked) return;
    this._applyTop(this._topPx, { snap: this.activeSnap, layout: false });
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
      const bottomInset = measureCssVarLength("--v2-mobile-bottom-inset") || 0;
      /* Open-home typing strip must floor so the absolute composer is not clipped by a 15px inner. */
      const openHome =
        document.body.dataset.phase === "open" && !this._mobileChatSheet;
      const openHomePrompt =
        openHome && this.frameEl.classList.contains("is-mobile-typing");
      /* Open-home 3/4 + expanded are full sheets covering down to the safe-area floor. */
      const openHomeSheet =
        openHome &&
        (this.frameEl.classList.contains("is-mobile-reading") ||
          this.frameEl.classList.contains("is-mobile-expanded"));
      const floored =
        openHomePrompt ||
        openHomeSheet ||
        (this._mobileChatSheet &&
          (this.frameEl.classList.contains("is-mobile-sheet-floored") ||
            this.frameEl.classList.contains("is-mobile-reading") ||
            this.frameEl.classList.contains("is-mobile-expanded")));
      this.frameEl.style.top = `${this._mobileFrameScreenTop(topPx)}px`;
      if (floored) {
        this.frameEl.classList.add("is-mobile-sheet-floored");
        this.frameEl.style.bottom = `${bottomInset}px`;
      } else {
        this.frameEl.classList.remove("is-mobile-sheet-floored");
        this.frameEl.style.bottom = "auto";
      }
    } else {
      this.frameEl.style.top = `${topPx + this._timelineInsetPx()}px`;
    }

    if (snap) {
      this.frameEl.dataset.snap = snap;
    }

    if (!this._mobileMode) {
      this._setMapDim(
        mapDimStrength(topPx, this.mainEl, this._dragging ? this._dimMapBottom ?? undefined : undefined)
      );
      if (this._docked && !this._dockTransition) this.onDockProgress(topPx);
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
