/**
 * One vertical line per column. Fan-out edges that retrace the same column
 * collapse to a single parent → furthest-child spine. Horizontal links stay.
 * @param {Array<{ from: string, to: string }>} edges
 * @param {Array<{ id: string, x: number, y: number }>} nodes
 */
export function collapseVerticalSpines(edges, nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  /** @type {Array<{ from: string, to: string }>} */
  const rest = [];
  /** @type {Map<string, string[]>} */
  const down = new Map();
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const sameColumn = Math.abs(from.x - to.x) < 0.02 && to.y > from.y + 0.004;
    if (!sameColumn) {
      rest.push({ from: edge.from, to: edge.to });
      continue;
    }
    if (!down.has(edge.from)) down.set(edge.from, []);
    down.get(edge.from).push(edge.to);
  }
  const childIds = new Set();
  for (const kids of down.values()) kids.forEach((id) => childIds.add(id));
  /** @type {Array<{ from: string, to: string }>} */
  const spines = [];
  for (const from of down.keys()) {
    if (childIds.has(from)) continue;
    let cursor = from;
    for (let guard = 0; guard < 24; guard += 1) {
      const nexts = down.get(cursor);
      if (!nexts?.length) break;
      const next = nexts.slice().sort((a, b) => (byId.get(b)?.y || 0) - (byId.get(a)?.y || 0))[0];
      if (!next || next === cursor) break;
      cursor = next;
    }
    if (cursor !== from) spines.push({ from, to: cursor });
  }
  return [...rest, ...spines];
}

/**
 * Parent → first child and each following child use the same step.
 * Index 0 is the first child, one step below the parent.
 * @param {number} index
 * @param {number} step
 */
export function childOffset(index, step) {
  const n = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0;
  return step * (n + 1);
}

/**
 * Shared vertical step for a roadmap column and a mission column.
 * One text line, plus half a line above and below it. A wrapped title
 * grows the step by one line. The node diameter is the floor so doubled
 * dots do not sit on each other.
 * `air` is extra line-heights between titles. Phones use a small air so the
 * column stays tight. Desktop uses more air so a one-line title can be read.
 * The same step is used from the parent to every child, so the gaps stay even.
 * @param {{ lineCount?: number, linePx: number, pxPerUnit: number, nodeRadius: number, minStep?: number, air?: number }} input
 */
export function branchStepSvg({ lineCount = 1, linePx, pxPerUnit, nodeRadius, minStep = 0, air = 1 }) {
  const lines = Math.max(1, Math.min(2, Math.round(lineCount) || 1));
  const unit = Math.max(0.25, pxPerUnit || 0.25);
  const titleBlock = linePx * lines + linePx * Math.max(0, air);
  const nodeClear = (Math.max(1, nodeRadius) * 2 + 8) * unit;
  return Math.max(minStep, titleBlock / unit, nodeClear / unit);
}
