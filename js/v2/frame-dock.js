/** Magnetic snap anchors for the prompt frame vertical dock */
export const SNAP = {
  TOP: "top",
  HOME: "home",
  BOTTOM: "bottom"
};

const HOME_RAIL_FRACTION = 1 / 3; /* 2/3 up from bottom of sidebar span */
const MIN_FRAME_HEIGHT = 260;
const BOTTOM_CONTENT_CUSHION = 36;
const EASE_MS = 620;
const EASE_CURVE = "cubic-bezier(0.32, 0.94, 0.42, 1)";
const KICKER_RESERVE_DEFAULT = "clamp(4.5rem, 12vh, 6.25rem)";

/**
 * Sidebar column span in main coordinates — top lock + home base derive from rails.
 * @param {HTMLElement} mainEl
 * @returns {{ topLock: number, railSpan: number, mainH: number }}
 */
export function measureRailSpan(mainEl) {
  const mainRect = mainEl.getBoundingClientRect();
  const mainH = mainRect.height;
  const rail =
    document.querySelector(".v2-rail--left") || document.querySelector(".v2-rail--right");

  if (!rail) {
    return { topLock: 0, railSpan: mainH, mainH };
  }

  const railRect = rail.getBoundingClientRect();
  const topLock = Math.max(0, railRect.top - mainRect.top);
  const railSpan = railRect.height;

  return { topLock, railSpan, mainH };
}

/**
 * @param {HTMLElement} mainEl
 * @param {HTMLElement} frameEl
 */
export function measureAnchors(mainEl, frameEl) {
  const { topLock, railSpan, mainH } = measureRailSpan(mainEl);

  /** Home Base: 2/3 of sidebar height measured up from the bottom edge */
  const homeBase = topLock + railSpan * HOME_RAIL_FRACTION;

  const frameH = Math.max(frameEl.offsetHeight, MIN_FRAME_HEIGHT);
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  const composerH = composer?.offsetHeight ?? 72;
  const minDockedH = composerH + MIN_FRAME_HEIGHT * 0.45 + BOTTOM_CONTENT_CUSHION;
  const bottomCushion = Math.max(topLock + 48, topLock + railSpan - Math.max(frameH, minDockedH));

  return { topLock, homeBase, bottomCushion, mainH, railSpan };
}

/**
 * @param {number} topPx
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 */
export function clampTop(topPx, anchors) {
  return Math.max(anchors.topLock, Math.min(topPx, anchors.bottomCushion));
}

/**
 * Always resolve to the nearest anchor — no in-between resting states.
 * @param {number} topPx
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 * @returns {typeof SNAP[keyof typeof SNAP]}
 */
export function resolveSnap(topPx, anchors) {
  /** @type {[typeof SNAP[keyof typeof SNAP], number][]} */
  const points = [
    [SNAP.TOP, anchors.topLock],
    [SNAP.HOME, anchors.homeBase],
    [SNAP.BOTTOM, anchors.bottomCushion]
  ];

  let best = SNAP.HOME;
  let bestDist = Infinity;

  for (const [id, y] of points) {
    const dist = Math.abs(topPx - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }

  return best;
}

/**
 * @param {number} frameTop
 * @param {HTMLElement} mainEl
 */
export function mapDimStrength(frameTop, mainEl) {
  const mainH = mainEl.clientHeight;
  if (frameTop >= mainH) return 0;
  const overlap = mainH - frameTop;
  return Math.min(1, overlap / Math.max(mainH * 0.72, 140));
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
    /** @type {typeof SNAP[keyof typeof SNAP]} */
    this.activeSnap = SNAP.HOME;
    /** @type {number} */
    this._topPx = 0;
    /** @type {boolean} */
    this._docked = false;
    /** @type {boolean} */
    this._dragging = false;
    /** @type {{ pointerId: number, startY: number, startTop: number }|null} */
    this._pointer = null;
    /** @type {ReturnType<typeof measureAnchors>|null} */
    this._anchors = null;
    /** @type {number|null} */
    this._dragRaf = null;
    /** @type {number} */
    this._pendingClientY = 0;
    /** @type {boolean} */
    this._motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** @returns {number} */
  get topPx() {
    return this._topPx;
  }

  _refreshAnchors() {
    if (!this.mainEl) return null;
    this._anchors = measureAnchors(this.mainEl, this.frameEl);
    return this._anchors;
  }

  /** Initial open layout — frame sits at default vh anchor; map stays full height */
  enterOpenLayout() {
    if (!this.mainEl) return;
    const openVh =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--whatimado-frame-top-default")
      ) || 42;
    this._docked = false;
    this.activeSnap = SNAP.HOME;
    this._anchors = null;
    document.documentElement.style.setProperty("--v2-kicker-reserve", KICKER_RESERVE_DEFAULT);
    document.documentElement.style.removeProperty("--v2-map-dim");
    document.documentElement.style.setProperty("--whatimado-frame-top", `${openVh}vh`);
    this.frameEl.classList.remove("is-docked", "is-dragging", "is-animating");
    this.frameEl.removeAttribute("data-snap");
    this.frameEl.style.removeProperty("top");
    this._topPx = (this.mainEl.clientHeight * openVh) / 100;
    this._setMapDim(0);
  }

  /** After hero dismiss — slide to Home Base */
  enterDockedHome({ animate = true } = {}) {
    if (!this.mainEl) return;
    this._docked = true;
    this.activeSnap = SNAP.HOME;
    document.documentElement.style.setProperty("--v2-kicker-reserve", "0px");
    this.frameEl.classList.add("is-docked");
    const anchors = this._refreshAnchors();
    if (anchors) this._applyTop(anchors.homeBase, { animate, snap: SNAP.HOME });
  }

  /** @param {typeof SNAP[keyof typeof SNAP]} snapId */
  snapTo(snapId, { animate = true } = {}) {
    if (!this.mainEl) return;
    const anchors = this._refreshAnchors();
    if (!anchors) return;
    const map = {
      [SNAP.TOP]: anchors.topLock,
      [SNAP.HOME]: anchors.homeBase,
      [SNAP.BOTTOM]: anchors.bottomCushion
    };
    this.activeSnap = snapId;
    this._applyTop(map[snapId], { animate, snap: snapId });
  }

  remeasure() {
    if (!this._docked || !this.mainEl) return;
    const anchors = this._refreshAnchors();
    if (!anchors) return;
    const map = {
      [SNAP.TOP]: anchors.topLock,
      [SNAP.HOME]: anchors.homeBase,
      [SNAP.BOTTOM]: anchors.bottomCushion
    };
    this._applyTop(map[this.activeSnap], { animate: false, snap: this.activeSnap });
  }

  /**
   * @param {PointerEvent} event
   */
  onDragStart(event) {
    if (!this._docked || !this.mainEl || event.button !== 0) return false;

    this._dragging = true;
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
    if (this._dragRaf !== null) return;

    this._dragRaf = requestAnimationFrame(() => {
      this._dragRaf = null;
      this._flushDragMove();
    });
  }

  _flushDragMove() {
    if (!this._dragging || !this._pointer || !this.mainEl || !this._anchors) return;

    const dy = this._pendingClientY - this._pointer.startY;
    const next = clampTop(this._pointer.startTop + dy, this._anchors);
    this._applyTop(next, { animate: false, layout: false });
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

    const anchors = this._refreshAnchors();
    if (!anchors) return;

    const snap = resolveSnap(this._topPx, anchors);
    this.activeSnap = snap;
    this.snapTo(snap, { animate: this._motionEnabled });
  }

  /**
   * @param {number} topPx
   * @param {{ animate?: boolean, snap?: typeof SNAP[keyof typeof SNAP]|null, layout?: boolean }} [options]
   */
  _applyTop(topPx, { animate = false, snap = null, layout = true } = {}) {
    if (!this.mainEl) return;

    this._topPx = topPx;
    this.frameEl.style.top = `${topPx}px`;

    if (animate && this._motionEnabled) {
      this.frameEl.classList.add("is-animating");
      window.setTimeout(() => this.frameEl.classList.remove("is-animating"), EASE_MS);
    }

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

export { EASE_MS, EASE_CURVE };
