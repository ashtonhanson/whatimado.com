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
 * Homepage constellation: titles never overlap. Each stays centered above its dot when clear,
 * otherwise steps to its outer side, the inner side, then below. A title with no clear spot
 * is marked `hidden` rather than drawn over another.
 * @param {Array<{ kind?: string, kicker?: unknown, nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number, side?: string, descent?: number, hidden?: boolean }>} items
 * @param {Array<{ nx: number, ny: number, nr: number }>} dots
 * @param {{ left: number, right: number, top?: number, bottom?: number } | null} [bounds]
 * @param {number} [gap]
 * @param {Array<{ left: number, right: number, top: number, bottom: number }>} [obstacles] Screen chrome titles must not cover.
 * @param {number} [drift] Vertical px each dot (and its title) bobs on its own idle float.
 */
export function separateHomeTitles(items, dots, bounds = null, gap = 5, obstacles = [], drift = 0) {
  if (!items.length) return;
  const cx = items.reduce((sum, item) => sum + item.nx, 0) / items.length;
  const rank = (item) => (item.kind === "start" ? 0 : item.kicker ? 1 : 2);
  const order = [...items].sort(
    (a, b) => rank(a) - rank(b) || Math.abs(a.nx - cx) - Math.abs(b.nx - cx)
  );
  const pad = 3;
  /* Neighbors float out of phase, so vertical clearance also covers the full bob. */
  const padY = pad + Math.max(0, drift);
  const touches = (a, b) =>
    a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + padY && b.top < a.bottom + padY;
  /* Earlier passes clamp titles flush to the edge, so allow sub-pixel rounding there. */
  const slack = 1;
  const inBounds = (box) =>
    !bounds ||
    (box.left >= bounds.left - slack &&
      box.right <= bounds.right + slack &&
      (bounds.top == null || box.top >= bounds.top - slack) &&
      (bounds.bottom == null || box.bottom <= bounds.bottom + slack));
  /** @type {Array<{ left: number, right: number, top: number, bottom: number }>} */
  const placed = [...obstacles];
  for (const item of order) {
    item.hidden = false;
    const nr = item.nr || 6;
    const above = { side: "above", left: item.nx - item.w / 2, top: item.ny - nr - gap - item.h + (item.descent || 0) };
    const below = { side: "below", left: item.nx - item.w / 2, top: item.ny + nr + gap };
    const left = { side: "left", left: item.nx - nr - gap - item.w, top: item.ny - item.h / 2 };
    const right = { side: "right", left: item.nx + nr + gap, top: item.ny - item.h / 2 };
    const current = { side: item.side || "above", left: item.left, top: item.top };
    const outward = item.nx < cx ? [left, right] : [right, left];
    /* A centered spot may slide a few px sideways to clear an obstacle before changing sides. */
    const nudged = (spot) => [0, 6, -6, 12, -12].map((dx) => ({ ...spot, left: spot.left + dx }));
    /* Kicker titles (Mission 1) read as one stack and only fit above or below. */
    const candidates = item.kind === "start"
      ? [current, ...nudged(above), right, left]
      : item.kicker
        ? [current, ...nudged(above), ...nudged(below)]
        : [current, ...nudged(above), ...outward, ...nudged(below)];
    const clear = candidates.find((spot) => {
      const box = { left: spot.left, right: spot.left + item.w, top: spot.top, bottom: spot.top + item.h };
      if (!inBounds(box)) return false;
      if (placed.some((other) => touches(box, other))) return false;
      return !dots.some((dot) => {
        if (Math.hypot(dot.nx - item.nx, dot.ny - item.ny) < 1) return false;
        return touches(box, {
          left: dot.nx - dot.nr,
          right: dot.nx + dot.nr,
          top: dot.ny - dot.nr,
          bottom: dot.ny + dot.nr
        });
      });
    });
    if (!clear) {
      item.hidden = true;
      continue;
    }
    item.side = clear.side;
    item.left = clear.left;
    item.top = clear.top;
    placed.push({ left: item.left, right: item.left + item.w, top: item.top, bottom: item.top + item.h });
  }
}

/**
 * Settings and Analytics titles sit above their own dots and stay fully on screen.
 * @param {Array<{ nodeId?: string, nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number, side?: string }>} items
 * @param {{ left: number, right: number } | null} [bounds]
 */
export function pinSpokeTitles(items, bounds = null) {
  const edge = 8;
  const gaps = {
    "option-settings": 5,
    "option-analytics": 5,
    "option-notes": 5,
    "option-roadmaps": 5
  };
  for (const item of items) {
    const gap = gaps[item.nodeId];
    if (gap == null) continue;
    const nr = item.nr || 6;
    item.side = "above";
    const ideal = item.nx - item.w / 2;
    item.left = ideal;
    item.top = item.ny - nr - gap - item.h + (item.descent || 0);
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
 * Every title centered above its own dot, slid just enough to stay inside the stage.
 * @param {Array<{ nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number, side?: string }>} items
 * @param {{ left: number, right: number } | null} [bounds]
 */
export function placeTitlesAbove(items, bounds = null, gap = 6) {
  const edge = 8;
  for (const item of items) {
    item.side = "above";
    item.left = item.nx - item.w / 2;
    /* Gap runs from the letters' baseline, not the empty descender space under it. */
    item.top = item.ny - (item.nr || 6) - gap - item.h + (item.descent || 0);
    /* A dot past the stage edge keeps its title with it rather than sliding into view alone. */
    if (!bounds || item.nx < bounds.left || item.nx > bounds.right) continue;
    item.left = Math.min(Math.max(item.left, bounds.left + edge), Math.max(bounds.left + edge, bounds.right - edge - item.w));
  }
}

/** @param {{ left: number, top: number, w: number, h: number }} a @param {{ left: number, top: number, w: number, h: number }} b */
function boxesTouch(a, b) {
  return a.left < b.left + b.w + 2 && a.left + a.w + 2 > b.left && a.top < b.top + b.h + 2 && a.top + a.h + 2 > b.top;
}

/** @param {{ nx: number, ny: number, nr?: number }} dot @param {{ left: number, top: number, w: number, h: number }} box */
function dotInBox(dot, box) {
  const r = (dot.nr || 6) + 3;
  return dot.nx + r > box.left && dot.nx - r < box.left + box.w && dot.ny + r > box.top && dot.ny - r < box.top + box.h;
}

/**
 * Slide a right-side title further right until no dot sits under it.
 * @param {{ nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number }} item
 * @param {Array<{ nx: number, ny: number, nr?: number }>} dots
 */
function stepRightPastDots(item, dots, gap = 5) {
  for (let pass = 0; pass < dots.length; pass += 1) {
    let moved = false;
    for (const dot of dots) {
      if (dot === item) continue;
      const r = (dot.nr || 6) + 3;
      if (dot.nx + r <= item.left || dot.nx - r >= item.left + item.w) continue;
      if (dot.ny + r <= item.top || dot.ny - r >= item.top + item.h) continue;
      item.left = dot.nx + (dot.nr || 6) + gap;
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * Right-side titles whose boxes collide are stacked top to bottom in dot order,
 * then each stack is centered on its dots so no title drifts far from its node.
 * @param {Array<{ ny: number, w: number, h: number, left: number, top: number }>} items
 */
function stackRightTitles(items) {
  const sorted = [...items].sort((a, b) => a.ny - b.ny);
  const spanX = (a, b) => Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left) > 0;
  let stack = [];
  const settle = () => {
    if (stack.length < 2) return;
    const drift = stack.reduce((sum, item) => sum + (item.top + item.h / 2 - item.ny), 0) / stack.length;
    stack.forEach((item) => {
      item.top -= drift;
    });
  };
  for (const item of sorted) {
    const prev = stack.find((other) => spanX(other, item) && item.top < other.top + other.h + 2);
    if (prev) {
      const floor = Math.max(...stack.filter((other) => spanX(other, item)).map((other) => other.top + other.h + 2));
      item.top = Math.max(item.top, floor);
      stack.push(item);
    } else {
      settle();
      stack = [item];
    }
  }
  settle();
}

/**
 * Task and unchosen path titles sit gap px to the right of their dots; every other
 * title sits gap px above the node. The homepage map puts every title above.
 * @param {Array<{ role?: string, nx: number, ny: number, nr?: number, w: number, h: number, left: number, top: number, side?: string }>} items
 * @param {{ left: number, right: number } | null} [bounds]
 * @param {number} [gap]
 * @param {{ pathsRight?: boolean }} [options]
 */
export function placeTitlesRoadmapStyle(items, bounds = null, gap = 5, { pathsRight = true } = {}) {
  const tasks = [];
  const rest = [];
  for (const item of items) {
    if (item.role === "task" || (pathsRight && item.kind === "path")) tasks.push(item);
    else rest.push(item);
  }
  placeTitlesAbove(rest, bounds, gap);
  for (const item of tasks) {
    item.side = "right";
    item.left = item.nx + (item.nr || 6) + gap;
    item.top = item.ny - item.h / 2;
  }
  /* A dot in the way on the right sends a path title above its own dot when that spot is clear,
     so it never drifts away from the node it names. You's title has not picked above or
     below yet, so it cannot block anything here. */
  const settled = rest.filter((item) => item.kind !== "start");
  for (const item of tasks) {
    if (item.role === "task") continue;
    const nominal = item.left;
    stepRightPastDots(item, items, gap);
    if (item.left <= nominal + 0.5 && !settled.some((other) => boxesTouch(item, other))) {
      settled.push(item);
      continue;
    }
    const above = {
      left: item.nx - item.w / 2,
      top: item.ny - (item.nr || 6) - gap - item.h + (item.descent || 0),
      w: item.w,
      h: item.h
    };
    const clear =
      !items.some((dot) => dot !== item && dotInBox(dot, above)) &&
      !settled.some((other) => boxesTouch(above, other));
    if (clear) {
      item.side = "above";
      item.left = above.left;
      item.top = above.top;
      settled.push(item);
    }
  }
  const right = tasks.filter((item) => item.side === "right");
  right.forEach((item) => {
    item.left = item.nx + (item.nr || 6) + gap;
  });
  for (let round = 0; round < 2; round += 1) {
    right.forEach((item) => stepRightPastDots(item, items, gap));
    stackRightTitles(right);
  }
  right.forEach((item) => stepRightPastDots(item, items, gap));
  /* Spokes fan out above You, so its title drops below the dot when one sits in the way. */
  const you = items.find((item) => item.kind === "start");
  if (!you) return;
  const midY = you.top + you.h / 2;
  const blocked = items.some((other) => {
    if (other === you) return false;
    const r = (other.nr || 6) + 3;
    const dotInBox =
      other.nx + r > you.left &&
      other.nx - r < you.left + you.w &&
      other.ny + r > you.top &&
      other.ny - r < you.top + you.h;
    if (dotInBox) return true;
    /* Every spoke is tethered to You; a line to a dot overhead can run through the title. */
    if (other.role === "task" || other.role === "mission" || other.ny >= midY) return false;
    const x = you.nx + ((other.nx - you.nx) * (you.ny - midY)) / (you.ny - other.ny);
    return x > you.left - 4 && x < you.left + you.w + 4;
  });
  if (blocked) {
    you.side = "below";
    you.top = you.ny + (you.nr || 6) + gap;
  }
}

/**
 * Node ids from one node to another along the drawn lines, shortest first.
 * @param {Array<{ from: string, to: string }>} edges
 * @param {string} fromId
 * @param {string} toId
 * @returns {string[]} empty when the two are not connected
 */
export function trailNodeIds(edges, fromId, toId) {
  if (!fromId || !toId) return [];
  /** @type {Map<string, string[]>} */
  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    links.get(a).push(b);
  };
  for (const { from, to } of edges) {
    if (!from || !to) continue;
    link(from, to);
    link(to, from);
  }
  /** @type {Map<string, string>} */
  const cameFrom = new Map([[fromId, ""]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (id === toId) break;
    for (const next of links.get(id) || []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, id);
      queue.push(next);
    }
  }
  if (!cameFrom.has(toId)) return [];
  const trail = [];
  for (let id = toId; id; id = cameFrom.get(id) || "") trail.unshift(id);
  return trail;
}

/**
 * Title sits on the node the way the constellation reference does:
 * mission titles above that mission's dot, task titles level with that task's dot.
 * @param {Array<{ nx: number, ny: number, nr: number, w: number, h: number, left: number, top: number, kind: string, role?: string, side?: string }>} items
 * @param {{ left: number, right: number, top?: number, bottom?: number } | null} [bounds] visible stage edges in screen px
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
    const dotInside =
      item.nx > bounds.left &&
      item.nx < bounds.right &&
      (bounds.top == null || item.ny >= bounds.top) &&
      (bounds.bottom == null || item.ny <= bounds.bottom);
    /* Once the dot leaves the band above the prompt, the title leaves with it. */
    if (!dotInside) {
      item.left = ideal;
      return;
    }
    if (stayAbove || Math.abs(clamped - ideal) <= 12) {
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
      placeAbove(item, 5);
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
