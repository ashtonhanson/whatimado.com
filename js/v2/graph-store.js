/** @typedef {{ id: string, type: "start"|"path"|"mission"|"action", label: string, x: number, y: number, parentId?: string, title?: string, description?: string, accent?: string }} GraphNode */
/** @typedef {{ from: string, to: string }} GraphEdge */
/** @typedef {{ id?: string, label: string, title: string, description: string }} AdvisorPath */
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

/** @param {string} id @param {number} index */
function sanitizePathId(id, index) {
  const base = String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `path-${index + 1}`;
}

/** Single display name for path cards and map node labels */
/** @param {{ title?: string, label?: string }} path */
export function pathDisplayName(path) {
  return String(path.title || path.label || "").trim();
}

/** HUD hover accents — distinct hues; yellow reserved for selected state */
export const PATH_ACCENT_PALETTE = ["#2ee8d6", "#3df0de", "#1ec9b8", "#24b8a8"];

/** @param {number} index */
export function pathAccentForIndex(index) {
  return PATH_ACCENT_PALETTE[index % PATH_ACCENT_PALETTE.length];
}

/** Layout slots for up to four path nodes above YOU */
const PATH_LAYOUT_SLOTS = [
  { x: 0.18, y: 0.5 },
  { x: 0.38, y: 0.3 },
  { x: 0.62, y: 0.3 },
  { x: 0.82, y: 0.5 }
];

/**
 * Populate live graph from advisor path proposals.
 * @param {AdvisorPath[]} paths
 */
export function loadAdvisorPaths(paths) {
  const trimmed = paths.slice(0, 4);
  /** @type {GraphNode[]} */
  const nodes = [{ id: "start", type: "start", label: "You", x: 0.5, y: 0.82 }];
  /** @type {GraphEdge[]} */
  const edges = [];

  trimmed.forEach((path, index) => {
    const slot = PATH_LAYOUT_SLOTS[index] ?? PATH_LAYOUT_SLOTS[PATH_LAYOUT_SLOTS.length - 1];
    const id = sanitizePathId(path.id, index);
    const name = pathDisplayName(path) || `Path ${index + 1}`;
    nodes.push({
      id,
      type: "path",
      label: name,
      title: name,
      description: String(path.description || "").trim(),
      x: slot.x,
      y: slot.y,
      parentId: "start",
      accent: pathAccentForIndex(index)
    });
    edges.push({ from: "start", to: id });
  });

  graphStore.nodes = nodes;
  graphStore.edges = edges;
  graphStore.selectedId = null;
}

/** Placeholder possibility nodes for scaffold demo */
export function seedPossibilityNodes() {
  graphStore.nodes = [
    { id: "start", type: "start", label: "You", x: 0.5, y: 0.82 },
    {
      id: "path-a",
      type: "path",
      label: "Rebuild with your skills",
      title: "Rebuild with your skills",
      x: 0.22,
      y: 0.35,
      parentId: "start",
      accent: pathAccentForIndex(0)
    },
    {
      id: "path-b",
      type: "path",
      label: "Train into a trade",
      title: "Train into a trade",
      x: 0.5,
      y: 0.2,
      parentId: "start",
      accent: pathAccentForIndex(1)
    },
    {
      id: "path-c",
      type: "path",
      label: "Freelance / self-employed",
      title: "Freelance / self-employed",
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
