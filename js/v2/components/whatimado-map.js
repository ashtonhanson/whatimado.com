import { GHOST_GRAPH, graphStore } from "../graph-store.js";

const VIEW_W = 800;
const VIEW_H = 280;

const MAP_TEMPLATE = `
  <div class="whatimado-map__stage">
    <svg class="whatimado-map__svg" part="svg" role="img" aria-label="Possibility map">
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
    if (!this._ghostDismissed && this._ghostLayer?.childElementCount === 0) {
      this.loadGhostGraph();
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
      interactive: false
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
   * @param {{ layer: "ghost"|"live", interactive?: boolean, selectedId?: string|null }} options
   */
  _renderLayer(layer, nodes, edges, options) {
    if (!layer) return;

    const parts = [];
    edges.forEach(({ from, to }) => {
      const a = nodes.find((n) => n.id === from);
      const b = nodes.find((n) => n.id === to);
      if (!a || !b) return;
      parts.push(
        `<line class="whatimado-map__edge whatimado-map__edge--${options.layer}" x1="${a.x * VIEW_W}" y1="${a.y * VIEW_H}" x2="${b.x * VIEW_W}" y2="${b.y * VIEW_H}" />`
      );
    });

    nodes.forEach((node, index) => {
      const cx = node.x * VIEW_W;
      const cy = node.y * VIEW_H;
      const r = node.type === "start" ? 14 : 11;
      const isSelected = options.selectedId === node.id;
      const classes = [
        "whatimado-map__node",
        `whatimado-map__node--${options.layer}`,
        node.type === "start" ? "is-start" : "",
        isSelected ? "is-selected" : ""
      ]
        .filter(Boolean)
        .join(" ");

      const driftStyle = options.layer === "ghost" ? "" : `--whatimado-drift-delay: ${(index * 0.7) % 4}s`;

      parts.push(`
        <g class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layer="${options.layer}" style="${driftStyle}" ${options.interactive ? 'role="button" tabindex="0"' : 'aria-hidden="true"'}>
          <circle cx="${cx}" cy="${cy}" r="${r}" />
          <text x="${cx}" y="${cy - r - 6}" text-anchor="middle">${escapeHtml(node.label)}</text>
        </g>
      `);
    });

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
