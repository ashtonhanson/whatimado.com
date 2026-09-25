/** @typedef {{ id: string, type: "start"|"path"|"mission"|"task"|"action"|"more", label: string, x: number, y: number, parentId?: string, title?: string, description?: string, accent?: string, ideaType?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string, done?: boolean, homeAngle?: number }} GraphNode */
/** @typedef {{ from: string, to: string }} GraphEdge */
/** @typedef {{ id?: string, label: string, title: string, description?: string, type?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string }} AdvisorPath */
export const graphStore = {
  nodes: [],
  edges: [],
  selectedId: null,
  /** @type {number|undefined} */
  focusRotation: undefined,
  /** @type {{ from: number, to: number, chosenId: string }|null} */
  focusSpin: null
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

/** Compact arc above YOU — short connectors, matching the constellation silhouette. */
const PATH_LAYOUT_SLOTS = [
  { x: 0.28, y: 0.52 },
  { x: 0.39, y: 0.38 },
  { x: 0.5, y: 0.28 },
  { x: 0.61, y: 0.38 },
  { x: 0.72, y: 0.52 },
  { x: 0.5, y: 0.44 }
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
  const nodes = [{ id: "start", type: "start", label: "You", x: 0.5, y: 0.7 }];
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

/** When linked, the selected roadmap is the left-to-right spoke and the map can spin to it. */
export let roadmapFocusLinked = true;

/** @param {boolean} linked */
export function setRoadmapFocusLinked(linked) {
  roadmapFocusLinked = Boolean(linked);
  return roadmapFocusLinked;
}

/** Extra spokes so a single chosen roadmap never collapses into one line. */
const EXPLORE_OPTIONS = [
  { id: "option-settings", label: "Settings" },
  { id: "option-notes", label: "Notes" },
  { id: "option-roadmaps", label: "Roadmaps" }
];

/** You on the left, selected spoke pointing right, in SVG units of the 800×240 map. */
const MAP_W = 800;
const MAP_H = 240;
const YOU_LINKED = { x: 180, y: 188 };
const PATH_REACH = 124;
const PLUS_REACH = 158;
const OPTION_REACH = 72;

/** 1 fits the three-quarter gap. Top and bottom snaps use the larger spread. */
export let mapSpread = 1;

/** @param {number} spread */
export function setMapSpread(spread) {
  mapSpread = Math.max(1, Math.min(1.7, spread));
  return mapSpread;
}

/** @type {Map<string, number>} */
const homeAngles = new Map();

/** Chosen path sits on the short center spoke. Siblings and options fill the arc. */
const BRANCH_SLOTS = [
  { x: 0.5, y: 0.42 },
  { x: 0.32, y: 0.52 },
  { x: 0.68, y: 0.52 },
  { x: 0.24, y: 0.62 },
  { x: 0.76, y: 0.62 }
];

/**
 * @param {string} id
 * @param {number} index
 * @param {number} count
 */
function angleFor(id, index, count) {
  if (!homeAngles.has(id)) {
    homeAngles.set(id, count <= 1 ? 0 : (index / count) * Math.PI * 2);
  }
  return homeAngles.get(id) || 0;
}

/**
 * You sits low in the three-quarter gap. The chosen roadmap runs right.
 * Every other first-ring node leaves You at that same distance, spaced evenly
 * across the upper arc.
 * @param {GraphNode[]} nodes
 * @param {number} rotation
 * @param {string} chosenId
 */
export function placeLinkedBranch(nodes, rotation, chosenId) {
  const spread = mapSpread;
  const reach = PATH_REACH * spread;
  const originX = YOU_LINKED.x;
  const originY = YOU_LINKED.y;
  const satellites = nodes.filter((node) => node.type !== "start" && node.type !== "more" && node.id !== chosenId);

  nodes.forEach((node) => {
    if (node.type === "start") {
      node.x = originX / MAP_W;
      node.y = originY / MAP_H;
      return;
    }
    if (node.id === chosenId) {
      node.x = (originX + Math.cos(rotation) * reach) / MAP_W;
      node.y = (originY + Math.sin(rotation) * reach) / MAP_H;
      return;
    }
    if (node.type === "more") {
      const plus = PLUS_REACH * spread;
      node.x = (originX + Math.cos(rotation) * plus) / MAP_W;
      node.y = (originY + Math.sin(rotation) * plus) / MAP_H;
      return;
    }
    const index = Math.max(0, satellites.findIndex((entry) => entry.id === node.id));
    const count = Math.max(1, satellites.length);
    const t = count === 1 ? 0.5 : index / (count - 1);
    const fan = -Math.PI * (0.78 - t * 0.5);
    const angle = rotation + fan;
    const optionReach = OPTION_REACH * spread;
    node.x = (originX + Math.cos(angle) * optionReach) / MAP_W;
    node.y = (originY + Math.sin(angle) * optionReach) / MAP_H;
  });
}

/** Re-place the linked figure after the prompt frame moves. */
export function relayoutLinkedSpread() {
  if (!roadmapFocusLinked) return false;
  const chosen =
    graphStore.nodes.find((node) => node.type === "path" && node.id === graphStore.selectedId) ||
    graphStore.nodes.find((node) => node.type === "path");
  if (!chosen) return false;
  placeLinkedBranch(graphStore.nodes, graphStore.focusRotation || 0, chosen.id);
  return true;
}

/**
 * Linked: You on the left, selected roadmap to the right, other options around You.
 * Unlinked: the compact constellation, with no spin into that left-to-right focus.
 * @param {string} pathId
 */
export function showRoadmapBranch(pathId) {
  rememberPossibilities();
  const source = possibilityNodes || graphStore.nodes;
  const paths = source.filter((node) => node.type === "path");
  const chosenSource = paths.find((node) => node.id === pathId) || paths[0];
  if (!chosenSource) return;

  /** @type {GraphNode[]} */
  const spokes = [chosenSource];
  paths.forEach((node) => {
    if (node.id !== chosenSource.id) spokes.push(node);
  });
  EXPLORE_OPTIONS.forEach((option) => {
    if (spokes.length >= BRANCH_SLOTS.length) return;
    if (spokes.some((node) => node.id === option.id)) return;
    spokes.push({
      id: option.id,
      type: "action",
      label: option.label,
      title: option.label
    });
  });

  const ordered = [...spokes].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((node, index) => {
    node.homeAngle = angleFor(node.id, index, ordered.length);
  });

  /** @type {GraphNode[]} */
  const nodes = [{ id: "start", type: "start", label: "You", title: "You", x: 0.5, y: 0.76 }];
  /** @type {GraphEdge[]} */
  const edges = [];
  spokes.forEach((node, index) => {
    const slot = BRANCH_SLOTS[index] ?? BRANCH_SLOTS[BRANCH_SLOTS.length - 1];
    nodes.push({ ...node, x: slot.x, y: slot.y });
    edges.push({ from: "start", to: node.id });
  });

  const chosen = nodes.find((node) => node.id === chosenSource.id);
  if (chosen) {
    nodes.push({
      id: ROADMAP_MORE_ID,
      type: "more",
      label: "+",
      title: "+",
      x: chosen.x,
      y: chosen.y - 0.16,
      homeAngle: chosen.homeAngle
    });
    edges.push({ from: chosen.id, to: ROADMAP_MORE_ID });
  }

  const target = 0;
  const from = Number.isFinite(graphStore.focusRotation) ? graphStore.focusRotation : 0;
  let delta = target - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const to = from + delta;
  graphStore.focusSpin = roadmapFocusLinked && Math.abs(delta) > 0.04 ? { from, to, chosenId: chosenSource.id } : null;
  if (roadmapFocusLinked) {
    placeLinkedBranch(nodes, to, chosenSource.id);
    graphStore.focusRotation = to;
  }

  graphStore.nodes = nodes;
  graphStore.edges = edges;
}
