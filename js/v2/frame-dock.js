/** Magnetic snap anchors for the prompt frame vertical dock */
export const SNAP = {
  TOP: "top",
  HOME: "home",
  BOTTOM: "bottom"
};

const SNAP_THRESHOLD = 42;
const MIN_FRAME_HEIGHT = 260;
const HOME_NODE_CLEARANCE = 20;
const BOTTOM_CONTENT_CUSHION = 36;
const EASE_MS = 620;
const EASE_CURVE = "cubic-bezier(0.32, 0.94, 0.42, 1)";
const KICKER_RESERVE_DEFAULT = "clamp(4.5rem, 12vh, 6.25rem)";

/**
 * @param {HTMLElement} mainEl
 * @param {HTMLElement|null} mapEl
 * @param {HTMLElement} frameEl
 */
export function measureAnchors(mainEl, mapEl, frameEl) {
  const mainH = mainEl.clientHeight;
  const mainRect = mainEl.getBoundingClientRect();
  const topLock = 0;

  let homeBase = mainH * 0.36;
  const anchorBody =
    mapEl?.querySelector('[data-node-id="ghost-start"] .whatimado-map__node-body') ||
    mapEl?.querySelector(".whatimado-map__node--live.is-anchor .whatimado-map__node-body") ||
    mapEl?.querySelector(".whatimado-map__node--live.is-start .whatimado-map__node-body");

  if (anchorBody) {
    const nodeRect = anchorBody.getBoundingClientRect();
    homeBase = nodeRect.bottom - mainRect.top + HOME_NODE_CLEARANCE;
  }

  const frameH = Math.max(frameEl.offsetHeight, MIN_FRAME_HEIGHT);
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  const composerH = composer?.offsetHeight ?? 72;
  const minDockedH = composerH + MIN_FRAME_HEIGHT * 0.45 + BOTTOM_CONTENT_CUSHION;
  const bottomCushion = Math.max(topLock + 48, mainH - Math.max(frameH, minDockedH));

  homeBase = Math.max(topLock + 56, Math.min(homeBase, bottomCushion - 56));

  return { topLock, homeBase, bottomCushion, mainH };
}

/**
 * @param {number} topPx
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 */
export function clampTop(topPx, anchors) {
  return Math.max(anchors.topLock, Math.min(topPx, anchors.bottomCushion));
}

/**
 * @param {number} topPx
 * @param {{ topLock: number, homeBase: number, bottomCushion: number }} anchors
 * @returns {typeof SNAP[keyof typeof SNAP]|null}
 */
export function nearestSnap(topPx, anchors) {
  /** @type {[typeof SNAP[keyof typeof SNAP], number][]} */
  const points = [
    [SNAP.TOP, anchors.topLock],
    [SNAP.HOME, anchors.homeBase],
    [SNAP.BOTTOM, anchors.bottomCushion]
  ];

  let best = /** @type {typeof SNAP[keyof typeof SNAP]|null} */ (null);
  let bestDist = SNAP_THRESHOLD + 1;

  for (const [id, y] of points) {
    const dist = Math.abs(topPx - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }

  return bestDist <= SNAP_THRESHOLD ? best : null;
}

/**
 * @param {number} frameTop
 * @param {HTMLElement|null} mapEl
 * @param {HTMLElement} mainEl
 */
export function mapDimStrength(frameTop, mapEl, mainEl) {
  if (!mapEl) return 0;

  const mainRect = mainEl.getBoundingClientRect();
  const stage = mapEl.querySelector(".whatimado-map__stage");
  const mapBottom = stage
    ? stage.getBoundingClientRect().bottom - mainRect.top
    : mapEl.getBoundingClientRect().bottom - mainRect.top;

  if (frameTop >= mapBottom) return 0;
  const overlap = mapBottom - frameTop;
  return Math.min(1, overlap / Math.max(mapBottom * 0.85, 120));
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
    /** @type {boolean} */
    this._docked = false;
    /** @type {boolean} */
    this._dragging = false;
    /** @type {{ pointerId: number, startY: number, startTop: number }|null} */
    this._pointer = null;
    /** @type {boolean} */
    this._motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** @returns {number} */
  get topPx() {
    return this._topPx;
  }

  /** Initial open layout — frame sits at default vh anchor */
  enterOpenLayout() {
    if (!this.mainEl) return;
    const openVh =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--whatimado-frame-top-default")
      ) || 42;
    this._docked = false;
    this.activeSnap = SNAP.HOME;
    document.documentElement.style.setProperty("--v2-kicker-reserve", KICKER_RESERVE_DEFAULT);
    document.documentElement.style.removeProperty("--v2-map-dim");
    this._applyTop((this.mainEl.clientHeight * openVh) / 100, { animate: false, useVh: true });
    this.frameEl.classList.remove("is-docked", "is-dragging", "is-animating");
    this.frameEl.removeAttribute("data-snap");
    this.frameEl.style.removeProperty("top");
    this._setMapDim(0);
  }

  /** After hero dismiss — slide to Home Base */
  enterDockedHome({ animate = true } = {}) {
    if (!this.mainEl) return;
    this._docked = true;
    this.activeSnap = SNAP.HOME;
    document.documentElement.style.setProperty("--v2-kicker-reserve", "0px");
    this.frameEl.classList.add("is-docked");
    const anchors = measureAnchors(this.mainEl, this.mapEl, this.frameEl);
    this._applyTop(anchors.homeBase, { animate, snap: SNAP.HOME });
  }

  /** @param {typeof SNAP[keyof typeof SNAP]} snapId */
  snapTo(snapId, { animate = true } = {}) {
    if (!this.mainEl) return;
    const anchors = measureAnchors(this.mainEl, this.mapEl, this.frameEl);
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
    const anchors = measureAnchors(this.mainEl, this.mapEl, this.frameEl);
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
    this._pointer = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: this._topPx
    };
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

    const dy = event.clientY - this._pointer.startY;
    const anchors = measureAnchors(this.mainEl, this.mapEl, this.frameEl);
    const next = clampTop(this._pointer.startTop + dy, anchors);
    this._applyTop(next, { animate: false });
  }

  /**
   * @param {PointerEvent} event
   */
  onDragEnd(event) {
    if (!this._dragging || !this._pointer || event.pointerId !== this._pointer.pointerId || !this.mainEl) {
      return;
    }

    this._dragging = false;
    this._pointer = null;
    this.frameEl.classList.remove("is-dragging");

    const anchors = measureAnchors(this.mainEl, this.mapEl, this.frameEl);
    const snap = nearestSnap(this._topPx, anchors);
    if (snap) {
      this.activeSnap = snap;
      this.snapTo(snap, { animate: this._motionEnabled });
    } else {
      this._applyTop(this._topPx, { animate: this._motionEnabled });
    }
  }

  /**
   * @param {number} topPx
   * @param {{ animate?: boolean, snap?: typeof SNAP[keyof typeof SNAP]|null, useVh?: boolean }} [options]
   */
  _applyTop(topPx, { animate = false, snap = null, useVh = false } = {}) {
    if (!this.mainEl) return;

    this._topPx = topPx;

    if (useVh && this.mainEl.clientHeight > 0) {
      const vh = (topPx / this.mainEl.clientHeight) * 100;
      document.documentElement.style.setProperty("--whatimado-frame-top", `${vh}vh`);
      document.documentElement.style.setProperty("--v2-map-band-h", `${vh}vh`);
    } else {
      this.frameEl.style.top = `${topPx}px`;
      document.documentElement.style.setProperty("--whatimado-frame-top", `${topPx}px`);
      document.documentElement.style.setProperty("--v2-map-band-h", `${topPx}px`);
    }

    if (animate && this._motionEnabled) {
      this.frameEl.classList.add("is-animating");
      window.setTimeout(() => this.frameEl.classList.remove("is-animating"), EASE_MS);
    }

    if (snap) {
      this.frameEl.dataset.snap = snap;
    }

    this._setMapDim(mapDimStrength(topPx, this.mapEl, this.mainEl));
    this.onLayout();
  }

  /** @param {number} strength 0–1 */
  _setMapDim(strength) {
    document.documentElement.style.setProperty("--v2-map-dim", String(Math.max(0, Math.min(1, strength))));
    this.frameEl.style.setProperty("--v2-frame-elevation", String(Math.max(0, Math.min(1, strength))));
  }
}

export { EASE_MS, EASE_CURVE };
