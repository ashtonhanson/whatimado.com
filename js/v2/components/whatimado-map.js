import { GHOST_GRAPH, graphStore } from "../graph-store.js";

const VIEW_W = 800;
const VIEW_H = 240;

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
  <div class="whatimado-map__stage">
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
        <filter id="whatimado-node-aura" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0" result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
          </feMerge>
        </filter>
      </defs>
      <g class="whatimado-map__layer whatimado-map__layer--ghost"></g>
      <g class="whatimado-map__layer whatimado-map__layer--live"></g>
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
    /** @type {SVGElement|null} */
    this._svg = null;
    /** @type {SVGGElement|null} */
    this._ghostLayer = null;
    /** @type {SVGGElement|null} */
    this._liveLayer = null;
    /** @type {string|null} */
    this._selectedId = null;
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
     *   delay: number, duration: number, groupEl: SVGGElement,
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
     *   moved: boolean
     * }|null} */
    this._pointer = null;

    this._onPointerMove = (event) => this._handlePointerMove(event);
    this._onPointerUp = (event) => this._handlePointerUp(event);
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
  }

  disconnectedCallback() {
    this._stopDriftLoop();
    this._onSelect = null;
    this._promptEmptyChecker = null;
    this.removeEventListener("pointermove", this._onPointerMove);
    this.removeEventListener("pointerup", this._onPointerUp);
    this.removeEventListener("pointercancel", this._onPointerUp);
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
    this._renderLayer(this._ghostLayer, GHOST_GRAPH.nodes, GHOST_GRAPH.edges, {
      layer: "ghost",
      edgesOnly: true
    });
  }

  /** Floating nodes on load — sits above ghost edge backdrop */
  loadAmbientLiveGraph() {
    this._liveNodes = GHOST_GRAPH.nodes;
    this._anchorId = "ghost-start";
    this._renderLayer(this._liveLayer, GHOST_GRAPH.nodes, GHOST_GRAPH.edges, {
      layer: "live",
      nodesOnly: true
    });
  }

  /** @param {GraphNode[]} nodes @param {GraphEdge[]} edges */
  loadLiveGraph(nodes, edges) {
    this._liveNodes = nodes;
    if (!nodes.some((n) => n.id === this._anchorId)) {
      const start = nodes.find((n) => n.type === "start");
      this._anchorId = start?.id ?? nodes[0]?.id ?? this._anchorId;
    }
    this._renderLayer(this._liveLayer, nodes, edges, {
      layer: "live"
    });
  }

  /** Sync live layer from graph-store */
  syncLiveFromStore() {
    this.loadLiveGraph(graphStore.nodes, graphStore.edges);
    if (this._selectedId) {
      this._anchorId = this._selectedId;
      this._applyAnchorStyles();
    }
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
      this._anchorId = id;
      this._applyAnchorStyles();
    }
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

  _build() {
    if (this._built) return;
    this._built = true;
    this.innerHTML = MAP_TEMPLATE;
    this._svg = this.querySelector(".whatimado-map__svg");
    this._ghostLayer = this.querySelector(".whatimado-map__layer--ghost");
    this._liveLayer = this.querySelector(".whatimado-map__layer--live");
    if (this._svg) {
      this._svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);
    }
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
        delay,
        duration,
        dragX: 0,
        dragY: 0,
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

  /** @param {number} timestamp */
  _tickDrift(timestamp) {
    if (!this._driftStartMs) this._driftStartMs = timestamp;
    const elapsed = timestamp - this._driftStartMs;
    /** @type {Map<string, { x: number, y: number, r: number }>} */
    const centers = new Map();

    for (const [id, node] of this._driftNodes) {
      const isDragging = this._pointer?.nodeId === id;
      let ox = 0;
      let oy = 0;

      if (isDragging) {
        ox = node.dragX;
        oy = node.dragY;
      } else if (!this._driftReducedMotion) {
        const drift = driftOffset(elapsed, node.delay, node.duration);
        ox = drift.x;
        oy = drift.y;
      }

      node.groupEl.setAttribute("transform", `translate(${ox}, ${oy})`);
      centers.set(id, {
        x: node.baseX + ox,
        y: node.baseY + oy,
        r: node.radius
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
      const isAnchor = id === this._anchorId;
      const graphNode = this._liveNodes.find((n) => n.id === id);
      const isStart = graphNode?.type === "start";

      const group = node.groupEl;
      group.classList.toggle("is-anchor", isAnchor);
      group.classList.toggle("is-support", !isAnchor);
      group.classList.toggle("is-primary", isAnchor);
      group.classList.toggle("is-start", Boolean(isStart));
      group.classList.toggle("is-selected", id === this._selectedId);
    }
  }

  /**
   * @param {SVGGElement} groupEl
   * @param {number} cx
   * @param {number} cy
   * @param {number} baseR
   * @param {boolean} isAnchor
   */
  _playRipple(groupEl, cx, cy, baseR, isAnchor) {
    const ripple = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ripple.setAttribute("class", `whatimado-map__ripple${isAnchor ? " is-anchor" : ""}`);
    ripple.setAttribute("cx", String(cx));
    ripple.setAttribute("cy", String(cy));
    ripple.setAttribute("r", String(baseR));
    groupEl.insertBefore(ripple, groupEl.firstChild);

    const cleanup = () => ripple.remove();
    ripple.addEventListener("animationend", cleanup, { once: true });
    window.setTimeout(cleanup, 620);
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
    driftNode.groupEl.setPointerCapture(event.pointerId);

    const pt = this._clientToSvg(event.clientX, event.clientY);
    this._pointer = {
      nodeId,
      pointerId: event.pointerId,
      startSvgX: pt.x,
      startSvgY: pt.y,
      startBaseX: driftNode.baseX,
      startBaseY: driftNode.baseY,
      moved: false
    };

    driftNode.dragX = 0;
    driftNode.dragY = 0;
    driftNode.groupEl.classList.add("is-dragging");
  }

  /** @param {PointerEvent} event */
  _handlePointerMove(event) {
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
  }

  /** @param {PointerEvent} event */
  _handlePointerUp(event) {
    if (!this._pointer || event.pointerId !== this._pointer.pointerId) return;

    const { nodeId, moved, startBaseX, startBaseY } = this._pointer;
    const driftNode = this._driftNodes.get(nodeId);

    if (driftNode) {
      if (moved) {
        driftNode.baseX = startBaseX + driftNode.dragX;
        driftNode.baseY = startBaseY + driftNode.dragY;
        driftNode.dragX = 0;
        driftNode.dragY = 0;

        driftNode.circleEl.setAttribute("cx", String(driftNode.baseX));
        driftNode.circleEl.setAttribute("cy", String(driftNode.baseY));
        if (driftNode.auraEl) {
          driftNode.auraEl.setAttribute("cx", String(driftNode.baseX));
          driftNode.auraEl.setAttribute("cy", String(driftNode.baseY));
        }
        if (driftNode.textEl) {
          driftNode.textEl.setAttribute("x", String(driftNode.baseX));
          driftNode.textEl.setAttribute("y", String(driftNode.baseY - driftNode.radius - 6));
        }

        const graphNode = this._liveNodes.find((n) => n.id === nodeId);
        if (graphNode) {
          graphNode.x = driftNode.baseX / VIEW_W;
          graphNode.y = driftNode.baseY / VIEW_H;
        }
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

  /** @param {string} nodeId */
  _handleNodeClick(nodeId) {
    const node = this._liveNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const driftNode = this._driftNodes.get(nodeId);
    if (driftNode) {
      this._playRipple(
        driftNode.groupEl,
        driftNode.baseX,
        driftNode.baseY,
        driftNode.radius,
        nodeId === this._anchorId
      );
    }

    this._anchorId = nodeId;
    this._applyAnchorStyles();

    const promptEmpty = this._promptEmptyChecker?.() ?? true;

    this.dispatchEvent(
      new CustomEvent("map-node-select", {
        bubbles: true,
        detail: { nodeId, node, promptEmpty }
      })
    );

    if (!promptEmpty) {
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
        const isAnchor = this._anchorId === node.id;
        const isStart = node.type === "start";
        const r = nodeR;
        const classes = [
          "whatimado-map__node",
          `whatimado-map__node--${options.layer}`,
          isStart ? "is-start" : "",
          isAnchor ? "is-anchor is-primary" : "is-support",
          node.id === this._selectedId ? "is-selected" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const driftDelay = (index * 0.85) % 5;
        const driftDuration = 9 + (index % 4) * 1.2;

        nodeParts.push({
          isAnchor,
          html: `
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" data-drift-delay="${driftDelay}" data-drift-duration="${driftDuration}">
          <circle class="whatimado-map__node-aura" cx="${cx}" cy="${cy}" r="${r + 2}" />
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
  }
}

if (!customElements.get("whatimado-map")) {
  customElements.define("whatimado-map", WhatimadoMap);
}
