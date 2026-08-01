/** @typedef {{ id: string, type: "start"|"path"|"mission"|"action", label: string, x: number, y: number, parentId?: string }} GraphNode */
/** @typedef {{ from: string, to: string }} GraphEdge */
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

/** Placeholder possibility nodes for scaffold demo */
export function seedPossibilityNodes() {
  graphStore.nodes = [
    { id: "start", type: "start", label: "You", x: 0.5, y: 0.82 },
    { id: "path-a", type: "path", label: "Rebuild", x: 0.22, y: 0.35, parentId: "start" },
    { id: "path-b", type: "path", label: "Train", x: 0.5, y: 0.2, parentId: "start" },
    { id: "path-c", type: "path", label: "Freelance", x: 0.78, y: 0.35, parentId: "start" }
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
