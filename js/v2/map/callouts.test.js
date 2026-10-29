import assert from "node:assert/strict";
import test from "node:test";
import { placeTitlesAbove, trailNodeIds } from "./callouts.js";

test("sample titles sit above their dots and stay inside the screen", () => {
  const items = [
    { nx: 200, ny: 100, nr: 6, w: 40, h: 12, left: 0, top: 0 },
    { nx: 385, ny: 120, nr: 6, w: 70, h: 12, left: 0, top: 0 },
    { nx: 4, ny: 120, nr: 6, w: 60, h: 12, left: 0, top: 0 }
  ];
  placeTitlesAbove(items, { left: 0, right: 390 });
  assert.equal(items[0].left, 180);
  assert.ok(items[0].top + items[0].h <= 100 - 6);
  assert.ok(items[1].left + items[1].w <= 390 - 8);
  assert.ok(items[2].left >= 8);
  assert.ok(items.every((item) => item.side === "above"));
});

test("trail runs from You through the roadmap and mission down to the task", () => {
  const edges = [
    { from: "start", to: "option-settings" },
    { from: "start", to: "path-a" },
    { from: "start", to: "path-b" },
    { from: "path-a", to: "milestone-0" },
    { from: "milestone-0", to: "milestone-1" },
    { from: "milestone-1", to: "t1" },
    { from: "t1", to: "t2" }
  ];
  assert.deepEqual(trailNodeIds(edges, "start", "t2"), ["start", "path-a", "milestone-0", "milestone-1", "t1", "t2"]);
  assert.deepEqual(trailNodeIds(edges, "start", "milestone-0"), ["start", "path-a", "milestone-0"]);
  assert.deepEqual(trailNodeIds(edges, "start", "missing"), []);
});
