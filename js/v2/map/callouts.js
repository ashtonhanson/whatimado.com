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
export function wrapMapLabel(text) {
  const full = String(text || "").trim();
  if (full.length <= 18) return full ? [full] : [];
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
  if (split < 0) return [full.slice(0, 18), full.slice(18, 36)].filter(Boolean);
  return [full.slice(0, split).trim(), full.slice(split + 1).trim()].filter(Boolean).slice(0, 2);
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
  const placeAbove = (item) => {
    item.side = "above";
    item.left = item.nx - item.w / 2;
    item.top = item.ny - item.nr - 16 - item.h;
    if (bounds && item.nx > bounds.left && item.nx < bounds.right) {
      item.left = Math.min(Math.max(item.left, bounds.left + edgePad), bounds.right - edgePad - item.w);
    }
  };
  const placeSide = (item, dx) => {
    if (dx < 0) {
      item.side = "left";
      item.left = item.nx - item.nr - 8 - item.w;
    } else {
      item.side = "right";
      item.left = item.nx + item.nr + 8;
    }
    item.top = item.ny - item.h / 2;
    /* A side title past the stage edge gets cut off; lift it over its dot instead. Phones pan to it, so it stays on one line beside its dot there. */
    const dotVisible = bounds && item.nx > bounds.left && item.nx < bounds.right;
    if (!spineAbove && dotVisible && (item.left < bounds.left + edgePad || item.left + item.w > bounds.right - edgePad)) {
      placeAbove(item);
    }
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
    if (item.kind === "main" || item.role === "mission") {
      placeAbove(item);
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
}
