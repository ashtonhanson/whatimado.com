/** @typedef {{ id: string, type: "start"|"path"|"mission"|"action", label: string, x: number, y: number, parentId?: string }} GraphNode */
/** @typedef {{ from: string, to: string }} GraphEdge */

/** @type {{ nodes: GraphNode[], edges: GraphEdge[], selectedId: string|null }} */
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
    { id: "start", type: "start", label: "Start", x: 0.5, y: 0.85 },
    { id: "path-a", type: "path", label: "Path A", x: 0.22, y: 0.35, parentId: "start" },
    { id: "path-b", type: "path", label: "Path B", x: 0.5, y: 0.2, parentId: "start" },
    { id: "path-c", type: "path", label: "Path C", x: 0.78, y: 0.35, parentId: "start" }
  ];
  graphStore.edges = [
    { from: "start", to: "path-a" },
    { from: "start", to: "path-b" },
    { from: "start", to: "path-c" }
  ];
  graphStore.selectedId = null;
}

/** @param {string} id */
export function selectGraphNode(id) {
  graphStore.selectedId = id;
}
