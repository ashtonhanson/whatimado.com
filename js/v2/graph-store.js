/** @typedef {{ id: string, type: "start"|"path"|"mission"|"task"|"action"|"more", label: string, x: number, y: number, parentId?: string, title?: string, description?: string, accent?: string, ideaType?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string, done?: boolean }} GraphNode */
/** @typedef {{ from: string, to: string }} GraphEdge */
/** @typedef {{ id?: string, label: string, title: string, description?: string, type?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string }} AdvisorPath */
export const graphStore = {
  nodes: [],
  edges: [],
  selectedId: null
};

export function resetGraph() {
  graphStore.nodes = [];
  graphStore.edges = [];
  graphStore.selectedId = null;
}

/** Snapshot for guest persistence. */
export function serializeGraph() {
  return {
    nodes: graphStore.nodes.map((node) => ({ ...node })),
    edges: graphStore.edges.map((edge) => ({ ...edge })),
    selectedId: graphStore.selectedId
  };
}

/** @param {unknown} graph */
export function hydrateGraph(graph) {
  const source = graph && typeof graph === "object" ? /** @type {{ nodes?: unknown, edges?: unknown, selectedId?: unknown }} */ (graph) : {};
  if (!Array.isArray(source.nodes) || source.nodes.length === 0) {
    resetGraph();
    return;
  }
  graphStore.nodes = source.nodes
    .filter((node) => node && typeof node === "object")
    .map((node) => ({ .../** @type {GraphNode} */ (node) }));
  graphStore.edges = Array.isArray(source.edges)
    ? source.edges
        .filter((edge) => edge && typeof edge === "object")
        .map((edge) => ({ .../** @type {GraphEdge} */ (edge) }))
    : [];
  graphStore.selectedId = typeof source.selectedId === "string" ? source.selectedId : null;
}

/** @param {string} id @param {number} index */
function sanitizePathId(id, index) {
  const base = String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `path-${index + 1}`;
}

/** @param {string} value @param {number} max */
function shortenMapLabel(value) {
  return String(value || "").trim();
}

/** HUD hover accents — distinct hues; yellow reserved for selected state */
export const PATH_ACCENT_PALETTE = ["#3df0de", "#2ee8d6", "#1ec9b8", "#5ce0d4"];

/** @param {number} index */
export function pathAccentForIndex(index) {
  return PATH_ACCENT_PALETTE[index % PATH_ACCENT_PALETTE.length];
}

/** Layout slots for up to six path nodes above YOU */
const PATH_LAYOUT_SLOTS = [
  { x: 0.18, y: 0.5 },
  { x: 0.38, y: 0.3 },
  { x: 0.62, y: 0.3 },
  { x: 0.82, y: 0.5 },
  { x: 0.08, y: 0.4 },
  { x: 0.92, y: 0.4 }
];

export const MAX_PATH_NODES = PATH_LAYOUT_SLOTS.length;

/** @param {AdvisorPath} path @param {number} index */
function pathNodeFromAdvisor(path, index) {
  const slot = PATH_LAYOUT_SLOTS[index] ?? PATH_LAYOUT_SLOTS[PATH_LAYOUT_SLOTS.length - 1];
  const title = String(path.title || path.label || `Path ${index + 1}`).trim();
  const tagline = String(path.tagline || path.description || "").trim();
  return {
    id: sanitizePathId(path.id, index),
    type: "path",
    label: shortenMapLabel(path.label || title, 14),
    title,
    description: tagline,
    ideaType: String(path.type || "").trim(),
    tagline,
    why: String(path.why || "").trim(),
    cost: String(path.cost || "").trim(),
    timeline: String(path.timeline || "").trim(),
    income: String(path.income || "").trim(),
    x: slot.x,
    y: slot.y,
    parentId: "start",
    accent: pathAccentForIndex(index)
  };
}

/**
 * Populate live graph from advisor path proposals.
 * @param {AdvisorPath[]} paths
 * @param {{ keepSelectedId?: string | null }} [options]
 */
export function loadAdvisorPaths(paths, options = {}) {
  const trimmed = paths.slice(0, MAX_PATH_NODES);
  /** @type {GraphNode[]} */
  const nodes = [{ id: "start", type: "start", label: "You", x: 0.5, y: 0.82 }];
  /** @type {GraphEdge[]} */
  const edges = [];
  const used = new Set(["start"]);

  trimmed.forEach((path, index) => {
    const node = pathNodeFromAdvisor(path, index);
    let id = node.id;
    if (used.has(id)) id = sanitizePathId(`${id}-${index + 1}`, index);
    used.add(id);
    node.id = id;
    nodes.push(node);
    edges.push({ from: "start", to: id });
  });

  possibilityNodes = null;
  possibilityEdges = null;
  graphStore.nodes = nodes;
  graphStore.edges = edges;
  const keep = options.keepSelectedId;
  graphStore.selectedId = keep && nodes.some((node) => node.id === keep) ? keep : null;
}

/**
 * Append extra path nodes without rebuilding the rest of the map.
 * @param {AdvisorPath[]} paths
 */
export function appendAdvisorPaths(paths) {
  const existingPaths = graphStore.nodes.filter((node) => node.type === "path");
  const startIndex = existingPaths.length;
  const room = MAX_PATH_NODES - startIndex;
  if (room <= 0) return [];

  const used = new Set(graphStore.nodes.map((node) => node.id));
  /** @type {GraphNode[]} */
  const added = [];

  paths.slice(0, room).forEach((path, offset) => {
    const index = startIndex + offset;
    const node = pathNodeFromAdvisor(path, index);
    let id = node.id;
    if (used.has(id)) id = sanitizePathId(`${id}-${index + 1}`, index);
    used.add(id);
    node.id = id;
    graphStore.nodes.push(node);
    graphStore.edges.push({ from: "start", to: id });
    added.push(node);
  });

  return added;
}

/** Placeholder possibility nodes for scaffold demo */
export function seedPossibilityNodes() {
  graphStore.nodes = [
    { id: "start", type: "start", label: "You", x: 0.5, y: 0.82 },
    {
      id: "path-a",
      type: "path",
      label: "Rebuild",
      x: 0.22,
      y: 0.35,
      parentId: "start",
      accent: pathAccentForIndex(0)
    },
    {
      id: "path-b",
      type: "path",
      label: "Train",
      x: 0.5,
      y: 0.2,
      parentId: "start",
      accent: pathAccentForIndex(1)
    },
    {
      id: "path-c",
      type: "path",
      label: "Freelance",
      x: 0.78,
      y: 0.35,
      parentId: "start",
      accent: pathAccentForIndex(2)
    }
  ];
  graphStore.edges = [
    { from: "start", to: "path-a" },
    { from: "start", to: "path-b" },
    { from: "start", to: "path-c" }
  ];
  graphStore.selectedId = null;
}

/** Ambient ghost map — generic roadmap silhouette on first load */
export const GHOST_GRAPH = {
  nodes: [
    { id: "ghost-start", type: "start", label: "You", x: 0.5, y: 0.82 },
    { id: "ghost-stabilize", type: "path", label: "Stabilize", x: 0.16, y: 0.52 },
    { id: "ghost-skills", type: "path", label: "Skills", x: 0.35, y: 0.28 },
    { id: "ghost-train", type: "path", label: "Train", x: 0.65, y: 0.28 },
    { id: "ghost-explore", type: "path", label: "Explore", x: 0.84, y: 0.52 },
    { id: "ghost-mission", type: "mission", label: "Next step", x: 0.5, y: 0.08 }
  ],
  edges: [
    { from: "ghost-start", to: "ghost-stabilize" },
    { from: "ghost-start", to: "ghost-skills" },
    { from: "ghost-start", to: "ghost-train" },
    { from: "ghost-start", to: "ghost-explore" },
    { from: "ghost-skills", to: "ghost-mission" },
    { from: "ghost-train", to: "ghost-mission" }
  ]
};

/** @param {string} id */
export function selectGraphNode(id) {
  graphStore.selectedId = id;
}

/** Possibility constellation, kept while a roadmap branch is on screen. */
let possibilityNodes = null;
let possibilityEdges = null;

export const ROADMAP_MORE_ID = "roadmap-more";

function rememberPossibilities() {
  if (possibilityNodes) return;
  possibilityNodes = graphStore.nodes.map((node) => ({ ...node }));
  possibilityEdges = graphStore.edges.map((edge) => ({ ...edge }));
}

export function restorePossibilityMap() {
  if (!possibilityNodes) return;
  graphStore.nodes = possibilityNodes.map((node) => ({ ...node }));
  graphStore.edges = possibilityEdges.map((edge) => ({ ...edge }));
  possibilityNodes = null;
  possibilityEdges = null;
}

/**
 * Keep the constellation: You at the bottom, paths in an arc above.
 * The + sits just past the chosen path, continuing that same ray, so it stays clear of neighbors.
 * @param {string} pathId
 */
export function showRoadmapBranch(pathId) {
  rememberPossibilities();
  const source = possibilityNodes || graphStore.nodes;
  const paths = source.filter((node) => node.type === "path");
  const path = paths.find((node) => node.id === pathId);
  if (!path) return;

  const start = source.find((node) => node.type === "start");
  const alreadyConstellation = Boolean(start && Math.abs(start.y - 0.82) < 0.08);

  /** @type {GraphNode[]} */
  const nodes = [{ id: "start", type: "start", label: "You", title: "You", x: 0.5, y: 0.82 }];
  /** @type {GraphEdge[]} */
  const edges = [];
  paths.forEach((node, index) => {
    const slot = PATH_LAYOUT_SLOTS[index] ?? PATH_LAYOUT_SLOTS[PATH_LAYOUT_SLOTS.length - 1];
    const placed = {
      ...node,
      x: alreadyConstellation ? node.x : slot.x,
      y: alreadyConstellation ? node.y : slot.y
    };
    nodes.push(placed);
    edges.push({ from: "start", to: placed.id });
  });

  const chosen = nodes.find((node) => node.id === pathId);
  if (chosen) {
    const dx = chosen.x - 0.5;
    const dy = chosen.y - 0.82;
    const len = Math.hypot(dx, dy) || 1;
    const step = 0.1;
    nodes.push({
      id: ROADMAP_MORE_ID,
      type: "more",
      label: "+",
      title: "+",
      x: Math.min(0.94, Math.max(0.06, chosen.x + (dx / len) * step)),
      y: Math.min(0.76, Math.max(0.04, chosen.y + (dy / len) * step))
    });
    edges.push({ from: chosen.id, to: ROADMAP_MORE_ID });
  }

  graphStore.nodes = nodes;
  graphStore.edges = edges;
}
