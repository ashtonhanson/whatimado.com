import { measureCssVarLength } from "./layout/measure-css-var.js";
import { wrapMapLabel } from "./map/callouts.js";
import { branchStepSvg, childOffset } from "./map/spines.js";

/** @typedef {{ id: string, type: "start"|"path"|"mission"|"task"|"action"|"more", label: string, x: number, y: number, parentId?: string, title?: string, description?: string, accent?: string, ideaType?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string, done?: boolean, waiting?: boolean, bypassed?: boolean, chainIndex?: number, taskIndex?: number, stageIndex?: number, homeAngle?: number }} GraphNode */
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
  graphStore.focusRotation = undefined;
  graphStore.focusSpin = null;
  possibilityNodes = null;
  possibilityEdges = null;
  branchChosenId = null;
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

const MAP_LABEL_SKIP = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "with", "your", "into", "in", "on", "at", "from", "by"
]);

/** One or two words for the node on the map. */
export function shortenMapLabel(value) {
  const words = String(value || "")
    .replace(/[/|]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
  if (!words.length) return "";
  const kept = words.filter((word) => !MAP_LABEL_SKIP.has(word.toLowerCase()));
  return (kept.length ? kept : words).slice(0, 2).join(" ");
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
  const nodes = possibilityNodes || graphStore.nodes;
  const edges = possibilityEdges || graphStore.edges;
  const existingPaths = nodes.filter((node) => node.type === "path");
  const startIndex = existingPaths.length;
  const room = MAX_PATH_NODES - startIndex;
  if (room <= 0) return [];

  const used = new Set(nodes.map((node) => node.id));
  /** @type {GraphNode[]} */
  const added = [];

  paths.slice(0, room).forEach((path, offset) => {
    const index = startIndex + offset;
    const node = pathNodeFromAdvisor(path, index);
    let id = node.id;
    if (used.has(id)) id = sanitizePathId(`${id}-${index + 1}`, index);
    used.add(id);
    node.id = id;
    nodes.push(node);
    edges.push({ from: "start", to: id });
    added.push(node);
  });

  if (possibilityNodes && branchChosenId && added.length) showRoadmapBranch(branchChosenId);
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
/** @type {string|null} */
let branchChosenId = null;

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
  branchChosenId = null;
}

/** When linked, the selected roadmap is the left-to-right spoke and the map can spin to it. */
export let roadmapFocusLinked = true;

/**
 * After a roadmap is confirmed, the chosen roadmap stays on the horizontal line.
 * The other roadmaps hang in a vertical stack above that line, greyed out.
 */
export let spineAlternatePaths = false;

/** @param {boolean} on */
export function setSpineAlternatePaths(on) {
  spineAlternatePaths = Boolean(on);
  return spineAlternatePaths;
}

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
const YOU_LINKED = { x: 200, y: 168 };
const PATH_REACH = 112;
/** Screen gap between the last mission dot and the + node. */
const PLUS_GAP_PX = 30;
const MISSION_STEP = 34;
const MISSION_TITLE_GAP_PX = 16;
const TASK_STACK_STEP = 30;
const MAP_LABEL_FONT = "500 12.5px sans-serif";
/** Settings, Notes, and Roadmaps all sit this far from You, evenly spaced on an arc. */
const OPTION_RADIUS = 96;

/** @returns {boolean} */
function isMobileMapLayout() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
}

/** @returns {number} */
function mapStageWidthPx() {
  return typeof window !== "undefined" ? Math.min(Math.max(window.innerWidth || 800, 320), 960) * 0.94 : 720;
}

/** @returns {number} */
function mapPxPerUnit() {
  return mapStageWidthPx() / MAP_W;
}

/**
 * Wider arc on mobile so Settings / Notes / Roadmaps labels do not collide.
 * @param {string} nodeId
 */
function linkedOptionSlot(nodeId) {
  if (!LINKED_OPTION_OFFSETS[nodeId]) return null;
  if (!isMobileMapLayout()) return LINKED_OPTION_OFFSETS[nodeId];
  const slot = MOBILE_OPTION_SLOTS_PX[nodeId];
  if (!slot) return LINKED_OPTION_OFFSETS[nodeId];
  const pxPerUnit = mapPxPerUnit() * 0.5;
  return { dx: slot.dx / pxPerUnit, dy: slot.dy / pxPerUnit };
}

/**
 * Phone slots in screen px around You, sized for 13px single-line titles: Notes overhead
 * (title above), Settings and Roadmaps to the left (titles run left, a title and a half apart).
 */
const MOBILE_OPTION_SLOTS_PX = {
  "option-settings": { dx: -46, dy: 0 },
  "option-notes": { dx: 0, dy: -62 },
  "option-roadmaps": { dx: -46, dy: -40 }
};

/** @returns {number} */
function taskLabelLinePx() {
  return measureCssVarLength("--v2-map-task-label-line-h") || 17.5;
}

/** @returns {number} Painted node radius in SVG units. */
function nodeRadiusSvg() {
  if (typeof document === "undefined") return 17;
  const lg = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--v2-map-node-lg"));
  return Number.isFinite(lg) && lg > 0 ? lg : 17;
}

/**
 * How many lines this title will paint. The map caps a title at two lines.
 * @param {string} text
 */
function titleLineCount(text) {
  return Math.max(1, wrapMapLabel(text).length);
}

/**
 * One step for every child in a column. Roadmap columns and mission columns
 * call this with their own titles, so a wrapped title only lengthens its column.
 * @param {string[]} titles
 */
function stepForTitles(titles) {
  const lineCount = (titles || []).reduce((max, title) => Math.max(max, titleLineCount(title)), 1);
  return branchStepSvg({
    lineCount,
    linePx: taskLabelLinePx(),
    pxPerUnit: mapPxPerUnit() * 0.5,
    nodeRadius: nodeRadiusSvg(),
    minStep: TASK_STACK_STEP
  });
}

/**
 * @param {Record<string, number>} degrees Angle from You, counterclockwise from pointing right.
 * @returns {Record<string, { dx: number, dy: number }>}
 */
function optionRing(degrees) {
  return Object.fromEntries(
    Object.entries(degrees).map(([id, deg]) => {
      const rad = (deg * Math.PI) / 180;
      return [id, { dx: Math.cos(rad) * OPTION_RADIUS, dy: -Math.sin(rad) * OPTION_RADIUS }];
    })
  );
}

/** The selected roadmap runs right, so the options arc 45° apart over You. */
const LINKED_OPTION_OFFSETS = optionRing({ "option-settings": 160, "option-notes": 115, "option-roadmaps": 70 });
const OPTION_OFFSETS = [
  { dx: -175, dy: -90 },
  { dx: -40, dy: -86 },
  { dx: 110, dy: -78 }
];

/**
 * Unlinked: You at the bottom center, the selected roadmap straight above,
 * options fanned to the left, other roadmaps stacked in a column on the right.
 */
const YOU_UNLINKED = { x: 400, y: 182 };
const UNLINKED_CHOSEN = { dx: 0, dy: -82 };
const UNLINKED_PLUS = { dx: 44, dy: -82 };
const UNLINKED_MISSION_STEP = 32;
/** The column's lowest roadmap sits here; earlier roadmaps move up as new ones slot in beneath. */
const UNLINKED_COLUMN = { dx: 160, dy: 0 };
/** The column's top stays this far under the selected roadmap so its line clears the plus. */
const UNLINKED_COLUMN_PLUS_CLEAR = 40;
/** The selected roadmap holds straight up, so the options fan out 30° apart on the left. */
const UNLINKED_OPTION_OFFSETS = optionRing({ "option-settings": 135, "option-notes": 165, "option-roadmaps": 195 });

/** 1 fits the three-quarter gap. Top and bottom snaps use the larger spread. */
export let mapSpread = 1;

/** @param {number} spread */
export function setMapSpread(spread) {
  mapSpread = Math.max(1, Math.min(1.7, spread));
  return mapSpread;
}

/** @type {Map<string, number>} */
const homeAngles = new Map();

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
 * You sits on the horizontal roadmap. The chosen path runs to the right.
 * Other roadmaps drop in one column under that chosen node.
 * Settings, notes, and the rest stay on a wider arc above You.
 * @param {GraphNode[]} nodes
 * @param {number} rotation
 * @param {string} chosenId
 */
/** Horizontal milestone nodes (stage headers), not tasks. */
function milestoneChain(nodes) {
  return nodes
    .filter((node) => node.type === "mission")
    .sort((a, b) => (a.chainIndex ?? 0) - (b.chainIndex ?? 0));
}

/**
 * @param {GraphNode[]} nodes
 * @param {string} milestoneId
 */
function tasksForMilestone(nodes, milestoneId) {
  return nodes
    .filter((node) => node.type === "task" && node.parentId === milestoneId)
    .sort((a, b) => (a.taskIndex ?? 0) - (b.taskIndex ?? 0));
}

/**
 * @param {string} text
 */
function measureTitlePx(text) {
  const lines = wrapMapLabel(text || "");
  const label = lines.reduce((best, line) => (line.length > best.length ? line : best), "").toUpperCase();
  if (typeof document === "undefined") return label.length * 7;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return label.length * 7;
  ctx.font = MAP_LABEL_FONT;
  return ctx.measureText(label).width + label.length * 0.5;
}

/**
 * Screen-sized title width → spacing between milestone columns (SVG units).
 * @param {GraphNode[]} milestones
 * @param {GraphNode[]} nodes
 */
function linkedMilestoneStep(milestones, nodes) {
  let maxColPx = 0;
  for (const milestone of milestones) {
    let colPx = measureTitlePx(milestone.title || milestone.label || "");
    for (const task of tasksForMilestone(nodes, milestone.id)) {
      colPx = Math.max(colPx, measureTitlePx(task.title || task.label || ""));
    }
    maxColPx = Math.max(maxColPx, colPx);
  }
  const pxPerUnit = mapPxPerUnit();
  let gapPx = Math.max(60, maxColPx + MISSION_TITLE_GAP_PX * 0.5);
  if (isMobileMapLayout()) {
    gapPx = Math.max(36, maxColPx + 6);
  }
  const stepSvg = gapPx / (pxPerUnit * 0.5);
  return Math.max(MISSION_STEP, stepSvg);
}

/**
 * Roadmap → first mission. Only needs to clear the two titles over those dots and the
 * alternate roadmap titles that run right of the roadmap column, level with the first tasks.
 * @param {GraphNode|undefined} chosen
 * @param {GraphNode[]} milestones
 * @param {GraphNode[]} pathSiblings
 * @param {number} milestoneStep
 */
function linkedFirstMilestoneStep(chosen, milestones, pathSiblings, milestoneStep) {
  if (!milestones.length) return milestoneStep;
  const titlePx = (node) => measureTitlePx(node?.title || node?.label || "") * (13 / 12.5);
  const kickerPx = measureTitlePx("Roadmaps") * 0.82;
  const mainPx = Math.max(titlePx(chosen), kickerPx);
  let gapPx = (mainPx + titlePx(milestones[0])) / 2 + (isMobileMapLayout() ? 12 : 18);
  for (const sibling of pathSiblings) gapPx = Math.max(gapPx, titlePx(sibling) + 18);
  return Math.min(milestoneStep, Math.max(MISSION_STEP, gapPx / (mapPxPerUnit() * 0.5)));
}

/**
 * @param {GraphNode[]} nodes
 * @param {GraphNode[]} milestones
 */
export function placeLinkedBranch(nodes, rotation, chosenId) {
  const spread = mapSpread;
  const originX = YOU_LINKED.x;
  const satellites = nodes.filter((node) => node.type !== "start" && node.type !== "more" && node.id !== chosenId);
  const pathSiblings = satellites.filter((node) => node.type === "path");
  const milestones = milestoneChain(satellites);
  const tasks = satellites.filter((node) => node.type === "task");
  const orbit = satellites.filter(
    (node) =>
      !pathSiblings.includes(node) &&
      !milestones.includes(node) &&
      !tasks.includes(node) &&
      !LINKED_OPTION_OFFSETS[node.id]
  );
  const mobile = isMobileMapLayout();
  const milestoneStep = linkedMilestoneStep(milestones, nodes);
  const chosen = nodes.find((node) => node.id === chosenId);
  const firstStep = linkedFirstMilestoneStep(chosen, milestones, pathSiblings, milestoneStep);
  /* On phones the title over the roadmap dot has to clear the Notes spoke straight above You. */
  const chosenReach = mobile
    ? Math.max(PATH_REACH, (Math.max(measureTitlePx(chosen?.title || chosen?.label || ""), measureTitlePx("Roadmaps")) * 0.55 + 16) / (mapPxPerUnit() * 0.5))
    : PATH_REACH;
  const chosenDist = chosenReach * spread;
  /** @param {number} index */
  const milestoneDist = (index) => chosenDist + (firstStep + milestoneStep * index) * spread;
  const lastDist = milestones.length ? milestoneDist(milestones.length - 1) : chosenDist;
  const plusDist = lastDist + (PLUS_GAP_PX / (mapPxPerUnit() * 0.5)) * spread;
  const originY = YOU_LINKED.y;
  const siblingStep = stepForTitles(pathSiblings.map((node) => node.title || node.label || ""));
  const chosenX = originX + Math.cos(rotation) * chosenDist;
  const chosenY = originY + Math.sin(rotation) * chosenDist;

  nodes.forEach((node) => {
    if (node.type === "start") {
      node.x = originX / MAP_W;
      node.y = originY / MAP_H;
      return;
    }
    if (node.id === chosenId) {
      node.x = chosenX / MAP_W;
      node.y = chosenY / MAP_H;
      return;
    }
    if (node.type === "more") {
      node.x = (originX + Math.cos(rotation) * plusDist) / MAP_W;
      node.y = (originY + Math.sin(rotation) * plusDist) / MAP_H;
      return;
    }
    const milestoneIndex = milestones.findIndex((entry) => entry.id === node.id);
    if (milestoneIndex >= 0) {
      const dist = milestoneDist(milestoneIndex);
      node.x = (originX + Math.cos(rotation) * dist) / MAP_W;
      node.y = (originY + Math.sin(rotation) * dist) / MAP_H;
      return;
    }
    if (node.type === "task" && node.parentId) {
      const parent = milestones.find((entry) => entry.id === node.parentId);
      const parentDist = milestoneDist(parent != null ? milestones.findIndex((entry) => entry.id === parent.id) : 0);
      const mx = originX + Math.cos(rotation) * parentDist;
      const my = originY + Math.sin(rotation) * parentDist;
      const perpX = -Math.sin(rotation);
      const perpY = Math.cos(rotation);
      const columnTitles = tasksForMilestone(nodes, node.parentId).map((task) => task.title || task.label || "");
      const stack = childOffset(node.taskIndex ?? 0, stepForTitles(columnTitles)) * spread;
      node.x = (mx + perpX * stack) / MAP_W;
      node.y = (my + perpY * stack) / MAP_H;
      return;
    }
    const siblingIndex = pathSiblings.findIndex((entry) => entry.id === node.id);
    if (siblingIndex >= 0) {
      node.x = chosenX / MAP_W;
      node.y = (chosenY + childOffset(siblingIndex, siblingStep) * spread) / MAP_H;
      return;
    }
    const index = Math.max(0, orbit.findIndex((entry) => entry.id === node.id));
    const slot = linkedOptionSlot(node.id) || OPTION_OFFSETS[index % OPTION_OFFSETS.length];
    node.x = (originX + slot.dx * spread) / MAP_W;
    node.y = (originY + slot.dy * spread) / MAP_H;
  });
}

/**
 * @param {GraphNode[]} nodes
 * @param {string} chosenId
 */
export function placeUnlinkedBranch(nodes, chosenId) {
  const { x: youX, y: youY } = YOU_UNLINKED;
  const satellites = nodes.filter((node) => node.type !== "start" && node.type !== "more" && node.id !== chosenId);
  const column = satellites.filter((node) => node.type === "path");
  const milestones = milestoneChain(satellites);
  const tasks = satellites.filter((node) => node.type === "task");
  const extras = satellites.filter(
    (node) =>
      !column.includes(node) &&
      !milestones.includes(node) &&
      !tasks.includes(node) &&
      !UNLINKED_OPTION_OFFSETS[node.id]
  );
  const milestoneStep = Math.max(UNLINKED_MISSION_STEP, linkedMilestoneStep(milestones, nodes) * 0.85);
  const columnGap = stepForTitles(column.map((node) => node.title || node.label || ""));
  const taskGap = stepForTitles(tasks.map((node) => node.title || node.label || ""));
  const columnTop = UNLINKED_CHOSEN.dy + UNLINKED_COLUMN_PLUS_CLEAR;

  nodes.forEach((node) => {
    /** @type {{ dx: number, dy: number }} */
    let slot;
    if (node.type === "start") slot = { dx: 0, dy: 0 };
    else if (node.id === chosenId) slot = UNLINKED_CHOSEN;
    else if (node.type === "more") {
      slot = {
        dx: UNLINKED_CHOSEN.dx + milestoneStep * (milestones.length + 1) + 18,
        dy: UNLINKED_CHOSEN.dy
      };
    } else if (milestones.includes(node)) {
      const milestoneIndex = milestones.findIndex((entry) => entry.id === node.id);
      slot = { dx: UNLINKED_CHOSEN.dx + milestoneStep * (milestoneIndex + 1), dy: UNLINKED_CHOSEN.dy };
    } else if (node.type === "task" && node.parentId) {
      const parent = milestones.find((entry) => entry.id === node.parentId);
      const milestoneIndex = parent ? milestones.findIndex((entry) => entry.id === parent.id) : 0;
      slot = {
        dx: UNLINKED_CHOSEN.dx + milestoneStep * (milestoneIndex + 1),
        dy: UNLINKED_CHOSEN.dy + childOffset(node.taskIndex ?? 0, taskGap)
      };
    }
    else if (column.includes(node)) {
      slot = { dx: UNLINKED_COLUMN.dx, dy: columnTop + columnGap * column.indexOf(node) };
    } else if (UNLINKED_OPTION_OFFSETS[node.id]) slot = UNLINKED_OPTION_OFFSETS[node.id];
    else slot = { dx: -110 - 50 * extras.indexOf(node), dy: -100 };
    node.x = (youX + slot.dx) / MAP_W;
    node.y = (youY + slot.dy) / MAP_H;
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
 * Unlinked: selected roadmap above You, options to the left, other roadmaps in a right column.
 * @param {string} pathId
 * @param {Array<{ missions?: { id?: string, title?: string, done?: boolean, waiting?: boolean }[] }>} [stages]
 */
export function showRoadmapBranch(pathId, stages = null) {
  rememberPossibilities();
  const source = possibilityNodes || graphStore.nodes;
  const paths = source.filter((node) => node.type === "path");
  const chosenSource = paths.find((node) => node.id === pathId) || paths[0];
  if (!chosenSource) return;
  branchChosenId = chosenSource.id;

  /** @type {GraphNode[]} */
  const spokes = [chosenSource];
  paths.forEach((node) => {
    if (node.id !== chosenSource.id) spokes.push(node);
  });
  EXPLORE_OPTIONS.forEach((option) => {
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
  spokes.forEach((node) => {
    nodes.push({ ...node });
    edges.push({ from: "start", to: node.id });
  });

  if (spineAlternatePaths) {
    const alternates = nodes.filter((node) => node.type === "path" && node.id !== chosenSource.id);
    for (let index = edges.length - 1; index >= 0; index -= 1) {
      const edge = edges[index];
      if (edge.from === "start" && alternates.some((node) => node.id === edge.to)) edges.splice(index, 1);
    }
    alternates.forEach((node, index) => {
      const from = index === 0 ? chosenSource.id : alternates[index - 1].id;
      edges.push({ from, to: node.id });
    });
  }

  let attachId = chosenSource.id;
  if (Array.isArray(stages) && stages.length) {
    stages.slice(0, 8).forEach((stage, stageIndex) => {
      const milestoneId = `milestone-${stageIndex}`;
      const stageTitle = String(stage.label || `Stage ${stageIndex + 1}`).trim();
      nodes.push({
        id: milestoneId,
        type: "mission",
        label: shortenMapLabel(stageTitle) || `Stage ${stageIndex + 1}`,
        title: stageTitle,
        chainIndex: stageIndex,
        stageIndex,
        parentId: attachId
      });
      edges.push({ from: attachId, to: milestoneId });
      attachId = milestoneId;

      (stage.missions || []).slice(0, 8).forEach((mission, taskIndex) => {
        const id = String(mission.id || `mission-${stageIndex}-${taskIndex}`).slice(0, 64);
        const title = String(mission.title || "Task").trim();
        nodes.push({
          id,
          type: "task",
          label: shortenMapLabel(title) || `Task ${taskIndex + 1}`,
          title,
          done: Boolean(mission.done),
          waiting: Boolean(mission.waiting),
          bypassed: Boolean(mission.bypassed) && !mission.done,
          chainIndex: stageIndex,
          taskIndex,
          stageIndex,
          parentId: milestoneId
        });
        edges.push({ from: milestoneId, to: id });
      });
    });
  }

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
    edges.push({ from: attachId, to: ROADMAP_MORE_ID });
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
  } else {
    placeUnlinkedBranch(nodes, chosenSource.id);
  }

  graphStore.nodes = nodes;
  graphStore.edges = edges;
}
