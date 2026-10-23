import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { branchStepSvg, childOffset, collapseVerticalSpines } from "./spines.js";

describe("vertical spines", () => {
  it("draws one spine for a mission and keeps the horizontal links", () => {
    const nodes = [
      { id: "you", x: 0.2, y: 0.5 },
      { id: "path", x: 0.4, y: 0.5 },
      { id: "milestone-0", x: 0.55, y: 0.5 },
      { id: "task-1", x: 0.55, y: 0.62 },
      { id: "task-2", x: 0.55, y: 0.74 },
      { id: "task-3", x: 0.55, y: 0.86 }
    ];
    const edges = [
      { from: "you", to: "path" },
      { from: "path", to: "milestone-0" },
      { from: "milestone-0", to: "task-1" },
      { from: "milestone-0", to: "task-2" },
      { from: "milestone-0", to: "task-3" }
    ];
    const drawn = collapseVerticalSpines(edges, nodes);
    const vertical = drawn.filter((edge) => {
      const from = nodes.find((node) => node.id === edge.from);
      const to = nodes.find((node) => node.id === edge.to);
      return Math.abs(from.x - to.x) < 0.02;
    });
    assert.equal(vertical.length, 1);
    assert.equal(vertical[0].from, "milestone-0");
    assert.equal(vertical[0].to, "task-3");
    assert.ok(drawn.some((edge) => edge.from === "you" && edge.to === "path"));
    assert.ok(drawn.some((edge) => edge.from === "path" && edge.to === "milestone-0"));
  });

  it("collapses a chain of unused roadmaps into one spine", () => {
    const nodes = [
      { id: "chosen", x: 0.4, y: 0.4 },
      { id: "alt-1", x: 0.4, y: 0.55 },
      { id: "alt-2", x: 0.4, y: 0.7 }
    ];
    const edges = [
      { from: "chosen", to: "alt-1" },
      { from: "alt-1", to: "alt-2" },
      { from: "chosen", to: "milestone-0" }
    ];
    const drawn = collapseVerticalSpines(edges, [
      ...nodes,
      { id: "milestone-0", x: 0.6, y: 0.4 }
    ]);
    assert.deepEqual(
      drawn.map((edge) => `${edge.from}->${edge.to}`).sort(),
      ["chosen->alt-2", "chosen->milestone-0"]
    );
  });
});

describe("equal child gaps", () => {
  it("uses the same step from the parent to the first child and between children", () => {
    const step = 40;
    const offsets = [0, 1, 2].map((index) => childOffset(index, step));
    assert.deepEqual(offsets, [40, 80, 120]);
    assert.equal(offsets[0] - 0, offsets[1] - offsets[0]);
    assert.equal(offsets[1] - offsets[0], offsets[2] - offsets[1]);
  });

  it("uses one step for a one-line roadmap column and a one-line mission column", () => {
    const input = { lineCount: 1, linePx: 17.5, pxPerUnit: 0.5, nodeRadius: 17, minStep: 30 };
    const roadmap = branchStepSvg(input);
    const mission = branchStepSvg({ ...input });
    assert.equal(roadmap, mission);
    assert.ok(roadmap >= 17 * 2 + 10);
    const wrapped = branchStepSvg({ ...input, lineCount: 2 });
    assert.ok(wrapped > roadmap);
    const compact = branchStepSvg({ ...input, air: 0.35 });
    const roomy = branchStepSvg({ ...input, air: 1.2 });
    assert.ok(compact < roadmap);
    assert.ok(roomy > roadmap);
    assert.ok(roomy - roadmap < roadmap);
  });
});
