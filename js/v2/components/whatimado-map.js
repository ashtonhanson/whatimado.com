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
    /** @type {(nodeId: string) => void|null} */
    this._onSelect = null;
    /** @type {number|null} */
    this._driftFrame = null;
    /** @type {number} */
    this._driftStartMs = 0;
    /** @type {boolean} */
    this._driftReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /**
     * @type {Map<string, {
     *   baseX: number, baseY: number, radius: number,
     *   delay: number, duration: number, groupEl: SVGGElement
     * }>}
     */
    this._driftNodes = new Map();
    /** @type {{ lineEl: SVGLineElement, fromId: string, toId: string }[]} */
    this._driftEdges = [];
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
  }

  attributeChangedCallback(name) {
    if (name === "mode") this._applyMode();
  }

  /** @param {(nodeId: string) => void} handler */
  setNodeSelectHandler(handler) {
    this._onSelect = handler;
  }

  loadGhostGraph() {
    this._renderLayer(this._ghostLayer, GHOST_GRAPH.nodes, GHOST_GRAPH.edges, {
      layer: "ghost",
      interactive: false,
      edgesOnly: true
    });
  }

  /** Floating teal/yellow nodes on load — sits above ghost edge backdrop */
  loadAmbientLiveGraph() {
    this._renderLayer(this._liveLayer, GHOST_GRAPH.nodes, GHOST_GRAPH.edges, {
      layer: "live",
      interactive: false,
      selectedId: "ghost-start",
      ambient: true,
      nodesOnly: true
    });
  }

  /** @param {GraphNode[]} nodes @param {GraphEdge[]} edges */
  loadLiveGraph(nodes, edges) {
    this._renderLayer(this._liveLayer, nodes, edges, {
      layer: "live",
      interactive: true,
      selectedId: this._selectedId
    });
  }

  /** Sync live layer from graph-store */
  syncLiveFromStore() {
    this.loadLiveGraph(graphStore.nodes, graphStore.edges);
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
    this.syncLiveFromStore();
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
      const circle = groupEl.querySelector("circle");
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
        groupEl: /** @type {SVGGElement} */ (groupEl)
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
      const offset = this._driftReducedMotion
        ? { x: 0, y: 0 }
        : driftOffset(elapsed, node.delay, node.duration);
      node.groupEl.setAttribute("transform", `translate(${offset.x}, ${offset.y})`);
      centers.set(id, {
        x: node.baseX + offset.x,
        y: node.baseY + offset.y,
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

  /**
   * @param {SVGGElement|null} layer
   * @param {GraphNode[]} nodes
   * @param {GraphEdge[]} edges
   * @param {{ layer: "ghost"|"live", interactive?: boolean, selectedId?: string|null, edgesOnly?: boolean, nodesOnly?: boolean, ambient?: boolean }} options
   */
  _renderLayer(layer, nodes, edges, options) {
    if (!layer) return;

    const parts = [];
    /** @type {{ isPrimary: boolean, html: string }[]} */
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
      const { lg: radiusLg, sm: radiusSm } = getNodeRadii();

      nodes.forEach((node, index) => {
        const cx = node.x * VIEW_W;
        const cy = node.y * VIEW_H;
        const isSelected = options.selectedId === node.id;
        const isPrimary = node.type === "start" || isSelected;
        const r = isPrimary ? radiusLg : radiusSm;
        const isStart = node.type === "start";
        const useFilter = options.layer === "live" && !options.ambient && !isStart;
        const shadowFilter = useFilter
          ? isPrimary
            ? "url(#whatimado-node-shadow-primary)"
            : "url(#whatimado-node-shadow)"
          : "none";
        const classes = [
          "whatimado-map__node",
          `whatimado-map__node--${options.layer}`,
          isStart ? "is-start" : "",
          isSelected ? "is-selected" : "",
          isPrimary ? "is-primary" : "is-support",
          options.ambient ? "is-ambient" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const driftDelay = (index * 0.85) % 5;
        const driftDuration = 9 + (index % 4) * 1.2;

        nodeParts.push({
          isPrimary,
          html: `
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" data-drift-delay="${driftDelay}" data-drift-duration="${driftDuration}" ${options.interactive ? 'role="button" tabindex="0"' : 'aria-hidden="true"'}>
          <circle class="whatimado-map__node-body" cx="${cx}" cy="${cy}" r="${r}" ${shadowFilter !== "none" ? `filter="${shadowFilter}"` : ""} />
          <text x="${cx}" y="${cy - r - 6}" text-anchor="middle">${escapeHtml(node.label)}</text>
        </g>
      `
        });
      });

      nodeParts.sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary));
      parts.push(...nodeParts.map((n) => n.html));
    }

    layer.innerHTML = parts.join("");

    if (options.interactive) {
      layer.querySelectorAll('.whatimado-map__node[data-layer="live"]').forEach((el) => {
        const id = el.getAttribute("data-node-id");
        if (!id) return;
        el.addEventListener("click", () => {
          this._selectedId = id;
          this.syncLiveFromStore();
          this.dispatchEvent(
            new CustomEvent("map-node-select", {
              bubbles: true,
              detail: { nodeId: id, node: nodes.find((n) => n.id === id) }
            })
          );
          this._onSelect?.(id);
        });
      });
    }

    if (options.layer === "live" || options.edgesOnly) {
      this._refreshDrift();
    }
  }
}

if (!customElements.get("whatimado-map")) {
  customElements.define("whatimado-map", WhatimadoMap);
}
