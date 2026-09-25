import { GHOST_GRAPH, graphStore, placeLinkedBranch, relayoutLinkedSpread, roadmapFocusLinked, setMapSpread, setRoadmapFocusLinked, showRoadmapBranch } from "../../graph-store.js";
import { measureAnchors } from "../../dock/anchors.js";
import {
  BOUND_GLIDE_DAMP,
  BOUND_PULL,
  GLIDE_FRICTION,
  GLIDE_MAX_SPEED,
  GLIDE_MIN_SPEED,
  GLIDE_VEL_SCALE,
  HOME_RETURN_KICK,
  HOME_RETURN_KICK_MAX,
  HOME_SETTLE_DIST,
  HOME_SETTLE_SPEED,
  HOME_SOFT_RADIUS,
  HOME_SPRING_DAMP,
  HOME_SPRING_DAMP_SETTLE,
  HOME_SPRING_K,
  MOBILE_MQ,
  SCALE_CENTER_X,
  SCALE_CENTER_Y,
  VIEW_H,
  VIEW_W,
  ZOOM_MAX,
  ZOOM_MIN
} from "../../map/constants.js";
import {
  driftOffset,
  escapeHtml,
  getMapBounds,
  getNodeRadii,
  readGraphShiftY,
  svgScale,
  svgScaleXY,
  trimLineToNodeEdges
} from "../../map/geometry.js";
import {
  clientToSvg,
  computeChatFrameGravityPan,
  computeChatFrameGravityPanAtMainTop,
  computeDefaultScenePan,
  computeMobileFocusBandPan,
  computeMobileOpenHomePan,
  computeOpenHomeGravityPan,
  computePanForFocalNode,
  computePanForNodeAboveFrame,
  isOpenHomePhase
} from "../../map/pan.js";

/** @param {string} title */
function wrapTitle(title) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  /** @type {string[]} */
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 18 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** @param {number} cx @param {number} cy @param {number} r @param {string} title @param {string} [side] */
function labelMarkup(cx, cy, r, title, side) {
  const lines = wrapTitle(title);
  const lineH = 13;
  if (side === "nw") {
    const x = cx - r - 6;
    const start = cy - ((lines.length - 1) * lineH) / 2;
    return `<text class="whatimado-map__label" text-anchor="end">${lines
      .map((line, index) => `<tspan x="${x}" y="${start + index * lineH}">${escapeHtml(line)}</tspan>`)
      .join("")}</text>`;
  }
  const start = cy - r - 8 - (lines.length - 1) * lineH;
  return `<text class="whatimado-map__label" text-anchor="middle">${lines
    .map((line, index) => `<tspan x="${cx}" y="${start + index * lineH}">${escapeHtml(line)}</tspan>`)
    .join("")}</text>`;
}

const MAP_TEMPLATE = `
  <div class="whatimado-map__pan-surface" part="pan-surface" aria-hidden="true"></div>
  <div class="whatimado-map__stage">
    <button type="button" class="whatimado-map__new-roadmap hidden" part="new-roadmap">New roadmap</button>
    <button type="button" class="whatimado-map__link-btn is-linked" part="focus-link" aria-pressed="true" aria-label="Linked. The selected roadmap runs left to right. Unlink to keep the constellation.">
      <svg class="whatimado-map__link-icon whatimado-map__link-icon--on" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07l-1.1 1.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-1.92 1.92a5 5 0 0 0 7.07 7.07l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      <svg class="whatimado-map__link-icon whatimado-map__link-icon--off" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
    </button>
    <button type="button" class="whatimado-map__you-btn" part="you-reset" aria-label="Center the map">
      <svg class="whatimado-map__you-crosshair" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" stroke-width="1.65" />
        <path d="M12 3v18M3 12h18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </svg>
    </button>
    <svg class="whatimado-map__svg" part="svg" role="img" aria-label="Possibility map">
      <defs>
        <filter id="whatimado-node-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(46,232,214,0.35)" />
        </filter>
        <filter id="whatimado-node-shadow-primary" x="-90%" y="-90%" width="280%" height="280%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.55)" />
          <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="rgba(245,213,71,0.45)" />
        </filter>
        <filter id="whatimado-node-aura" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur1" />
          <feGaussianBlur in="blur1" stdDeviation="4" result="blur2" />
          <feColorMatrix in="blur2" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.42 0" result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
          </feMerge>
        </filter>
      </defs>
      <g class="whatimado-map__pan">
        <g class="whatimado-map__layer whatimado-map__layer--ghost"></g>
        <g class="whatimado-map__layer whatimado-map__layer--live"></g>
      </g>
    </svg>
  </div>
`;

export class WhatimadoMap extends HTMLElement {
  static get observedAttributes() {
    return ["mode"];
  }

  constructor() {
    super();
    /** @type {boolean} */
    this._built = false;
    /** @type {boolean} */
    this._ghostDismissed = false;
    /** @type {SVGGElement|null} */
    this._panLayer = null;
    /** @type {HTMLElement|null} */
    this._panSurface = null;
    /** @type {HTMLButtonElement|null} */
    this._youBtn = null;
    /** @type {number} */
    this._panX = 0;
    /** @type {number} */
    this._panY = 0;
    /** @type {boolean} */
    this._userPanned = false;
    /** @type {boolean} */
    this._expandedSnap = false;
    /** @type {{ x: number, y: number, t: number }[]} */
    this._panSamples = [];
    /** @type {number} */
    this._panVelX = 0;
    /** @type {number} */
    this._panVelY = 0;
    /** @type {boolean} */
    this._panGliding = false;
    /** @type {number|null} */
    this._panGlideRaf = null;
    /** @type {{ pointerId: number, startPanX: number, startPanY: number, startClientX: number, startClientY: number, scaleX: number, scaleY: number }|null} */
    this._panPointer = null;
    /** @type {number|null} */
    this._panMoveRaf = null;
    /** @type {number} */
    this._panPendingClientX = 0;
    /** @type {number} */
    this._panPendingClientY = 0;
    /** @type {Element|null} */
    this._panCaptureEl = null;
    /** @type {number|null} */
    this._panResetRaf = null;
    /** @type {number|null} */
    this._gravityRaf = null;
    /** @type {boolean} */
    this._focalLocked = false;
    /** @type {string|null} */
    this._focalNodeId = null;
    /** @type {SVGElement|null} */
    this._svg = null;
    /** @type {SVGGElement|null} */
    this._ghostLayer = null;
    /** @type {SVGGElement|null} */
    this._liveLayer = null;
    /** @type {string|null} */
    this._selectedId = null;
    /** @type {string|null} */
    this._pathPreviewId = null;
    /** @type {string|null} */
    this._hoverNodeId = null;
    /** @type {number|null} */
    this._hoverRaf = null;
    /** @type {{ x: number, y: number }} */
    this._lastHoverClient = { x: 0, y: 0 };
    /** @type {string|null} */
    this._anchorId = "ghost-start";
    /** @type {(nodeId: string) => void|null} */
    this._onSelect = null;
    /** @type {(() => boolean)|null} */
    this._promptEmptyChecker = null;
    /** @type {number|null} */
    this._driftFrame = null;
    /** @type {number} */
    this._driftStartMs = 0;
    /** @type {boolean} */
    this._driftReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /** @type {import("../../graph-store.js").GraphNode[]} */
    this._liveNodes = [];
    /**
     * @type {Map<string, {
     *   baseX: number, baseY: number, radius: number,
     *   originX: number, originY: number,
     *   delay: number, duration: number,
     *   dragX: number, dragY: number,
     *   glideVx: number, glideVy: number,
     *   homeVx: number, homeVy: number,
     *   driftAnchorX: number, driftAnchorY: number,
     *   groupEl: SVGGElement,
     *   circleEl: SVGCircleElement, auraEl: SVGCircleElement|null,
     *   hitEl: SVGCircleElement|null, textEl: SVGTextElement|null
     * }>}
     */
    this._driftNodes = new Map();
    /** @type {{ lineEl: SVGLineElement, fromId: string, toId: string }[]} */
    this._driftEdges = [];
    /** @type {{
     *   nodeId: string, pointerId: number,
     *   startSvgX: number, startSvgY: number,
     *   startBaseX: number, startBaseY: number,
     *   moved: boolean,
     *   prevX: number, prevY: number,
     *   velX: number, velY: number
     * }|null} */
    this._pointer = null;

    /** @type {boolean} */
    this._globalPanActive = false;
    /** While true, map pan/band follow hero dismiss; locked false after dock settles */
    this._frameCoupled = true;
    /** @type {number} */
    this._zoom = 1;
    /** @type {{ startDist: number, startZoom: number, startPanX: number, startPanY: number, focalX: number, focalY: number }|null} */
    this._pinch = null;

    this._onPinchTouchStart = (event) => this._handlePinchTouchStart(event);
    this._onPinchTouchMove = (event) => this._handlePinchTouchMove(event);
    this._onPinchTouchEnd = (event) => this._handlePinchTouchEnd(event);

    this._onPointerMove = (event) => this._handlePointerMove(event);
    this._onPointerUp = (event) => this._handlePointerUp(event);
    this._onGlobalPanMove = (event) => this._handlePanMove(event);
    this._onGlobalPanUp = (event) => this._finishPanPointer(event);
    this._onPanTouchMove = (event) => {
      if (this._panPointer || this._pinch) event.preventDefault();
    };
    /** Hover via geometry — SVG :hover is unreliable under pan-surface stacking */
    this._onHoverPointerMove = (event) => this._handleHoverPointerMove(event);
    this._onHoverMouseMove = (event) => this._handleHoverPointerMove(event);
  }

  connectedCallback() {
    if (!this._built) this._build();
    window.addEventListener("pointermove", this._onHoverPointerMove, { passive: true, capture: true });
    window.addEventListener("mousemove", this._onHoverMouseMove, { passive: true, capture: true });
    this._applyMode();
    if (this._ghostLayer?.childElementCount === 0) {
      this.loadGhostGraph();
    }
    if (this._liveLayer?.childElementCount === 0) {
      this.loadAmbientLiveGraph();
    }
    this._refreshDrift();
    this._onViewportResize = () => {
      if (this._userPanned || window.matchMedia("(max-width: 900px)").matches || isOpenHomePhase()) {
        this.syncDesktopViewBox();
        return;
      }
      const target = this._computeChatFrameGravityPan();
      if (typeof target.zoom === "number") this._zoom = target.zoom;
      this._animatePanTo(target.panX, target.panY, false);
    };
    window.addEventListener("resize", this._onViewportResize);
    requestAnimationFrame(() => {
      this._frameCoupled = true;
      this.syncFrameGravity({ animate: false });
      this.lockFromFrame();
    });
  }

  /** Stop following prompt frame after hero dismiss completes. */
  lockFromFrame() {
    this._frameCoupled = false;
  }

  /** Re-enable frame coupling on home reset (new roadmap prompt). */
  unlockFrameCoupling() {
    this._frameCoupled = true;
    this.syncFrameGravity({ animate: false });
    this.lockFromFrame();
  }

  /** Frame slide must not take the constellation with it. */
  cancelPanFromFrameDrag() {
    this._cancelPanMoveFrame();
    this._stopPanGlide();
    if (this._gravityRaf !== null) {
      cancelAnimationFrame(this._gravityRaf);
      this._gravityRaf = null;
    }
    this._releasePanCapture();
    if (this._globalPanActive) {
      this._detachGlobalPanListeners();
    }
    this._panPointer = null;
    this._panSamples = [];
    this.classList.remove("is-panning");
    this.setNodeHover(null);
  }

  disconnectedCallback() {
    this._stopDriftLoop();
    this._stopPanGlide();
    this.cancelPanFromFrameDrag();
    if (this._panResetRaf !== null) {
      cancelAnimationFrame(this._panResetRaf);
      this._panResetRaf = null;
    }
    if (this._gravityRaf !== null) {
      cancelAnimationFrame(this._gravityRaf);
      this._gravityRaf = null;
    }
    this._onSelect = null;
    this._promptEmptyChecker = null;
    this.removeEventListener("pointermove", this._onPointerMove);
    this.removeEventListener("pointerup", this._onPointerUp);
    this.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("resize", this._onViewportResize);
    window.removeEventListener("pointermove", this._onHoverPointerMove, true);
    window.removeEventListener("mousemove", this._onHoverMouseMove, true);
    if (this._hoverRaf !== null) {
      cancelAnimationFrame(this._hoverRaf);
      this._hoverRaf = null;
    }
    this._detachGlobalPanListeners();
    this._panSurface?.removeEventListener("touchstart", this._onPinchTouchStart);
    this._panSurface?.removeEventListener("touchmove", this._onPinchTouchMove);
    this._panSurface?.removeEventListener("touchend", this._onPinchTouchEnd);
    this._panSurface?.removeEventListener("touchcancel", this._onPinchTouchEnd);
  }

  attributeChangedCallback(name) {
    if (name === "mode") this._applyMode();
  }

  /** @param {(nodeId: string) => void} handler */
  setNodeSelectHandler(handler) {
    this._onSelect = handler;
  }

  /** @param {() => boolean} checker Returns true when prompt box is empty */
  setPromptEmptyChecker(checker) {
    this._promptEmptyChecker = checker;
  }

  loadGhostGraph() {
    if (this._ghostLayer) this._ghostLayer.innerHTML = "";
  }

  /** Floating nodes on load — edges live on the live layer so they persist after ghost dismiss */
  loadAmbientLiveGraph() {
    this._liveNodes = GHOST_GRAPH.nodes;
    this._anchorId = "ghost-start";
    this._renderLayer(this._liveLayer, GHOST_GRAPH.nodes, GHOST_GRAPH.edges, {
      layer: "live"
    });
    this._applyAnchorStyles();
  }

  _syncLinkButton() {
    const linked = roadmapFocusLinked;
    this._linkBtn?.classList.toggle("is-linked", linked);
    this._linkBtn?.setAttribute("aria-pressed", linked ? "true" : "false");
    this._linkBtn?.setAttribute(
      "aria-label",
      linked
        ? "Linked. The selected roadmap runs left to right. Unlink to keep the constellation."
        : "Unlinked. The constellation stays put. Link to spin the selected roadmap left to right."
    );
  }

  _toggleFocusLink() {
    setRoadmapFocusLinked(!roadmapFocusLinked);
    this._syncLinkButton();
    const chosen =
      this._liveNodes.find((node) => node.id === this._selectedId && node.type === "path") ||
      this._liveNodes.find((node) => node.type === "path");
    if (!chosen) return;
    showRoadmapBranch(chosen.id);
    this.syncLiveFromStore();
  }

  _cancelLayoutSpin() {
    if (this._layoutSpinRaf) cancelAnimationFrame(this._layoutSpinRaf);
    this._layoutSpinRaf = 0;
  }

  /**
   * Spin spokes around You so the selected roadmap lands pointing right.
   * @param {GraphNode[]} nodes
   * @param {GraphEdge[]} edges
   * @param {{ id: string, x: number, y: number }[]} prev
   * @param {{ from: number, to: number, chosenId: string }} spin
   */
  _animateLinkedSpin(nodes, edges, prev, spin) {
    const started = performance.now();
    const duration = 680;
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      placeLinkedBranch(nodes, spin.from + (spin.to - spin.from) * eased, spin.chosenId);
      this._renderLayer(this._liveLayer, nodes, edges, { layer: "live" });
      this._applyAnchorStyles();
      if (t < 1) {
        this._layoutSpinRaf = requestAnimationFrame(step);
        return;
      }
      this._layoutSpinRaf = 0;
      graphStore.focusRotation = spin.to;
    };
    placeLinkedBranch(nodes, spin.from, spin.chosenId);
    this._renderLayer(this._liveLayer, nodes, edges, { layer: "live" });
    this._layoutSpinRaf = requestAnimationFrame(step);
  }

  /** @param {GraphNode[]} nodes @param {GraphEdge[]} edges */
  loadLiveGraph(nodes, edges) {
    const prev = this._liveNodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
    const spin = graphStore.focusSpin;
    graphStore.focusSpin = null;
    this._cancelLayoutSpin();
    this._liveNodes = nodes;
    const start = nodes.find((n) => n.type === "start");
    this._anchorId = start?.id ?? nodes[0]?.id ?? this._anchorId;
    const moved = prev.some((node) => {
      const next = nodes.find((entry) => entry.id === node.id);
      return next && Math.hypot(next.x - node.x, next.y - node.y) > 0.03;
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (roadmapFocusLinked && spin && moved && !reduce) {
      this._animateLinkedSpin(nodes, edges, prev, spin);
      return;
    }
    this._renderLayer(this._liveLayer, nodes, edges, { layer: "live" });
  }

  /** Sync live layer from graph-store */
  syncLiveFromStore() {
    this.loadLiveGraph(graphStore.nodes, graphStore.edges);
    this._applyAnchorStyles();
    if (this.dataset.readingPinned === "1" || this.dataset.focusPinned === "1") {
      this.fitLockedScene({ animate: false });
      return;
    }
    const fresh = this.querySelector(".whatimado-map__new-roadmap");
    const onRoadmap = this._liveNodes.some((node) => node.type === "path" || node.type === "task");
    fresh?.classList.toggle("hidden", !onRoadmap);
    if (window.matchMedia("(max-width: 900px)").matches || isOpenHomePhase()) return;
    this._userPanned = false;
    const target = this._computeChatFrameGravityPan();
    if (typeof target.zoom === "number") this._zoom = target.zoom;
    this._animatePanTo(target.panX, target.panY, false);
  }

  /** Fade out ambient ghost (Step B — full personalize in Step D) */
  dismissGhost({ instant = false } = {}) {
    if (this._ghostDismissed && !instant) return;
    this._ghostDismissed = true;
    if (instant) {
      this.classList.remove("is-dismissing-ghost");
      this.classList.add("is-ghost-dismissed");
      if (this.getAttribute("mode") === "ghost") {
        this.setAttribute("mode", "faint");
      }
      return;
    }
    this.classList.add("is-dismissing-ghost");
    window.setTimeout(() => {
      this.classList.add("is-ghost-dismissed");
      if (this.getAttribute("mode") === "ghost") {
        this.setAttribute("mode", "faint");
      }
    }, 480);
  }

  /** @param {string|null} id */
  setSelectedNode(id) {
    this._selectedId = id;
    if (id && this._liveNodes.length <= 2) {
      this._focalLocked = true;
      this._focalNodeId = id;
      const desktop = !window.matchMedia("(max-width: 900px)").matches;
      if (desktop) this.syncDesktopViewBox();
      const target = desktop ? computePanForNodeAboveFrame(this, id) : this._computePanForFocalNode(id);
      this._animatePanTo(target.panX, target.panY, true);
    } else {
      this._focalLocked = false;
      this._focalNodeId = null;
    }
    this._applyAnchorStyles();
    this.setPathPreview(null);
  }

  /** Mirror path-card hover on the matching live node */
  /** @param {string|null} id */
  setPathPreview(id) {
    if (this._pathPreviewId === id) return;

    if (this._pathPreviewId) {
      const prev = this.querySelector(
        `.whatimado-map__node--live[data-node-id="${this._pathPreviewId}"]`
      );
      prev?.classList.remove("is-path-preview");
    }

    this._pathPreviewId = id;

    if (!id) return;

    const group = this.querySelector(`.whatimado-map__node--live[data-node-id="${id}"]`);
    group?.classList.add("is-path-preview");
  }

  /** Direct map hover — geometry-driven, separate from path-card preview */
  /** @param {string|null} id */
  setNodeHover(id) {
    if (this._hoverNodeId === id) return;

    if (this._hoverNodeId) {
      const prev = this.querySelector(
        `.whatimado-map__node--live[data-node-id="${this._hoverNodeId}"]`
      );
      prev?.classList.remove("is-hover");
    }

    this._hoverNodeId = id;

    if (!id) return;

    const group = this.querySelector(`.whatimado-map__node--live[data-node-id="${id}"]`);
    group?.classList.add("is-hover");
  }

  /** @param {string} id */
  setAnchorNode(id) {
    this._anchorId = id;
    this._applyAnchorStyles();
  }

  /** @returns {string|null} */
  getAnchorNodeId() {
    return this._anchorId;
  }

  /** Cancel pan glide animation without clearing release velocity */
  _cancelPanGlideFrame() {
    if (this._panGlideRaf !== null) {
      cancelAnimationFrame(this._panGlideRaf);
      this._panGlideRaf = null;
    }
    this._panGliding = false;
  }

  /** Stop inertial pan glide and zero velocity */
  _stopPanGlide() {
    this._cancelPanGlideFrame();
    this._panVelX = 0;
    this._panVelY = 0;
  }

  /**
   * Release velocity for canvas pan — same friction family as frame/node glide.
   * @param {{ x: number, y: number, t: number }[]} samples
   * @param {number} scaleX svg units per pixel
   * @param {number} [scaleY]
   */
  _computePanReleaseVelocity(samples, scaleX, scaleY = scaleX) {
    if (samples.length < 2) return { vx: 0, vy: 0 };

    const last = samples[samples.length - 1];
    const prev = samples[Math.max(0, samples.length - 4)];
    const dt = last.t - prev.t;
    if (dt <= 0) return { vx: 0, vy: 0 };

    const pxPerMsX = (last.x - prev.x) / dt;
    const pxPerMsY = (last.y - prev.y) / dt;
    const pxPerFrameX = pxPerMsX * (1000 / 60) * scaleX;
    const pxPerFrameY = pxPerMsY * (1000 / 60) * scaleY;

    let vx = pxPerFrameX * GLIDE_VEL_SCALE;
    let vy = pxPerFrameY * GLIDE_VEL_SCALE;
    const speed = Math.hypot(vx, vy);
    if (speed > GLIDE_MAX_SPEED) {
      vx = (vx / speed) * GLIDE_MAX_SPEED;
      vy = (vy / speed) * GLIDE_MAX_SPEED;
    }

    return { vx, vy };
  }

  /** Inertial pan glide — velocity is set before calling; do not zero it here */
  _startPanGlide() {
    this._cancelPanGlideFrame();
    this._panGliding = true;

    const step = () => {
      this._panVelX *= GLIDE_FRICTION;
      this._panVelY *= GLIDE_FRICTION;
      this._panX += this._panVelX;
      this._panY += this._panVelY;
      this._applyPanTransform();

      if (Math.hypot(this._panVelX, this._panVelY) < GLIDE_MIN_SPEED) {
        this._stopPanGlide();
        return;
      }

      this._panGlideRaf = requestAnimationFrame(step);
    };

    this._panGlideRaf = requestAnimationFrame(step);
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeMobileOpenHomePan() {
    return computeMobileOpenHomePan(this);
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeOpenHomeGravityPan() {
    return computeOpenHomeGravityPan(this);
  }

  /**
   * Desktop chat uses a viewBox as tall as the column so nodes stay round
   * and can pan through the space behind the prompt.
   */
  syncDesktopViewBox() {
    if (!this._svg) return;
    const openHome =
      document.body.dataset.phase === "open" && !document.body.classList.contains("is-hero-dismissing");
    if (window.matchMedia("(max-width: 900px)").matches || openHome) {
      this._svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
      this._svg.removeAttribute("preserveAspectRatio");
      return;
    }
    const stage = this.querySelector(".whatimado-map__stage");
    const rect = stage?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const vbH = VIEW_W * (rect.height / rect.width);
    this._svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${vbH}`);
    this._svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeChatFrameGravityPan() {
    this.syncDesktopViewBox();
    return computeChatFrameGravityPan(this);
  }

  /**
   * @param {number} frameTopMainPx
   * @returns {{ panX: number, panY: number }}
   */
  _computeChatFrameGravityPanAtMainTop(frameTopMainPx) {
    return computeChatFrameGravityPanAtMainTop(this, frameTopMainPx);
  }

  /** During hero dismiss — map follows projected frame top */
  syncGravityForFrameTop(frameTopMainPx, { animate = false } = {}) {
    if (!this._frameCoupled || (this._focalLocked && !this._focalNodeId)) return;

    const target = this._computeChatFrameGravityPanAtMainTop(frameTopMainPx);
    if (typeof target.zoom === "number") this._zoom = target.zoom;
    this._animatePanTo(target.panX, target.panY, animate);
  }

  /** Frozen default when decoupled — centers graph in map stage */
  _computeDefaultScenePan() {
    return computeDefaultScenePan(this);
  }

  /** Recenter a locked constellation after the mobile map band is resized. */
  fitLockedScene({ animate = false } = {}) {
    const chatPinned = this.dataset.readingPinned === "1" || this.dataset.focusPinned === "1";
    const target = chatPinned ? this._computeChatFrameGravityPan() : this._computeDefaultScenePan();
    if (typeof target.zoom === "number") this._zoom = target.zoom;
    this._animatePanTo(target.panX, target.panY, animate);
  }

  /**
   * @param {string} nodeId
   * @returns {{ panX: number, panY: number }}
   */
  _computePanForFocalNode(nodeId) {
    return computePanForFocalNode(this, nodeId);
  }

  /**
   * @param {number} targetX
   * @param {number} targetY
   * @param {boolean} [animate]
   */
  _animatePanTo(targetX, targetY, animate = false) {
    this._stopPanGlide();
    if (this._gravityRaf !== null) {
      cancelAnimationFrame(this._gravityRaf);
      this._gravityRaf = null;
    }

    if (!animate || this._driftReducedMotion) {
      this._panX = targetX;
      this._panY = targetY;
      this._applyPanTransform();
      return;
    }

    const startX = this._panX;
    const startY = this._panY;
    const startTime = performance.now();
    const duration = 680;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) ** 5;
      this._panX = startX + (targetX - startX) * eased;
      this._panY = startY + (targetY - startY) * eased;
      this._applyPanTransform();
      if (t < 1) {
        this._gravityRaf = requestAnimationFrame(tick);
      } else {
        this._gravityRaf = null;
      }
    };

    this._gravityRaf = requestAnimationFrame(tick);
  }

  /** @returns {DOMRect|null} */
  getStartNodeScreenRect() {
    const start = this._liveNodes.find((node) => node.type === "start");
    if (!start) return null;

    const group = this.querySelector(`.whatimado-map__node--live[data-node-id="${start.id}"]`);
    if (!group) return null;

    const body = group.querySelector(".whatimado-map__node-body") ?? group;
    return body.getBoundingClientRect();
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeMobileFocusBandPan() {
    return computeMobileFocusBandPan(this);
  }

  /** Neutralized — focus must not repack / auto-pan the node map. */
  syncMobileFocusBand() {}

  /** Neutralized — focus/blur must not animate map pan back to home. */
  resetMobileFocusBand() {}

  /** Align map to hero/frame layout while coupled; no-op once dock has settled. */
  syncFrameGravity({ animate = false } = {}) {
    if (!this._frameCoupled || (this._focalLocked && !this._focalNodeId)) return;

    let target;
    if (this._focalLocked && this._focalNodeId) {
      target = this._computePanForFocalNode(this._focalNodeId);
    } else if (isOpenHomePhase()) {
      target = this._computeOpenHomeGravityPan();
    } else {
      target = this._computeChatFrameGravityPan();
    }

    if (typeof target.zoom === "number") this._zoom = target.zoom;
    this._animatePanTo(target.panX, target.panY, animate);
  }

  /**
   * Three-quarter frame keeps a compact fan in the gap.
   * Top and bottom use the same expanded figure.
   * @param {number} [frameTop]
   */
  syncSpreadForFrame(frameTop) {
    if (window.matchMedia("(max-width: 900px)").matches || !roadmapFocusLinked) return;
    const frame = document.getElementById("dynamic-frame");
    const main = document.querySelector(".v2-main");
    if (!(frame instanceof HTMLElement) || !(main instanceof HTMLElement)) return;
    const anchors = measureAnchors(main, frame);
    const top = Number.isFinite(frameTop) ? frameTop : frame.getBoundingClientRect().top - main.getBoundingClientRect().top;
    const up = (anchors.homeBase - top) / Math.max(1, anchors.homeBase - anchors.topLock);
    const down = (top - anchors.homeBase) / Math.max(1, anchors.bottomCushion - anchors.homeBase);
    const expand = Math.max(0, Math.min(1, Math.max(up, down)));
    const next = 1 + expand * 0.62;
    if (Math.abs(next - (this._mapSpread || 1)) < 0.02 && this._spreadReady) return;
    this._mapSpread = next;
    this._spreadReady = true;
    setMapSpread(next);
    if (!relayoutLinkedSpread()) return;
    this._liveNodes = graphStore.nodes;
    this._renderLayer(this._liveLayer, graphStore.nodes, graphStore.edges, { layer: "live" });
    this._applyAnchorStyles();
    const expanded = expand > 0.82;
    if (expanded) {
      this.syncDesktopViewBox();
      const target = this._computeChatFrameGravityPanAtMainTop(anchors.bottomCushion);
      if (typeof target.zoom === "number") this._zoom = target.zoom;
      this._animatePanTo(target.panX, target.panY, false);
      return;
    }
    this._userPanned = false;
    const target = this._computeChatFrameGravityPan();
    if (typeof target.zoom === "number") this._zoom = target.zoom;
    this._animatePanTo(target.panX, target.panY, false);
  }

  /**
   * Frame pulled to the bottom or the top: same expanded map.
   * The three-quarter snap keeps the compact fan in the gap.
   */
  syncSnapCamera() {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    const frame = document.getElementById("dynamic-frame");
    const main = document.querySelector(".v2-main");
    if (!(frame instanceof HTMLElement) || !(main instanceof HTMLElement)) return;
    const top = frame.getBoundingClientRect().top - main.getBoundingClientRect().top;
    this._spreadReady = false;
    this.syncSpreadForFrame(top);
  }

  /** Center the You node, or the selected path node, in the gap above the prompt. */
  resetToYou({ animate = true } = {}) {
    this._focalLocked = false;
    this._focalNodeId = null;
    this._userPanned = false;
    this.syncDesktopViewBox();
    const selected = this._liveNodes.find((node) => node.id === this._selectedId && node.type !== "start" && node.type !== "more");
    const anchor = this._liveNodes.find((node) => node.type === "path");
    const you = this._liveNodes.find((node) => node.type === "start");
    const focal = selected || anchor || you;
    const target = focal ? computePanForNodeAboveFrame(this, focal.id) : this._computeChatFrameGravityPan();
    this._animatePanTo(target.panX, target.panY, animate);
  }

  /** @param {TouchList} touches */
  _touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  /** @param {TouchList} touches */
  _touchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  /** @param {TouchEvent} event */
  _handlePinchTouchStart(event) {
    if (event.touches.length === 1) {
      event.preventDefault();
      return;
    }
    if (event.touches.length !== 2 || !this._panSurface) return;

    event.preventDefault();
    this._stopPanGlide();
    if (this._panPointer) {
      this.cancelPanFromFrameDrag();
    }

    const center = this._touchCenter(event.touches);
    const focal = this._clientToSvg(center.x, center.y);

    this._pinch = {
      startDist: this._touchDistance(event.touches),
      startZoom: this._zoom,
      startPanX: this._panX,
      startPanY: this._panY,
      focalX: focal.x,
      focalY: focal.y
    };
    this.classList.add("is-pinch-zooming");
  }

  /** @param {TouchEvent} event */
  _handlePinchTouchMove(event) {
    event.preventDefault();
    if (!this._pinch || event.touches.length < 2) return;
    const dist = this._touchDistance(event.touches);
    if (this._pinch.startDist <= 0) return;

    const nextZoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this._pinch.startZoom * (dist / this._pinch.startDist))
    );
    const deltaZoom = this._pinch.startZoom - nextZoom;

    this._zoom = nextZoom;
    this._panX = this._pinch.startPanX + deltaZoom * (this._pinch.focalX - SCALE_CENTER_X);
    this._panY = this._pinch.startPanY + deltaZoom * (this._pinch.focalY - SCALE_CENTER_Y);
    this._applyPanTransform();
  }

  /** @param {TouchEvent} event */
  _handlePinchTouchEnd(event) {
    if (event.touches.length >= 2) return;

    if (this._pinch) {
      this._focalLocked = true;
      this._focalNodeId = null;
    }
    this._pinch = null;
    this.classList.remove("is-pinch-zooming");
  }

  /** Apply camera transform: built-in graph shift + user pan offset + pinch zoom */
  _applyPanTransform() {
    if (!this._panLayer) return;
    const shiftY = readGraphShiftY();
    const z = this._zoom;
    this._panLayer.setAttribute(
      "transform",
      `translate(${this._panX}, ${shiftY + this._panY}) translate(${SCALE_CENTER_X}, ${SCALE_CENTER_Y}) scale(${z}) translate(${-SCALE_CENTER_X}, ${-SCALE_CENTER_Y})`
    );
  }

  _detachGlobalPanListeners() {
    document.removeEventListener("pointermove", this._onGlobalPanMove);
    document.removeEventListener("pointerup", this._onGlobalPanUp);
    document.removeEventListener("pointercancel", this._onGlobalPanUp);
    document.removeEventListener("touchmove", this._onPanTouchMove);
    document.body.classList.remove("is-map-panning");
    this._globalPanActive = false;
  }

  _releasePanCapture() {
    const el = this._panCaptureEl;
    const pointer = this._panPointer;
    this._panCaptureEl = null;
    if (!el || !pointer) return;
    try {
      if (el.hasPointerCapture?.(pointer.pointerId)) {
        el.releasePointerCapture(pointer.pointerId);
      }
    } catch {
      /* already released */
    }
  }

  _cancelPanMoveFrame() {
    if (this._panMoveRaf !== null) {
      cancelAnimationFrame(this._panMoveRaf);
      this._panMoveRaf = null;
    }
  }

  /** @param {PointerEvent} event */
  _finishPanPointer(event) {
    if (!this._panPointer || event.pointerId !== this._panPointer.pointerId) return;

    this._flushPanMove();
    this._cancelPanMoveFrame();

    const startPanX = this._panPointer.startPanX;
    const startPanY = this._panPointer.startPanY;
    const scaleX = this._panPointer.scaleX;
    const scaleY = this._panPointer.scaleY;

    this._releasePanCapture();
    if (this._globalPanActive) {
      this._detachGlobalPanListeners();
    }

    const { vx, vy } = this._computePanReleaseVelocity(this._panSamples, scaleX, scaleY);
    this._panSamples = [];
    this._panPointer = null;
    this.classList.remove("is-panning");

    if (Math.hypot(this._panX - startPanX, this._panY - startPanY) > 6) {
      this._focalLocked = true;
      this._focalNodeId = null;
      this._userPanned = true;
    }

    if (!this._driftReducedMotion && Math.hypot(vx, vy) >= GLIDE_MIN_SPEED) {
      this._panVelX = vx;
      this._panVelY = vy;
      this._startPanGlide();
    }
  }

  /**
   * Global pan entry — any visible map background outside the prompt frame.
   * @param {PointerEvent} event
   */
  handleGlobalPanPointerDown(event) {
    if (event.button !== 0) return;
    if (this._pinch) return;
    if (this.getAttribute("mode") === "hidden") return;
    if (document.body.classList.contains("is-frame-dragging")) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("whatimado-frame")) return;
    if (target.closest(".whatimado-map__node")) return;
    if (target.closest(".whatimado-map__you-btn, .whatimado-map__link-btn, .whatimado-map__new-roadmap")) return;

    this._beginPanPointer(event);
  }

  /** @param {PointerEvent} event */
  _beginPanPointer(event) {
    event.preventDefault();
    this._stopPanGlide();
    this._cancelPanMoveFrame();

    const { x: scaleX, y: scaleY } = svgScaleXY(this._svg);
    const captureEl = event.target instanceof Element ? event.target : this._panSurface;

    this._globalPanActive = true;
    document.body.classList.add("is-map-panning");
    document.addEventListener("pointermove", this._onGlobalPanMove);
    document.addEventListener("pointerup", this._onGlobalPanUp);
    document.addEventListener("pointercancel", this._onGlobalPanUp);
    document.addEventListener("touchmove", this._onPanTouchMove, { passive: false });

    this._panSamples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
    this._panPendingClientX = event.clientX;
    this._panPendingClientY = event.clientY;
    this._panPointer = {
      pointerId: event.pointerId,
      startPanX: this._panX,
      startPanY: this._panY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      scaleX,
      scaleY
    };
    this._panCaptureEl = captureEl;
    try {
      captureEl?.setPointerCapture?.(event.pointerId);
    } catch {
      this._panCaptureEl = null;
    }
    this.classList.add("is-panning");
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.innerHTML = MAP_TEMPLATE;
    this._panSurface = this.querySelector(".whatimado-map__pan-surface");
    this._svg = this.querySelector(".whatimado-map__svg");
    this._panLayer = this.querySelector(".whatimado-map__pan");
    this._ghostLayer = this.querySelector(".whatimado-map__layer--ghost");
    this._liveLayer = this.querySelector(".whatimado-map__layer--live");
    this._youBtn = this.querySelector(".whatimado-map__you-btn");
    const mapBrand = /** @type {{ youButtonAriaLabel?: string }|undefined} */ (
      getBrand()?.map
    );
    if (this._youBtn && mapBrand?.youButtonAriaLabel) {
      this._youBtn.setAttribute("aria-label", mapBrand.youButtonAriaLabel);
    }
    if (this._svg) {
      this._svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
    }
    this._youBtn?.addEventListener("click", () => this.resetToYou());
    this._linkBtn = this.querySelector(".whatimado-map__link-btn");
    this._syncLinkButton();
    this._linkBtn?.addEventListener("click", () => this._toggleFocusLink());
    this.querySelector(".whatimado-map__new-roadmap")?.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("map-new-roadmap", { bubbles: true }));
    });
    this._applyPanTransform();
    this._panSurface?.addEventListener("touchstart", this._onPinchTouchStart, { passive: false });
    this._panSurface?.addEventListener("touchmove", this._onPinchTouchMove, { passive: false });
    this._panSurface?.addEventListener("touchend", this._onPinchTouchEnd, { passive: false });
    this._panSurface?.addEventListener("touchcancel", this._onPinchTouchEnd, { passive: false });
    this.addEventListener("pointermove", this._onPointerMove);
    this.addEventListener("pointerup", this._onPointerUp);
    this.addEventListener("pointercancel", this._onPointerUp);
  }

  /**
   * Drive path-node hover from screen geometry so pan-surface / frame stacking
   * cannot swallow :hover / pointerenter.
   * @param {PointerEvent|MouseEvent} event
   */
  _handleHoverPointerMove(event) {
    if ("pointerType" in event && event.pointerType === "touch") return;
    if (document.body.classList.contains("is-frame-dragging") || this._panPointer || this._pinch) {
      if (this._hoverNodeId) this.setNodeHover(null);
      return;
    }
    this._lastHoverClient.x = event.clientX;
    this._lastHoverClient.y = event.clientY;
    if (this._hoverRaf !== null) return;
    this._hoverRaf = requestAnimationFrame(() => {
      this._hoverRaf = null;
      this._syncNodeHover(this._lastHoverClient.x, this._lastHoverClient.y);
    });
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  _syncNodeHover(clientX, clientY) {
    /** Pulling a node apart keeps it lit — the glow rides the drag and the spring back */
    if (this._pointer) {
      this.setNodeHover(this._pointer.nodeId);
      return;
    }
    if (this._panPointer || this._pinch) {
      if (this._hoverNodeId) this.setNodeHover(null);
      return;
    }
    if (this.getAttribute("mode") === "hidden") {
      if (this._hoverNodeId) this.setNodeHover(null);
      return;
    }

    const id = this._hitTestHoverNodeId(clientX, clientY);
    this.setNodeHover(id);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {string|null}
   */
  _hitTestHoverNodeId(clientX, clientY) {
    const top = document.elementFromPoint(clientX, clientY);
    if (top instanceof Element) {
      if (
        top.closest(".v2-rail") ||
        top.closest(".v2-mobile-menu-btn") ||
        top.closest(".v2-mobile-menu-backdrop") ||
        top.closest(".whatimado-map__you-btn") ||
        top.closest(".whatimado-map__link-btn") ||
        top.closest("input, textarea, button, a, select, label")
      ) {
        return null;
      }
    }

    /** @type {string|null} */
    let bestId = null;
    let bestDist = Infinity;

    for (const [id, drift] of this._driftNodes) {
      const graphNode = this._liveNodes.find((entry) => entry.id === id);
      if (!graphNode || graphNode.type === "start") continue;

      const hit =
        drift.groupEl.querySelector(".whatimado-map__node-hit") ??
        drift.circleEl;
      if (!hit) continue;

      const rect = hit.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const cx = (rect.left + rect.right) / 2;
      const cy = (rect.top + rect.bottom) / 2;
      const radius = Math.max(rect.width, rect.height) / 2 + 8;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (dist > radius) continue;

      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  _clientToSvg(clientX, clientY) {
    return clientToSvg(this, clientX, clientY);
  }

  _applyMode() {
    const mode = this.getAttribute("mode") || "hidden";
    this.dataset.mode = mode;
    const hidden = mode === "hidden";
    this.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  _stopDriftLoop() {
    if (this._driftFrame !== null) {
      cancelAnimationFrame(this._driftFrame);
      this._driftFrame = null;
    }
  }

  _refreshDrift() {
    this._driftNodes.clear();
    this._driftEdges = [];

    this.querySelectorAll(".whatimado-map__node--live").forEach((groupEl, index) => {
      const id = groupEl.getAttribute("data-node-id");
      const circle = groupEl.querySelector(".whatimado-map__node-body");
      const aura = groupEl.querySelector(".whatimado-map__node-aura");
      const hit = groupEl.querySelector(".whatimado-map__node-hit");
      const text = groupEl.querySelector("text");
      if (!id || !circle) return;

      const baseX = parseFloat(circle.getAttribute("cx") || "0");
      const baseY = parseFloat(circle.getAttribute("cy") || "0");
      const radius = parseFloat(circle.getAttribute("r") || "6");
      const delay = parseFloat(groupEl.getAttribute("data-drift-delay") ?? String((index * 0.85) % 5));
      const duration = parseFloat(groupEl.getAttribute("data-drift-duration") ?? "11");

      this._driftNodes.set(id, {
        baseX,
        baseY,
        radius,
        originX: baseX,
        originY: baseY,
        delay,
        duration,
        dragX: 0,
        dragY: 0,
        glideVx: 0,
        glideVy: 0,
        homeVx: 0,
        homeVy: 0,
        driftAnchorX: 0,
        driftAnchorY: 0,
        groupEl: /** @type {SVGGElement} */ (groupEl),
        circleEl: /** @type {SVGCircleElement} */ (circle),
        auraEl: aura ? /** @type {SVGCircleElement} */ (aura) : null,
        hitEl: hit ? /** @type {SVGCircleElement} */ (hit) : null,
        textEl: text ? /** @type {SVGTextElement} */ (text) : null
      });
    });

    this.querySelectorAll(".whatimado-map__edge").forEach((lineEl) => {
      const fromId = lineEl.getAttribute("data-from");
      const toId = lineEl.getAttribute("data-to");
      if (!fromId || !toId) return;
      this._driftEdges.push({
        lineEl: /** @type {SVGLineElement} */ (lineEl),
        fromId,
        toId
      });
    });

    this._driftStartMs = performance.now();
    this._stopDriftLoop();
    if (this._driftNodes.size > 0) {
      this._driftFrame = requestAnimationFrame((t) => this._tickDrift(t));
    }
  }

  /** Bake ambient drift into base coords; record anchor so transform stays continuous */
  _commitDriftToBase(nodeId) {
    const node = this._driftNodes.get(nodeId);
    if (!node || this._driftReducedMotion) return;

    const elapsed = performance.now() - this._driftStartMs;
    const drift = driftOffset(elapsed, node.delay, node.duration);

    node.driftAnchorX = drift.x;
    node.driftAnchorY = drift.y;
    node.baseX += drift.x;
    node.baseY += drift.y;
    this._syncNodePosition(node);

    const graphNode = this._liveNodes.find((n) => n.id === nodeId);
    if (graphNode) {
      graphNode.x = node.baseX / VIEW_W;
      graphNode.y = node.baseY / VIEW_H;
    }
  }

  /**
   * @param {number} elapsed
   * @param {typeof this._driftNodes extends Map<string, infer N> ? N : never} node
   */
  _driftTransform(elapsed, node) {
    if (this._driftReducedMotion) return { x: 0, y: 0 };
    const drift = driftOffset(elapsed, node.delay, node.duration);
    return {
      x: drift.x - node.driftAnchorX,
      y: drift.y - node.driftAnchorY
    };
  }

  /** @param {string} nodeId */
  _syncGraphNode(nodeId) {
    const node = this._driftNodes.get(nodeId);
    const graphNode = this._liveNodes.find((n) => n.id === nodeId);
    if (!node || !graphNode) return;
    graphNode.x = node.baseX / VIEW_W;
    graphNode.y = node.baseY / VIEW_H;
  }

  /**
   * Ease an out-of-frame node back into the visible map band.
   * @param {typeof this._driftNodes extends Map<string, infer N> ? N : never} node
   * @param {number} ox
   * @param {number} oy
   * @returns {boolean}
   */
  _applyBoundsRecovery(node, ox, oy) {
    const { minX, maxX, minY, maxY } = getMapBounds();
    const cx = node.baseX + ox;
    const cy = node.baseY + oy;
    let nx = node.baseX;
    let ny = node.baseY;
    let adjusted = false;

    if (cx < minX) {
      nx += (minX - cx) * BOUND_PULL;
      if (node.glideVx < 0) node.glideVx *= BOUND_GLIDE_DAMP;
      adjusted = true;
    } else if (cx > maxX) {
      nx += (maxX - cx) * BOUND_PULL;
      if (node.glideVx > 0) node.glideVx *= BOUND_GLIDE_DAMP;
      adjusted = true;
    }

    if (cy < minY) {
      ny += (minY - cy) * BOUND_PULL;
      if (node.glideVy < 0) node.glideVy *= BOUND_GLIDE_DAMP;
      adjusted = true;
    } else if (cy > maxY) {
      ny += (maxY - cy) * BOUND_PULL;
      if (node.glideVy > 0) node.glideVy *= BOUND_GLIDE_DAMP;
      adjusted = true;
    }

    if (!adjusted) return false;

    node.baseX = nx;
    node.baseY = ny;
    this._syncNodePosition(node);
    return true;
  }

  /**
   * Spring a node back toward its layout home when pulled too far.
   * @param {typeof this._driftNodes extends Map<string, infer N> ? N : never} node
   * @returns {boolean}
   */
  _applyHomeSpring(node) {
    const dx = node.originX - node.baseX;
    const dy = node.originY - node.baseY;
    const dist = Math.hypot(dx, dy);
    const speed = Math.hypot(node.homeVx, node.homeVy);

    if (dist < HOME_SETTLE_DIST && speed < HOME_SETTLE_SPEED) {
      node.baseX = node.originX;
      node.baseY = node.originY;
      node.homeVx = 0;
      node.homeVy = 0;
      this._syncNodePosition(node);
      return true;
    }

    if (dist <= HOME_SOFT_RADIUS && speed < HOME_SETTLE_SPEED * 0.45) {
      return false;
    }

    const pull =
      dist > HOME_SOFT_RADIUS
        ? HOME_SPRING_K * (1 + Math.min((dist - HOME_SOFT_RADIUS) * 0.009, 0.85))
        : HOME_SPRING_K * (0.5 + (1 - dist / HOME_SOFT_RADIUS) * 0.18);

    const nearT = dist < HOME_SOFT_RADIUS ? 1 - dist / HOME_SOFT_RADIUS : 0;
    const damp = HOME_SPRING_DAMP - nearT * (HOME_SPRING_DAMP - HOME_SPRING_DAMP_SETTLE);

    node.homeVx += dx * pull;
    node.homeVy += dy * pull;
    node.homeVx *= damp;
    node.homeVy *= damp;
    node.baseX += node.homeVx;
    node.baseY += node.homeVy;
    node.glideVx *= 0.92;
    node.glideVy *= 0.92;
    this._syncNodePosition(node);
    return true;
  }

  /** @param {typeof this._driftNodes extends Map<string, infer N> ? N : never} node */
  _syncNodePosition(node) {
    node.circleEl.setAttribute("cx", String(node.baseX));
    node.circleEl.setAttribute("cy", String(node.baseY));
    if (node.hitEl) {
      node.hitEl.setAttribute("cx", String(node.baseX));
      node.hitEl.setAttribute("cy", String(node.baseY));
    }
    if (node.auraEl) {
      node.auraEl.setAttribute("cx", String(node.baseX));
      node.auraEl.setAttribute("cy", String(node.baseY));
    }
    if (node.textEl) {
      node.textEl.setAttribute("x", String(node.baseX));
      node.textEl.setAttribute("y", String(node.baseY - node.radius - 6));
    }
  }

  /**
   * Line endpoints follow the painted node (JS drift + CSS idle float), not the
   * un-floated layout center. Hit pad stays put so drag targets do not bob.
   * @param {typeof this._driftNodes extends Map<string, infer N> ? N : never} node
   * @param {number} ox
   * @param {number} oy
   * @param {number} fallbackR
   */
  _visualCenterForEdge(node, ox, oy, fallbackR) {
    const x = node.baseX + ox;
    const y = node.baseY + oy;
    const body = node.circleEl;
    const hit = node.hitEl ?? body;
    if (!body || !hit) return { x, y, r: fallbackR };

    const bodyRect = body.getBoundingClientRect();
    const hitRect = hit.getBoundingClientRect();
    if (bodyRect.width <= 0 || hitRect.width <= 0) return { x, y, r: fallbackR };

    const scale = svgScale(this._svg);
    return {
      x: x + ((bodyRect.left + bodyRect.right) / 2 - (hitRect.left + hitRect.right) / 2) * scale,
      y: y + ((bodyRect.top + bodyRect.bottom) / 2 - (hitRect.top + hitRect.bottom) / 2) * scale,
      r: Math.max(fallbackR * 0.45, (Math.max(bodyRect.width, bodyRect.height) / 2) * scale)
    };
  }

  /** @param {number} timestamp */
  _tickDrift(timestamp) {
    if (!this._driftStartMs) this._driftStartMs = timestamp;
    const elapsed = timestamp - this._driftStartMs;
    const { lg: trimRadius } = getNodeRadii();
    /** @type {Map<string, { x: number, y: number, r: number }>} */
    const centers = new Map();

    for (const [id, node] of this._driftNodes) {
      const isDragging = this._pointer?.nodeId === id;
      const isGliding = Math.hypot(node.glideVx, node.glideVy) > GLIDE_MIN_SPEED;
      const drift = this._driftTransform(elapsed, node);
      let ox = drift.x;
      let oy = drift.y;

      if (isDragging) {
        ox = node.dragX + drift.x;
        oy = node.dragY + drift.y;
      } else if (isGliding) {
        node.baseX += node.glideVx;
        node.baseY += node.glideVy;
        node.glideVx *= GLIDE_FRICTION;
        node.glideVy *= GLIDE_FRICTION;
        this._syncNodePosition(node);

        const graphNode = this._liveNodes.find((n) => n.id === id);
        if (graphNode) {
          graphNode.x = node.baseX / VIEW_W;
          graphNode.y = node.baseY / VIEW_H;
        }
      } else {
        node.glideVx = 0;
        node.glideVy = 0;
      }

      if (!isDragging) {
        const homeAdjusted = this._applyHomeSpring(node);
        if (homeAdjusted) {
          this._syncGraphNode(id);
        }
      }

      if (!isDragging && this._applyBoundsRecovery(node, ox, oy)) {
        this._syncGraphNode(id);
      }

      node.groupEl.setAttribute("transform", `translate(${ox}, ${oy})`);
      centers.set(id, this._visualCenterForEdge(node, ox, oy, trimRadius));
    }

    for (const edge of this._driftEdges) {
      const a = centers.get(edge.fromId);
      const b = centers.get(edge.toId);
      if (!a || !b) continue;

      const trimmed = trimLineToNodeEdges(a.x, a.y, a.r, b.x, b.y, b.r);
      edge.lineEl.setAttribute("x1", String(trimmed.x1));
      edge.lineEl.setAttribute("y1", String(trimmed.y1));
      edge.lineEl.setAttribute("x2", String(trimmed.x2));
      edge.lineEl.setAttribute("y2", String(trimmed.y2));
    }

    this._driftFrame = requestAnimationFrame((t) => this._tickDrift(t));
  }

  _applyAnchorStyles() {
    for (const [id, node] of this._driftNodes) {
      const isLayoutAnchor = id === this._anchorId;
      const graphNode = this._liveNodes.find((n) => n.id === id);
      const isStart = graphNode?.type === "start";
      const isSelected = id === this._selectedId;

      const group = node.groupEl;
      group.classList.toggle("is-anchor", isLayoutAnchor);
      group.classList.toggle("is-support", !isSelected);
      group.classList.toggle("is-primary", isLayoutAnchor);
      group.classList.toggle("is-start", Boolean(isStart));
      group.classList.toggle("is-roadmap", graphNode?.type === "path");
      group.classList.toggle("is-mission", graphNode?.type === "mission");
      group.classList.toggle("is-task", graphNode?.type === "task");
      group.classList.toggle("is-more", graphNode?.type === "more");
      group.classList.toggle("is-complete", Boolean(graphNode?.done));
      group.classList.toggle("is-selected", isSelected);
    }
  }

  /**
   * @param {PointerEvent} event
   * @param {string} nodeId
   */
  _onNodePointerDown(event, nodeId) {
    if (event.button !== 0) return;

    const driftNode = this._driftNodes.get(nodeId);
    if (!driftNode) return;

    event.preventDefault();
    event.stopPropagation();
    driftNode.groupEl.setPointerCapture(event.pointerId);

    this._commitDriftToBase(nodeId);

    const pt = this._clientToSvg(event.clientX, event.clientY);

    driftNode.dragX = 0;
    driftNode.dragY = 0;
    driftNode.glideVx = 0;
    driftNode.glideVy = 0;
    driftNode.groupEl.classList.add("is-dragging");

    this._pointer = {
      nodeId,
      pointerId: event.pointerId,
      startSvgX: pt.x,
      startSvgY: pt.y,
      startBaseX: driftNode.baseX,
      startBaseY: driftNode.baseY,
      moved: false,
      prevX: pt.x,
      prevY: pt.y,
      velX: 0,
      velY: 0
    };
  }

  /** @param {PointerEvent} event */
  _handlePointerMove(event) {
    if (this._panPointer && event.pointerId === this._panPointer.pointerId) {
      this._handlePanMove(event);
      return;
    }

    if (!this._pointer || event.pointerId !== this._pointer.pointerId) return;

    const driftNode = this._driftNodes.get(this._pointer.nodeId);
    if (!driftNode) return;

    const pt = this._clientToSvg(event.clientX, event.clientY);
    const dx = pt.x - this._pointer.startSvgX;
    const dy = pt.y - this._pointer.startSvgY;

    if (Math.hypot(dx, dy) > 4) {
      this._pointer.moved = true;
    }

    driftNode.dragX = dx;
    driftNode.dragY = dy;

    this._pointer.velX = pt.x - this._pointer.prevX;
    this._pointer.velY = pt.y - this._pointer.prevY;
    this._pointer.prevX = pt.x;
    this._pointer.prevY = pt.y;
  }

  /** @param {PointerEvent} event */
  _handlePointerUp(event) {
    if (this._panPointer && event.pointerId === this._panPointer.pointerId) {
      this._handlePanUp(event);
      return;
    }

    if (!this._pointer || event.pointerId !== this._pointer.pointerId) return;

    const { nodeId, moved, startBaseX, startBaseY } = this._pointer;
    const driftNode = this._driftNodes.get(nodeId);

    if (driftNode) {
      if (moved) {
        driftNode.baseX = startBaseX + driftNode.dragX;
        driftNode.baseY = startBaseY + driftNode.dragY;
        driftNode.dragX = 0;
        driftNode.dragY = 0;

        const distFromHome = Math.hypot(
          driftNode.baseX - driftNode.originX,
          driftNode.baseY - driftNode.originY
        );

        if (distFromHome > HOME_SOFT_RADIUS) {
          driftNode.glideVx = 0;
          driftNode.glideVy = 0;
          if (distFromHome > 0.5) {
            const nx = (driftNode.originX - driftNode.baseX) / distFromHome;
            const ny = (driftNode.originY - driftNode.baseY) / distFromHome;
            const kick = Math.min(HOME_RETURN_KICK_MAX, distFromHome * HOME_RETURN_KICK);
            driftNode.homeVx = nx * kick;
            driftNode.homeVy = ny * kick;
          }
        } else {
          let vx = this._pointer.velX * GLIDE_VEL_SCALE;
          let vy = this._pointer.velY * GLIDE_VEL_SCALE;
          const speed = Math.hypot(vx, vy);
          if (speed > GLIDE_MAX_SPEED) {
            vx = (vx / speed) * GLIDE_MAX_SPEED;
            vy = (vy / speed) * GLIDE_MAX_SPEED;
          }
          driftNode.glideVx = vx;
          driftNode.glideVy = vy;
        }

        this._syncNodePosition(driftNode);

        /*
         * The drag offset has just moved from the group transform into baseX/baseY.
         * Collapse the transform to drift-only now instead of waiting for the next
         * drift tick, so the node does not render (and hit-test) at double offset
         * for a frame.
         */
        const elapsed = performance.now() - this._driftStartMs;
        const drift = this._driftTransform(elapsed, driftNode);
        driftNode.groupEl.setAttribute("transform", `translate(${drift.x}, ${drift.y})`);

        this._syncGraphNode(nodeId);
      } else {
        driftNode.dragX = 0;
        driftNode.dragY = 0;
        this._handleNodeClick(nodeId);
      }

      try {
        driftNode.groupEl.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
      driftNode.groupEl.classList.remove("is-dragging");
    }

    this._pointer = null;
    /** Re-test under a stationary cursor so the glow does not wait for the next move */
    if (event.pointerType !== "touch") {
      this._lastHoverClient.x = event.clientX;
      this._lastHoverClient.y = event.clientY;
      this._syncNodeHover(event.clientX, event.clientY);
    } else {
      this.setNodeHover(null);
    }
  }

  /** @param {PointerEvent} event */
  _handlePanMove(event) {
    if (!this._panPointer || event.pointerId !== this._panPointer.pointerId) return;
    if (document.body.classList.contains("is-frame-dragging")) {
      this.cancelPanFromFrameDrag();
      return;
    }

    this._panPendingClientX = event.clientX;
    this._panPendingClientY = event.clientY;
    this._panSamples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    if (this._panSamples.length > 8) this._panSamples.shift();

    if (this._panMoveRaf !== null) return;
    this._panMoveRaf = requestAnimationFrame(() => {
      this._panMoveRaf = null;
      this._flushPanMove();
    });
  }

  _flushPanMove() {
    const pointer = this._panPointer;
    if (!pointer) return;

    const dx = (this._panPendingClientX - pointer.startClientX) * pointer.scaleX;
    const dy = (this._panPendingClientY - pointer.startClientY) * pointer.scaleY;
    this._panX = pointer.startPanX + dx;
    this._panY = pointer.startPanY + dy;
    this._applyPanTransform();
  }

  /** @param {PointerEvent} event */
  _handlePanUp(event) {
    this._finishPanPointer(event);
  }

  /** @param {string} nodeId */
  _handleNodeClick(nodeId) {
    const node = this._liveNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const promptEmpty = this._promptEmptyChecker?.() ?? true;

    this.dispatchEvent(
      new CustomEvent("map-node-select", {
        bubbles: true,
        detail: { nodeId, node, promptEmpty }
      })
    );

    if (!promptEmpty && node.type !== "start") {
      this._selectedId = nodeId;
      this._applyAnchorStyles();
      this._onSelect?.(nodeId);
    }
  }

  /** @param {SVGGElement} layer */
  _bindNodeInteractions(layer) {
    layer.querySelectorAll('.whatimado-map__node[data-layer="live"]').forEach((el) => {
      const id = el.getAttribute("data-node-id");
      if (!id) return;

      el.addEventListener("pointerdown", (event) => this._onNodePointerDown(event, id));
    });
  }

  /**
   * @param {SVGGElement|null} layer
   * @param {GraphNode[]} nodes
   * @param {GraphEdge[]} edges
   * @param {{ layer: "ghost"|"live", edgesOnly?: boolean, nodesOnly?: boolean }} options
   */
  _renderLayer(layer, nodes, edges, options) {
    if (!layer) return;

    const parts = [];
    /** @type {{ isAnchor: boolean, html: string }[]} */
    const nodeParts = [];
    const skipEdges = options.nodesOnly === true;
    const skipNodes = options.edgesOnly === true;

    if (!skipEdges) {
      edges.forEach(({ from, to }) => {
        const a = nodes.find((n) => n.id === from);
        const b = nodes.find((n) => n.id === to);
        if (!a || !b) return;
        const ax = a.x * VIEW_W;
        const ay = a.y * VIEW_H;
        const bx = b.x * VIEW_W;
        const by = b.y * VIEW_H;
        parts.push(
          `<line class="whatimado-map__edge whatimado-map__edge--${options.layer}" data-from="${escapeHtml(from)}" data-to="${escapeHtml(to)}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" />`
        );
      });
    }

    if (!skipNodes) {
      const { lg: radiusLg } = getNodeRadii();
      const nodeR = radiusLg;

      nodes.forEach((node, index) => {
        const cx = node.x * VIEW_W;
        const cy = node.y * VIEW_H;
        const isLayoutAnchor = this._anchorId === node.id;
        const isStart = node.type === "start";
        const isSelected = node.id === this._selectedId;
        const r = nodeR;
        const classes = [
          "whatimado-map__node",
          `whatimado-map__node--${options.layer}`,
          isStart ? "is-start" : "",
          node.type === "path" ? "is-roadmap" : "",
          node.type === "mission" ? "is-mission" : "",
          node.type === "task" ? "is-task" : "",
          node.type === "more" ? "is-more" : "",
          node.done ? "is-complete" : "",
          isLayoutAnchor ? "is-anchor is-primary" : "",
          !isSelected ? "is-support" : "",
          isSelected ? "is-selected" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const driftDelay = (index * 0.85) % 5;
        const driftDuration = 9 + (index % 4) * 1.2;
        const styleVars = [
          node.type === "path" && node.accent ? `--node-accent: ${node.accent}` : "",
          `--node-float-delay: ${(index * 0.65) % 3.4}s`,
          `--node-float-duration: ${3.4 + (index % 4) * 0.55}s`
        ]
          .filter(Boolean)
          .join("; ");

        nodeParts.push({
          isAnchor: isLayoutAnchor,
          html: `
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" data-drift-delay="${driftDelay}" data-drift-duration="${driftDuration}" style="${styleVars}">
          <circle class="whatimado-map__node-hit" cx="${cx}" cy="${cy}" r="${Math.max(r * 2.6, 22)}" />
          <g class="whatimado-map__node-float">
            <circle class="whatimado-map__node-aura" cx="${cx}" cy="${cy}" r="${r + 4}" />
            <circle class="whatimado-map__node-body" cx="${cx}" cy="${cy}" r="${r}" />
            ${labelMarkup(cx, cy, r, node.title || node.label, node.type === "action" || (node.type === "path" && !isSelected) ? "nw" : "")}
          </g>
        </g>
      `
        });
      });

      nodeParts.sort((a, b) => Number(a.isAnchor) - Number(b.isAnchor));
      parts.push(...nodeParts.map((n) => n.html));
    }

    layer.innerHTML = parts.join("");

    if (!skipNodes && options.layer === "live") {
      this._bindNodeInteractions(layer);
    }

    if (options.layer === "live" || options.edgesOnly) {
      this._refreshDrift();
    }

    if (options.layer === "live") {
      this._applyAnchorStyles();
    }

    if (options.layer === "live" && this._pathPreviewId) {
      const previewId = this._pathPreviewId;
      this._pathPreviewId = null;
      this.setPathPreview(previewId);
    }

    if (options.layer === "live" && this._hoverNodeId) {
      const hoverId = this._hoverNodeId;
      this._hoverNodeId = null;
      this.setNodeHover(hoverId);
    }
  }
}

if (!customElements.get("whatimado-map")) {
  customElements.define("whatimado-map", WhatimadoMap);
}
