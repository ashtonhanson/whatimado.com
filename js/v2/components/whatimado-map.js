import { GHOST_GRAPH, graphStore } from "../graph-store.js";

const VIEW_W = 800;
const VIEW_H = 280;

const MAP_TEMPLATE = `
  <div class="whatimado-map__stage">
    <svg class="whatimado-map__svg" part="svg" role="img" aria-label="Possibility map">
      <defs>
        <filter id="whatimado-node-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.5)" />
          <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="rgba(46,232,214,0.4)" />
        </filter>
        <filter id="whatimado-node-shadow-primary" x="-90%" y="-90%" width="280%" height="280%">
          <feDropShadow dx="0" dy="4" stdDeviation="5.5" flood-color="rgba(0,0,0,0.55)" />
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(245,213,71,0.5)" />
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
  }

  disconnectedCallback() {
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!skipEdges) {
      edges.forEach(({ from, to }) => {
        const a = nodes.find((n) => n.id === from);
        const b = nodes.find((n) => n.id === to);
        if (!a || !b) return;
        parts.push(
          `<line class="whatimado-map__edge whatimado-map__edge--${options.layer}" x1="${a.x * VIEW_W}" y1="${a.y * VIEW_H}" x2="${b.x * VIEW_W}" y2="${b.y * VIEW_H}" />`
        );
      });
    }

    if (!skipNodes) {
      nodes.forEach((node, index) => {
        const cx = node.x * VIEW_W;
        const cy = node.y * VIEW_H;
        const isSelected = options.selectedId === node.id;
        const isPrimary = node.type === "start" || isSelected;
        const r = isPrimary ? 17 : 10;
        const shadowFilter = isPrimary ? "url(#whatimado-node-shadow-primary)" : "url(#whatimado-node-shadow)";
        const classes = [
          "whatimado-map__node",
          `whatimado-map__node--${options.layer}`,
          node.type === "start" ? "is-start" : "",
          isSelected ? "is-selected" : "",
          isPrimary ? "is-primary" : "is-support",
          options.ambient ? "is-ambient" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const driftDelay = (index * 0.85) % 5;
        const driftDuration = 12 + (index % 4) * 1.5;
        const driftStyle =
          options.layer === "live" && !reducedMotion
            ? `style="--whatimado-drift-delay:${driftDelay}s;--whatimado-drift-duration:${driftDuration}s"`
            : "";

        nodeParts.push({
          isPrimary,
          html: `
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" ${driftStyle} ${options.interactive ? 'role="button" tabindex="0"' : 'aria-hidden="true"'}>
          <circle cx="${cx}" cy="${cy}" r="${r}" filter="${shadowFilter}" />
          <text x="${cx}" y="${cy - r - 8}" text-anchor="middle">${escapeHtml(node.label)}</text>
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
  }
}

if (!customElements.get("whatimado-map")) {
  customElements.define("whatimado-map", WhatimadoMap);
}
