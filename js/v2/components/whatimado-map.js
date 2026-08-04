import { GHOST_GRAPH, graphStore } from "../graph-store.js";

/** Brand map physics — keep aligned with docs/v2-brand-system.md */
const VIEW_W = 800;
const VIEW_H = 240;

/** Post-release glide tuning */
const GLIDE_VEL_SCALE = 0.52;
const GLIDE_FRICTION = 0.905;
const GLIDE_MIN_SPEED = 0.06;
const GLIDE_MAX_SPEED = 14;

/** Map edge recovery — pull nodes back into the visible constellation band */
const BOUND_PAD_X = 22;
const BOUND_PAD_Y = 26;
const BOUND_PULL = 0.1;
const BOUND_GLIDE_DAMP = 0.52;

/** Home anchor — free pull anywhere; spring back to layout vicinity on release */
const HOME_SOFT_RADIUS = 36;
const HOME_SPRING_K = 0.042;
const HOME_SPRING_DAMP = 0.928;
const HOME_SPRING_DAMP_SETTLE = 0.82;
const HOME_SETTLE_DIST = 0.22;
const HOME_SETTLE_SPEED = 0.028;
const HOME_RETURN_KICK = 0.014;
const HOME_RETURN_KICK_MAX = 1.35;

/** Pinch zoom — scale around view center; focal point stays under fingers */
const ZOOM_MIN = 0.72;
const ZOOM_MAX = 2.45;
const SCALE_CENTER_X = VIEW_W / 2;
const SCALE_CENTER_Y = VIEW_H / 2;

/** @returns {{ minX: number, maxX: number, minY: number, maxY: number }} */
function getMapBounds() {
  const { lg } = getNodeRadii();
  const padX = BOUND_PAD_X + lg * 0.35;
  const padTop = BOUND_PAD_Y + lg * 0.55;
  const padBottom = BOUND_PAD_Y + lg * 0.25;
  return {
    minX: padX,
    maxX: VIEW_W - padX,
    minY: padTop,
    maxY: VIEW_H - padBottom
  };
}

/** Label sits above node body — keep in sync with renderNodeLayer text y */
const NODE_LABEL_OFFSET = 6;
const NODE_LABEL_CAP = 11;

/** Read top inset for graph gravity from CSS token (screen px) */
function readGraphTopPadPx() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;height:var(--v2-map-graph-top-pad);width:0;";
  document.documentElement.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px > 0 ? px : 16;
}

/** Prevent upward pan from clipping the topmost node labels */
function clampPanYForTopPad(panY, bounds, stageRect, shiftY) {
  const scaleY = VIEW_H / stageRect.height;
  const topPadSvg = readGraphTopPadPx() * scaleY;
  const panFloor = topPadSvg - bounds.minY - shiftY;
  return Math.max(panY, panFloor);
}

/** Read global upward graph shift from CSS token (fraction of view height) */
function readGraphShiftY() {
  const style = getComputedStyle(document.documentElement);
  const frac = Number.parseFloat(style.getPropertyValue("--v2-map-graph-shift-y")) || 0.15;
  return -frac * VIEW_H;
}

/** SVG units per screen pixel — used for hand-tool canvas panning */
function svgScale(svg) {
  if (!svg) return 1;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return 1;
  return VIEW_W / rect.width;
}

/** Read node radii from CSS tokens so sizing stays consistent across breakpoints */
function getNodeRadii() {
  const style = getComputedStyle(document.documentElement);
  const lg = parseFloat(style.getPropertyValue("--v2-map-node-lg")) || 8.5;
  const sm = parseFloat(style.getPropertyValue("--v2-map-node-sm")) || 6.4;
  return { lg, sm };
}

/** @param {number} t */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Drift offset matching the visual keyframe path (calm, noticeable hover).
 * @param {number} elapsedMs
 * @param {number} delaySec
 * @param {number} durationSec
 */
function driftOffset(elapsedMs, delaySec, durationSec) {
  const elapsedSec = elapsedMs / 1000;
  const local = (((elapsedSec - delaySec) % durationSec) + durationSec) % durationSec / durationSec;
  const keys = [
    [0, 0, 0],
    [0.33, 6, -7],
    [0.66, -5, 6],
    [1, 0, 0]
  ];

  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, x0, y0] = keys[i];
    const [t1, x1, y1] = keys[i + 1];
    if (local >= t0 && local <= t1) {
      const segment = (local - t0) / (t1 - t0);
      const eased = easeInOut(segment);
      return {
        x: x0 + (x1 - x0) * eased,
        y: y0 + (y1 - y0) * eased
      };
    }
  }

  return { x: 0, y: 0 };
}

/**
 * Trim line to circle edges while using center coords as source of truth.
 * @param {number} ax @param {number} ay @param {number} ar
 * @param {number} bx @param {number} by @param {number} br
 */
function trimLineToNodeEdges(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len <= ar + br) {
    return { x1: ax, y1: ay, x2: bx, y2: by };
  }
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: ax + ux * ar,
    y1: ay + uy * ar,
    x2: bx - ux * br,
    y2: by - uy * br
  };
}

const MAP_TEMPLATE = `
  <div class="whatimado-map__pan-surface" part="pan-surface" aria-hidden="true"></div>
  <div class="whatimado-map__stage">
    <button type="button" class="whatimado-map__you-btn" part="you-reset" aria-label="Center on You">YOU</button>
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

/** @param {string} value */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
    /** @type {{ pointerId: number, startPanX: number, startPanY: number, startClientX: number, startClientY: number }|null} */
    this._panPointer = null;
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
    /** @type {import("../graph-store.js").GraphNode[]} */
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
     *   circleEl: SVGCircleElement, auraEl: SVGCircleElement|null, textEl: SVGTextElement|null
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
  }

  connectedCallback() {
    if (!this._built) this._build();
    this._applyMode();
    if (this._ghostLayer?.childElementCount === 0) {
      this.loadGhostGraph();
    }
    if (this._liveLayer?.childElementCount === 0) {
      this.loadAmbientLiveGraph();
    }
    this._refreshDrift();
    const isOpen = document.body.dataset.phase === "open";
    this._frameCoupled = isOpen;
    requestAnimationFrame(() => {
      if (isOpen) {
        this.syncFrameGravity({ animate: false });
        return;
      }
      /** Mid-session reload — align once, then freeze */
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
  }

  disconnectedCallback() {
    this._stopDriftLoop();
    this._stopPanGlide();
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

  /** @param {GraphNode[]} nodes @param {GraphEdge[]} edges */
  loadLiveGraph(nodes, edges) {
    this._liveNodes = nodes;
    const start = nodes.find((n) => n.type === "start");
    this._anchorId = start?.id ?? nodes[0]?.id ?? this._anchorId;
    this._renderLayer(this._liveLayer, nodes, edges, {
      layer: "live"
    });
  }

  /** Sync live layer from graph-store */
  syncLiveFromStore() {
    this.loadLiveGraph(graphStore.nodes, graphStore.edges);
    this._applyAnchorStyles();
  }

  /** Fade out ambient ghost (Step B — full personalize in Step D) */
  dismissGhost() {
    if (this._ghostDismissed) return;
    this._ghostDismissed = true;
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
    if (id) {
      this._focalLocked = true;
      this._focalNodeId = id;
      const target = this._computePanForFocalNode(id);
      this._animatePanTo(target.panX, target.panY, true);
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
   * @param {number} scale svg units per pixel
   */
  _computePanReleaseVelocity(samples, scale) {
    if (samples.length < 2) return { vx: 0, vy: 0 };

    const last = samples[samples.length - 1];
    const prev = samples[Math.max(0, samples.length - 4)];
    const dt = last.t - prev.t;
    if (dt <= 0) return { vx: 0, vy: 0 };

    const pxPerMsX = (last.x - prev.x) / dt;
    const pxPerMsY = (last.y - prev.y) / dt;
    const pxPerFrameX = pxPerMsX * (1000 / 60) * scale;
    const pxPerFrameY = pxPerMsY * (1000 / 60) * scale;

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

  /** @returns {{ minX: number, maxX: number, minY: number, maxY: number, cx: number, cy: number }} */
  _getGraphBounds() {
    if (!this._liveNodes.length) {
      return {
        minX: 0,
        maxX: VIEW_W,
        minY: 0,
        maxY: VIEW_H,
        cx: VIEW_W / 2,
        cy: VIEW_H / 2
      };
    }

    const { lg, sm } = getNodeRadii();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of this._liveNodes) {
      const cx = node.x * VIEW_W;
      const cy = node.y * VIEW_H;
      const r = node.type === "start" || node.type === "path" ? lg : sm;
      minX = Math.min(minX, cx - r);
      maxX = Math.max(maxX, cx + r);
      minY = Math.min(minY, cy - r - NODE_LABEL_OFFSET - NODE_LABEL_CAP);
      maxY = Math.max(maxY, cy + r);
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  /** @returns {{ x: number, y: number }|null} */
  _getFrameCenterInSvgCoords() {
    const frame = document.getElementById("dynamic-frame");
    const stage = this.querySelector(".whatimado-map__stage");
    if (!frame || !stage) return null;

    const frameRect = frame.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return null;

    const scaleX = VIEW_W / stageRect.width;
    const scaleY = VIEW_H / stageRect.height;
    const centerScreenX = (frameRect.left + frameRect.right) / 2;
    const centerScreenY = (frameRect.top + frameRect.bottom) / 2;

    return {
      x: (centerScreenX - stageRect.left) * scaleX,
      y: (centerScreenY - stageRect.top) * scaleY
    };
  }

  /** @returns {{ x: number, y: number }|null} */
  _getStageCenterInSvgCoords() {
    const stage = this.querySelector(".whatimado-map__stage");
    if (!stage) return null;

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return null;

    const scaleY = VIEW_H / stageRect.height;
    return {
      x: VIEW_W / 2,
      y: (stageRect.height / 2) * scaleY
    };
  }

  /** @returns {boolean} */
  _isOpenHomePhase() {
    return document.body.dataset.phase === "open";
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeOpenHomeGravityPan() {
    const stage = this.querySelector(".whatimado-map__stage");
    const kicker = document.getElementById("frame-kicker");
    if (!stage) return { panX: 0, panY: 0 };

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

    const bounds = this._getGraphBounds();
    const shiftY = readGraphShiftY();
    const scaleY = VIEW_H / stageRect.height;

    const gapPx = 10;
    const anchorScreenY = kicker
      ? kicker.getBoundingClientRect().top - gapPx
      : stageRect.bottom - gapPx;

    const panY = clampPanYForTopPad(
      (anchorScreenY - stageRect.top) * scaleY - shiftY - bounds.maxY,
      bounds,
      stageRect,
      shiftY
    );
    const panX = VIEW_W / 2 - bounds.cx;

    return { panX, panY };
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeChatFrameGravityPan() {
    const stage = this.querySelector(".whatimado-map__stage");
    const frame = document.getElementById("dynamic-frame");
    if (!stage || !frame) return { panX: 0, panY: 0 };

    const stageRect = stage.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

    const bounds = this._getGraphBounds();
    const shiftY = readGraphShiftY();
    const scaleY = VIEW_H / stageRect.height;
    const gapPx = 12;

    const anchorScreenY = frameRect.top - gapPx;
    const panY = clampPanYForTopPad(
      (anchorScreenY - stageRect.top) * scaleY - shiftY - bounds.maxY,
      bounds,
      stageRect,
      shiftY
    );
    const panX = VIEW_W / 2 - bounds.cx;

    return { panX, panY };
  }

  /**
   * @param {number} frameTopMainPx
   * @returns {{ panX: number, panY: number }}
   */
  _computeChatFrameGravityPanAtMainTop(frameTopMainPx) {
    const stage = this.querySelector(".whatimado-map__stage");
    const main = document.querySelector(".v2-main");
    if (!stage || !main) return { panX: 0, panY: 0 };

    const mainRect = main.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

    const bounds = this._getGraphBounds();
    const shiftY = readGraphShiftY();
    const scaleY = VIEW_H / stageRect.height;
    const gapPx = 12;
    const anchorScreenY = mainRect.top + frameTopMainPx - gapPx;
    const panY = clampPanYForTopPad(
      (anchorScreenY - stageRect.top) * scaleY - shiftY - bounds.maxY,
      bounds,
      stageRect,
      shiftY
    );
    const panX = VIEW_W / 2 - bounds.cx;

    return { panX, panY };
  }

  /** During hero dismiss — map follows projected frame top */
  syncGravityForFrameTop(frameTopMainPx, { animate = false } = {}) {
    if (!this._frameCoupled || (this._focalLocked && !this._focalNodeId)) return;

    const target = this._computeChatFrameGravityPanAtMainTop(frameTopMainPx);
    this._animatePanTo(target.panX, target.panY, animate);
  }

  /** @returns {{ panX: number, panY: number }} */
  _computeDefaultFrameGravityPan() {
    const bounds = this._getGraphBounds();
    const frameCenter = this._getFrameCenterInSvgCoords();
    if (!frameCenter) return { panX: 0, panY: 0 };

    const shiftY = readGraphShiftY();
    return {
      panX: frameCenter.x - bounds.cx,
      panY: frameCenter.y - shiftY - bounds.cy
    };
  }

  /** Frozen default when decoupled — centers graph in map stage */
  _computeDefaultScenePan() {
    const stage = this.querySelector(".whatimado-map__stage");
    const stageCenter = this._getStageCenterInSvgCoords();
    if (!stage || !stageCenter) return { panX: 0, panY: 0 };

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.height <= 0 || stageRect.width <= 0) return { panX: 0, panY: 0 };

    const bounds = this._getGraphBounds();
    const shiftY = readGraphShiftY();
    const panX = VIEW_W / 2 - bounds.cx;
    const panY = clampPanYForTopPad(
      stageCenter.y - shiftY - bounds.cy,
      bounds,
      stageRect,
      shiftY
    );

    return { panX, panY };
  }

  /**
   * @param {string} nodeId
   * @returns {{ panX: number, panY: number }}
   */
  _computePanForFocalNode(nodeId) {
    const node = this._liveNodes.find((entry) => entry.id === nodeId);
    const anchor = this._frameCoupled
      ? this._getFrameCenterInSvgCoords()
      : this._getStageCenterInSvgCoords();
    if (!node || !anchor) {
      return this._frameCoupled ? this._computeDefaultFrameGravityPan() : this._computeDefaultScenePan();
    }

    const shiftY = readGraphShiftY();
    const nodeX = node.x * VIEW_W;
    const nodeY = node.y * VIEW_H;

    return {
      panX: anchor.x - nodeX,
      panY: anchor.y - shiftY - nodeY
    };
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

  /** Align map to hero/frame layout while coupled; no-op once dock has settled. */
  syncFrameGravity({ animate = false } = {}) {
    if (!this._frameCoupled || (this._focalLocked && !this._focalNodeId)) return;

    let target;
    if (this._focalLocked && this._focalNodeId) {
      target = this._computePanForFocalNode(this._focalNodeId);
    } else if (this._isOpenHomePhase()) {
      target = this._computeOpenHomeGravityPan();
    } else {
      target = this._computeChatFrameGravityPan();
    }

    this._animatePanTo(target.panX, target.panY, animate);
  }

  /** Reset pan — follows frame while coupled, stage-centered when locked. */
  resetToYou({ animate = true } = {}) {
    this._focalLocked = false;
    this._focalNodeId = null;
    this._zoom = 1;
    if (this._frameCoupled) {
      this.syncFrameGravity({ animate });
      return;
    }
    const target = this._computeDefaultScenePan();
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
    if (event.touches.length !== 2 || !this._panSurface) return;

    event.preventDefault();
    this._stopPanGlide();
    if (this._panPointer) {
      this._detachGlobalPanListeners();
      this._panPointer = null;
      this._panSamples = [];
      this.classList.remove("is-panning");
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
    if (!this._pinch || event.touches.length < 2) return;

    event.preventDefault();
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
    this._globalPanActive = false;
  }

  /** @param {PointerEvent} event */
  _finishPanPointer(event) {
    if (!this._panPointer || event.pointerId !== this._panPointer.pointerId) return;

    const startPanX = this._panPointer.startPanX;
    const startPanY = this._panPointer.startPanY;

    if (this._globalPanActive) {
      this._detachGlobalPanListeners();
    }

    const scale = svgScale(this._svg);
    const { vx, vy } = this._computePanReleaseVelocity(this._panSamples, scale);
    this._panSamples = [];
    this._panPointer = null;
    this.classList.remove("is-panning");

    if (Math.hypot(this._panX - startPanX, this._panY - startPanY) > 6) {
      this._focalLocked = true;
      this._focalNodeId = null;
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

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".whatimado-map__node")) return;
    if (target.closest(".whatimado-map__you-btn")) return;

    this._beginPanPointer(event);
  }

  /** @param {PointerEvent} event */
  _beginPanPointer(event) {
    event.preventDefault();
    this._stopPanGlide();

    this._globalPanActive = true;
    document.addEventListener("pointermove", this._onGlobalPanMove);
    document.addEventListener("pointerup", this._onGlobalPanUp);
    document.addEventListener("pointercancel", this._onGlobalPanUp);

    this._panSamples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
    this._panPointer = {
      pointerId: event.pointerId,
      startPanX: this._panX,
      startPanY: this._panY,
      startClientX: event.clientX,
      startClientY: event.clientY
    };
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
    if (this._svg) {
      this._svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
    }
    this._youBtn?.addEventListener("click", () => this.resetToYou());
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
   * @param {number} clientX
   * @param {number} clientY
   */
  _clientToSvg(clientX, clientY) {
    if (!this._svg) return { x: 0, y: 0 };
    const pt = this._svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this._svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
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
    if (node.auraEl) {
      node.auraEl.setAttribute("cx", String(node.baseX));
      node.auraEl.setAttribute("cy", String(node.baseY));
    }
    if (node.textEl) {
      node.textEl.setAttribute("x", String(node.baseX));
      node.textEl.setAttribute("y", String(node.baseY - node.radius - 6));
    }
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
      centers.set(id, {
        x: node.baseX + ox,
        y: node.baseY + oy,
        r: trimRadius
      });
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
  }

  /** @param {PointerEvent} event */
  _handlePanMove(event) {
    if (!this._panPointer) return;

    this._panSamples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    if (this._panSamples.length > 8) this._panSamples.shift();

    const scale = svgScale(this._svg);
    const dx = (event.clientX - this._panPointer.startClientX) * scale;
    const dy = (event.clientY - this._panPointer.startClientY) * scale;

    this._panX = this._panPointer.startPanX + dx;
    this._panY = this._panPointer.startPanY + dy;
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
          isLayoutAnchor ? "is-anchor is-primary" : "",
          !isSelected ? "is-support" : "",
          isSelected ? "is-selected" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const driftDelay = (index * 0.85) % 5;
        const driftDuration = 9 + (index % 4) * 1.2;
        const accentAttr =
          node.type === "path" && node.accent
            ? ` style="--node-accent: ${node.accent}"`
            : "";

        nodeParts.push({
          isAnchor: isLayoutAnchor,
          html: `
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" data-drift-delay="${driftDelay}" data-drift-duration="${driftDuration}"${accentAttr}>
          <circle class="whatimado-map__node-aura" cx="${cx}" cy="${cy}" r="${r + 4}" />
          <circle class="whatimado-map__node-body" cx="${cx}" cy="${cy}" r="${r}" />
          <text x="${cx}" y="${cy - r - 6}" text-anchor="middle">${escapeHtml(node.label)}</text>
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
  }
}

if (!customElements.get("whatimado-map")) {
  customElements.define("whatimado-map", WhatimadoMap);
}
