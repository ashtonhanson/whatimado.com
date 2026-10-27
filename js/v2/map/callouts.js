/**
 * Mission order on the roadmap, starting at 1. These are stages, not tasks.
 * @param {number} orderIndex
 */
export function missionNumberLabel(orderIndex) {
  const index = Number.isFinite(Number(orderIndex)) ? Math.max(0, Math.floor(Number(orderIndex))) : 0;
  return `Mission ${index + 1}`;
}

/**
 * Split a long map title onto a second line. Short titles stay one line.
 * @param {string} text
 * @returns {string[]}
 */
export function wrapMapLabel(text, maxLine = 18) {
  const full = String(text || "").trim();
  const limit = Math.max(8, maxLine);
  if (full.length <= limit) return full ? [full] : [];
  const mid = full.length / 2;
  let split = -1;
  let best = Infinity;
  for (let i = 4; i <= full.length - 4; i += 1) {
    if (full[i] !== " ") continue;
    const dist = Math.abs(i - mid);
    if (dist < best) {
      best = dist;
      split = i;
    }
  }
  if (split < 0) return [full.slice(0, limit), full.slice(limit, limit * 2)].filter(Boolean);
  return [full.slice(0, split).trim(), full.slice(split + 1).trim()].filter(Boolean).slice(0, 2);
}

/**
 * Settings and Analytics titles sit above their own dots and stay fully on screen.
 * @param {Array<{ nodeId?: string, nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number, side?: string }>} items
 * @param {{ left: number, right: number } | null} [bounds]
 */
export function pinSpokeTitles(items, bounds = null) {
  const edge = 8;
  const gaps = {
    "option-settings": 6,
    "option-analytics": 6,
    "option-notes": 4,
    "option-roadmaps": 4
  };
  for (const item of items) {
    const gap = gaps[item.nodeId];
    if (gap == null) continue;
    const nr = item.nr || 6;
    item.side = "above";
    const ideal = item.nx - item.w / 2;
    item.left = ideal;
    item.top = item.ny - nr - gap - item.h;
    if (!bounds) continue;
    const clamped = Math.min(Math.max(item.left, bounds.left + edge), bounds.right - edge - item.w);
    /* A small nudge keeps the word on screen. A bigger slide would leave the dot. */
    if (Math.abs(clamped - ideal) <= 12) item.left = clamped;
  }
  const pinned = items.filter((item) => gaps[item.nodeId] != null);
  for (let i = 0; i < pinned.length; i += 1) {
    for (let j = i + 1; j < pinned.length; j += 1) {
      const a = pinned[i];
      const b = pinned[j];
      const overlapX = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
      if (overlapX <= 2 || overlapY <= 2) continue;
      const shift = (overlapX + 8) / 2;
      if (a.nx <= b.nx) {
        a.left -= shift;
        b.left += shift;
      } else {
        b.left -= shift;
        a.left += shift;
      }
    }
  }
}

/**
 * Title sits on the node the way the constellation reference does:
 * mission titles above that mission's dot, task titles level with that task's dot.
 * @param {Array<{ nx: number, ny: number, nr: number, w: number, h: number, left: number, top: number, kind: string, role?: string, side?: string }>} items
 * @param {{ left: number, right: number } | null} [bounds] visible stage edges in screen px
 * @param {{ spineAbove?: boolean }} [options] center every spine title on the horizontal line over its dot
 */
export function placeTitleBesideNode(items, bounds = null, { spineAbove = false } = {}) {
  const you = items.find((item) => item.kind === "start");
  const edgePad = 6;
  const placeAbove = (item, gap = 16) => {
    item.side = "above";
    const ideal = item.nx - item.w / 2;
    item.left = ideal;
    item.top = item.ny - item.nr - gap - item.h;
    if (!bounds) return;
    const stayAbove = item.role === "mission" || item.kind === "main";
    const roomRight = Math.max(bounds.left + edgePad, bounds.right - edgePad - item.w);
    const clamped = Math.min(Math.max(item.left, bounds.left + edgePad), roomRight);
    /* A mission title belongs above its dot. Sliding it right puts it on the line to the next mission. */
    const dotInside = item.nx > bounds.left && item.nx < bounds.right;
    if (stayAbove || (dotInside && Math.abs(clamped - ideal) <= 12)) {
      item.left = clamped;
      return;
    }
    item.side = "right";
    item.left = item.nx + item.nr + 8;
    item.top = item.ny - item.h / 2;
  };
  const placeSide = (item, dx) => {
    const nearLeft = bounds && item.nx < bounds.left + Math.max(item.w, 48) + item.nr + 12;
    if (dx < 0 && !nearLeft) {
      item.side = "left";
      item.left = item.nx - item.nr - 8 - item.w;
    } else {
      item.side = "right";
      item.left = item.nx + item.nr + 8;
    }
    item.top = item.ny - item.h / 2;
    /* A side title past the stage edge gets cut off. Keep it on this dot: the other side, then above. */
    const dotVisible = bounds && item.nx > bounds.left && item.nx < bounds.right;
    const pastLeft = bounds && item.left < bounds.left + edgePad;
    const pastRight = bounds && item.left + item.w > bounds.right - edgePad;
    if (dotVisible && pastLeft && item.side === "left") {
      item.side = "right";
      item.left = item.nx + item.nr + 8;
      item.top = item.ny - item.h / 2;
    } else if (dotVisible && pastRight && !spineAbove && item.side === "right") placeAbove(item);
  };
  /** Titles that belong beside a dot stay on its right, even when the line is long. */
  const placeRightOfNode = (item) => {
    item.side = "right";
    item.left = item.nx + item.nr + 8;
    item.top = item.ny - item.h / 2;
  };
  const placeBelow = (item) => {
    item.side = "below";
    item.left = item.nx - item.w / 2;
    item.top = item.ny + item.nr + 8;
  };
  if (you) placeAbove(you);
  const others = items.filter((item) => item !== you);
  /* Tasks sit just under the line, inside the old 28px spine band. Counting them as spine
     put the first task title in the mission's above-slot and left a gap at the task dot. */
  const spine = you
    ? others.filter(
        (item) =>
          item.role !== "task" &&
          item.kind !== "path" &&
          item.nx > you.nx &&
          Math.abs(item.ny - you.ny) < 28
      )
    : [];
  const dotOverYouTitle = (item) =>
    Math.abs(item.nx - you.nx) < you.w / 2 + item.nr + 6 &&
    item.ny + item.nr + 6 > you.top &&
    item.ny - item.nr - 6 < you.top + you.h;
  /** Every spoke is tethered to You, so a line to a node overhead can run through the title. */
  const tetherThroughYouTitle = (item) => {
    const midY = you.top + you.h / 2;
    if (item.ny >= midY) return false;
    const x = you.nx + ((item.nx - you.nx) * (you.ny - midY)) / (you.ny - item.ny);
    return x > you.left - 4 && x < you.left + you.w + 4;
  };
  if (you && (others.some(dotOverYouTitle) || others.some(tetherThroughYouTitle))) {
    placeBelow(you);
    if (others.some(dotOverYouTitle)) placeSide(you, spine.length ? -1 : 1);
  }
  const rightmost = spine.reduce((best, item) => (!best || item.nx > best.nx ? item : best), null);
  const top = others
    .filter((item) => item.kind !== "path" && item.role !== "task" && item.role !== "mission" && !spine.includes(item))
    .reduce((best, item) => (!best || item.ny < best.ny ? item : best), null);
  others.forEach((item) => {
    if (item.nodeId === "option-settings" || item.nodeId === "option-analytics") return;
    if (item.kind === "main" || item.role === "mission") {
      placeAbove(item, 4);
      return;
    }
    if (item.role === "task" || item.kind === "path") {
      placeRightOfNode(item);
      return;
    }
    if (spine.includes(item)) {
      if (item === rightmost && !spineAbove) placeSide(item, 1);
      else placeAbove(item);
      return;
    }
    if (item === top) placeAbove(item);
    else placeSide(item, item.nx - (you?.nx ?? item.nx));
  });
  pinSpokeTitles(items, bounds);
}
