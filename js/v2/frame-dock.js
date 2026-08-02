/** Vertical frame dock — free drag, inertial glide, midway gravity snap */
export const SNAP = {
  TOP: "top",
  HOME: "home",
  BOTTOM: "bottom"
};

/** Glide tuning — aligned with map node release physics */
const GLIDE_VEL_SCALE = 0.52;
const GLIDE_FRICTION = 0.905;
const GLIDE_MIN_SPEED = 0.06;
const GLIDE_MAX_SPEED = 22;

/** U-node clearance below the 2/3 viewport home line */
const YOU_NODE_CLEARANCE = "clamp(0.75rem, 2vh, 1.25rem)";

/** Minimum panel height at Bottom Cushion — uses min height, not live offsetHeight */
const MIN_FRAME_HEIGHT = 260;
const BOTTOM_CONTENT_CUSHION = 36;

/** Minimum vertical band between Home Base and Bottom Cushion (fraction of main height) */
const HOME_BOTTOM_MIN_SEP = 0.2;

/** Final ease into anchor after glide settles */
const SNAP_EASE_MS = 680;

/** Flick bias shifts midway thresholds in the direction of travel (px equivalent) */
const FLICK_VEL_BIAS = 0.38;

const KICKER_RESERVE_DEFAULT = "clamp(4.5rem, 12vh, 6.25rem)";

/**
 * Viewport height — resolution-independent anchor basis.
 * @returns {number}
 */
function viewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

/**
 * Parse a CSS length (px, rem, vh, clamp) against a reference size.
 * @param {string} raw
 * @param {number} refPx
 */
function readCssLength(raw, refPx) {
  const value = String(raw || "").trim();
  if (!value) return 0;
  if (value.endsWith("px")) return Number.parseFloat(value) || 0;
  if (value.endsWith("vh")) return (refPx * (Number.parseFloat(value) || 0)) / 100;
  if (value.endsWith("rem")) {
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return (Number.parseFloat(value) || 0) * root;
  }
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
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
 * YOU-node floor in main coordinates — used to nudge Home Base slightly lower.
 * @param {HTMLElement} mainEl
 * @param {HTMLElement|null} mapEl
 * @returns {number|null}
 */
export function measureYouNodeFloor(mainEl, mapEl) {
  if (!mapEl) return null;

  const mainRect = mainEl.getBoundingClientRect();
  const anchorBody =
    mapEl.querySelector('[data-node-id="ghost-start"] .whatimado-map__node-body') ||
    mapEl.querySelector('[data-node-id="start"] .whatimado-map__node-body') ||
    mapEl.querySelector(".whatimado-map__node--live.is-start .whatimado-map__node-body") ||
    mapEl.querySelector(".whatimado-map__node--live.is-anchor .whatimado-map__node-body");

  if (!anchorBody) return null;

  const nodeRect = anchorBody.getBoundingClientRect();
  const clearance = readCssLength(YOU_NODE_CLEARANCE, viewportHeight());
  return nodeRect.bottom - mainRect.top + clearance;
}

/**
 * Home Base — 2/3 up from viewport bottom, shifted lower to clear the YOU node.
 * @param {HTMLElement} mainEl
 * @param {HTMLElement|null} mapEl
 */
export function measureHomeBase(mainEl, mapEl) {
  const mainRect = mainEl.getBoundingClientRect();
  const vh = viewportHeight();

  /** 2/3 from bottom ⇒ line sits at vh × ⅓ from the viewport top */
  const viewportHome = vh / 3;
  const railHome = viewportHome - mainRect.top;

  const youFloor = measureYouNodeFloor(mainEl, mapEl);
  return youFloor != null ? Math.max(railHome, youFloor) : railHome;
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
 * @param {HTMLElement|null} [mapEl]
 * @param {{ defaultFrameHeight?: number|null }} [cache]
 */
export function measureAnchors(mainEl, frameEl, mapEl = null, cache = {}) {
  const map = mapEl ?? document.getElementById("possibility-map");
  const mainH = mainEl.clientHeight;
  const topLock = measureTopLock(mainEl);
  const homeBase = measureHomeBase(mainEl, map);

  const composer = frameEl.querySelector(".whatimado-frame__composer");
  const composerH = composer?.offsetHeight ?? 72;
  const minDockedH = composerH + MIN_FRAME_HEIGHT * 0.45 + BOTTOM_CONTENT_CUSHION;

  /**
   * Bottom Cushion — restored distant anchor near the viewport bottom.
   * Never uses live offsetHeight (nearly full viewport when raised) so the
   * full Top → Home → Bottom travel range stays open.
   */
  const defaultFrameHeight = cache.defaultFrameHeight ?? frameEl.offsetHeight;
  let bottomCushion = Math.min(mainH - minDockedH, mainH - defaultFrameHeight);

  /** Enforce clear separation so Home and Bottom never cluster together */
  const minSep = mainH * HOME_BOTTOM_MIN_SEP;
  bottomCushion = Math.max(bottomCushion, homeBase + minSep);
  bottomCushion = Math.min(bottomCushion, mainH - minDockedH);

  return {
    topLock,
    homeBase,
    bottomCushion,
    mainH,
    defaultFrameHeight
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
  const mapBottom = mapEl
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
   * @param {{ onLayout?: () => void }} [options]
   */
  constructor(frameEl, options = {}) {
    this.frameEl = frameEl;
    this.onLayout = options.onLayout ?? (() => {});
    this.mainEl = /** @type {HTMLElement|null} */ (frameEl.closest(".v2-main"));
    this.mapEl = /** @type {HTMLElement|null} */ (document.getElementById("possibility-map"));
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
  }

  /** @returns {number} */
  get topPx() {
    return this._topPx;
  }

  _anchorCache() {
    return {
      defaultFrameHeight: this._defaultFrameHeight
    };
  }

  _refreshAnchors() {
    if (!this.mainEl) return null;
    this._anchors = measureAnchors(this.mainEl, this.frameEl, this.mapEl, this._anchorCache());
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
    this._velocityY = 0;
    this.frameEl.classList.remove("is-gliding", "is-settling");
  }

  /** Initial open layout — frame at default vh; map band stays independent */
  enterOpenLayout() {
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
    document.documentElement.style.setProperty("--whatimado-frame-top", `${openVh}vh`);

    this.frameEl.classList.remove("is-docked", "is-dragging", "is-animating", "is-gliding", "is-settling");
    this.frameEl.removeAttribute("data-snap");
    this.frameEl.style.removeProperty("top");

    this._topPx = (this.mainEl.clientHeight * openVh) / 100;
    this._setMapDim(0);
  }

  /** After hero dismiss — glide into Home Base */
  enterDockedHome({ animate = true } = {}) {
    if (!this.mainEl) return;

    this._stopMotion();
    this._docked = true;
    this.activeSnap = SNAP.HOME;
    document.documentElement.style.setProperty("--v2-kicker-reserve", "0px");
    this.frameEl.classList.add("is-docked");

    requestAnimationFrame(() => {
      this._captureDefaultMetrics();
      const anchors = this._refreshAnchors();
      if (!anchors) return;

      if (animate && this._motionEnabled) {
        this._easeToAnchor(anchors.homeBase, SNAP.HOME);
      } else {
        this._applyTop(anchors.homeBase, { snap: SNAP.HOME });
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
    if (!this._docked || !this.mainEl || this._dragging || this._gliding || this._settling) return;

    const anchors = this._refreshAnchors();
    if (!anchors) return;

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

    const snap = resolveSnap(this._topPx, velocityY, anchors);
    const target = {
      [SNAP.TOP]: anchors.topLock,
      [SNAP.HOME]: anchors.homeBase,
      [SNAP.BOTTOM]: anchors.bottomCushion
    }[snap];

    this.activeSnap = snap;

    if (this._motionEnabled) {
      this._easeToAnchor(target, snap);
    } else {
      this._applyTop(target, { snap });
    }
  }

  /**
   * Smooth quintic ease into the chosen anchor — no oscillation.
   * @param {number} targetTop
   * @param {typeof SNAP[keyof typeof SNAP]} snapId
   */
  _easeToAnchor(targetTop, snapId) {
    this._stopMotion();
    this._settling = true;
    this.frameEl.classList.add("is-settling");

    const startTop = this._topPx;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / SNAP_EASE_MS);
      const eased = easeOutQuint(t);
      const next = startTop + (targetTop - startTop) * eased;

      this._applyTop(next, { layout: t >= 1, snap: t >= 1 ? snapId : null });

      if (t < 1) {
        this._settleRaf = requestAnimationFrame(tick);
        return;
      }

      this._settling = false;
      this.frameEl.classList.remove("is-settling");
      this.activeSnap = snapId;
      this.frameEl.dataset.snap = snapId;
    };

    this._settleRaf = requestAnimationFrame(tick);
  }

  /**
   * @param {number} topPx
   * @param {{ snap?: typeof SNAP[keyof typeof SNAP]|null, layout?: boolean }} [options]
   */
  _applyTop(topPx, { snap = null, layout = true } = {}) {
    if (!this.mainEl) return;

    this._topPx = topPx;
    this.frameEl.style.top = `${topPx}px`;

    if (snap) {
      this.frameEl.dataset.snap = snap;
    }

    this._setMapDim(mapDimStrength(topPx, this.mainEl));
    if (layout) this.onLayout();
  }

  /** @param {number} strength 0–1 */
  _setMapDim(strength) {
    document.documentElement.style.setProperty("--v2-map-dim", String(Math.max(0, Math.min(1, strength))));
    this.frameEl.style.setProperty("--v2-frame-elevation", String(Math.max(0, Math.min(1, strength))));
  }
}

export const EASE_MS = SNAP_EASE_MS;
export const EASE_CURVE = "cubic-bezier(0.32, 0.94, 0.42, 1)";
