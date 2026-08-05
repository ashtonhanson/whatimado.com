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
      if (!anchors) {
        document.body.classList.add("is-mobile-shell-ready");
        return;
      }
      this._mobileChatSheet = false;
      this._applyTop(anchors.homePromptTop, { snap: SNAP.MOBILE_FOCUS });
      this.frameEl.classList.add("is-mobile-typing");
      this.frameEl.classList.remove("is-mobile-reading", "is-mobile-sheet-floored");
      document.body.classList.remove("is-mobile-reading", "is-mobile-expanded");
      this.frameEl.classList.remove("is-mobile-expanded");
      unpinMobileReadingMap();
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
    if (this._keyboardDocked) {
      this._keyboardDocked = false;
      this.frameEl.classList.remove("is-mobile-keyboard");
      document.body.classList.remove("is-mobile-keyboard-open");
    }
    unpinMobileReadingMap();
    releaseMobileComposerFocus(this);

    this._anchors = null;
    const anchors = this._refreshAnchors();
    if (!anchors) return;

    this.activeSnap = SNAP.MOBILE_COLLAPSED;
    this._applyMobileSnapClasses(SNAP.MOBILE_COLLAPSED);

    const target = anchors.readingTop ?? anchors.collapsedTop;

    if (this._motionEnabled) {
      this._easeToAnchor(target, SNAP.MOBILE_COLLAPSED, {
        durationMs: MOBILE_GLIDE_EASE_MS
      });
    } else {
      this._applyTop(target, { snap: SNAP.MOBILE_COLLAPSED });
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
    unpinMobileReadingMap();

    const target = this._mobileChatSheet
      ? anchors.mapFocusTop ?? anchors.typingTop
      : anchors.homePromptTop;

    if (this._motionEnabled) {
      this._easeToAnchor(target, SNAP.MOBILE_FOCUS, {
        durationMs: MOBILE_GLIDE_EASE_MS
      });
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
      this._easeToAnchor(targetTop, SNAP.MOBILE_COLLAPSED, {
        durationMs: MOBILE_GROW_EASE_MS
      });
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
    if (this._mobileMode && this._mobileChatSheet) {
      // Preview chat chrome while dragging — map stays put.
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

    if (this._mobileMode && !this._mobileChatSheet) {
      // Pre-chat landing — stay under the kicker as a compact bar.
      snap = SNAP.MOBILE_FOCUS;
      target = anchors.homePromptTop;
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
      target = {
        [SNAP.TOP]: anchors.topLock,
        [SNAP.HOME]: anchors.homeBase,
        [SNAP.BOTTOM]: anchors.bottomCushion
      }[snap];
    }

    this.activeSnap = snap;

    if (this._motionEnabled) {
      this._easeToAnchor(target, snap, {
        durationMs: this._mobileMode ? MOBILE_GLIDE_EASE_MS : SNAP_EASE_MS
      });
    } else {
      this._applyTop(target, { snap });
    }
  }

  /** @param {typeof SNAP[keyof typeof SNAP]} snap */
  _applyMobileSnapClasses(snap) {
    const expanded = snap === SNAP.MOBILE_EXPANDED;
    const reading = snap === SNAP.MOBILE_COLLAPSED || expanded;
    const mapFocus = snap === SNAP.MOBILE_FOCUS;
    const floored =
      this._mobileChatSheet &&
      (expanded || snap === SNAP.MOBILE_COLLAPSED || mapFocus);
    this.frameEl.classList.toggle("is-mobile-typing", mapFocus);
    this.frameEl.classList.toggle("is-mobile-reading", reading);
    this.frameEl.classList.toggle("is-mobile-expanded", expanded);
    this.frameEl.classList.toggle("is-mobile-sheet-floored", floored);
    document.body.classList.toggle("is-mobile-reading", reading);
    document.body.classList.toggle("is-mobile-expanded", expanded);
    // Map stays independent of sheet position.
    unpinMobileReadingMap();
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
      const bottomInset = measureCssVarLength("--v2-mobile-bottom-inset") || 0;
      const floored =
        this._mobileChatSheet &&
        (this.frameEl.classList.contains("is-mobile-sheet-floored") ||
          this.frameEl.classList.contains("is-mobile-reading") ||
          this.frameEl.classList.contains("is-mobile-expanded") ||
          this.activeSnap === SNAP.MOBILE_FOCUS);
      this.frameEl.style.top = `${topPx + mainRect.top + promptDrop}px`;
      if (floored) {
        this.frameEl.classList.add("is-mobile-sheet-floored");
        this.frameEl.style.bottom = `${bottomInset}px`;
      } else {
        this.frameEl.classList.remove("is-mobile-sheet-floored");
        this.frameEl.style.bottom = "auto";
      }
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
