import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highlightIdsForChatFocus, resolveMapNodeActivation } from "./map-chat-focus.js";
import { missionNumberLabel, placeTitleBesideNode } from "../map/callouts.js";

function journey() {
  return {
    planConfirmed: true,
    roadmapPathId: "path-a",
    focusMissionId: "task-1",
    chatFocusId: "task-1"
  };
}

describe("chat focus and map highlight", () => {
  it("opens the clicked task context and highlights only that node", () => {
    const state = journey();
    const before = { ...state };
    const decision = resolveMapNodeActivation({ id: "task-2", type: "task" }, state);
    assert.equal(decision.action, "open-working-context");
    assert.equal(decision.chatFocusId, "task-2");
    assert.deepEqual(decision.highlightIds, ["task-2"]);
    assert.equal(decision.focusMissionId, "task-1");
    assert.equal(decision.roadmapPathId, "path-a");
    assert.equal(decision.changesProgress, false);
    assert.equal(decision.activatesRoadmap, false);
    assert.deepEqual(state, before);
    assert.deepEqual(highlightIdsForChatFocus(decision.chatFocusId), ["task-2"]);
  });

  it("opens a mission context on the mission node, not its first task", () => {
    const decision = resolveMapNodeActivation({ id: "milestone-1", type: "mission" }, journey());
    assert.equal(decision.action, "open-working-context");
    assert.equal(decision.contextType, "mission");
    assert.equal(decision.chatFocusId, "milestone-1");
    assert.deepEqual(decision.highlightIds, ["milestone-1"]);
    assert.equal(decision.focusMissionId, "task-1");
  });

  it("follows chat navigation so the highlight matches the newly focused task", () => {
    const navigated = "task-3";
    assert.deepEqual(highlightIdsForChatFocus(navigated), ["task-3"]);
    assert.deepEqual(highlightIdsForChatFocus(""), []);
  });
});

describe("alternate roadmap confirmation", () => {
  it("previews an alternate roadmap without activating it or moving progress", () => {
    const state = journey();
    const decision = resolveMapNodeActivation({ id: "path-b", type: "path" }, state, { openRoadmap: false });
    assert.equal(decision.action, "preview-alternate");
    assert.equal(decision.previewPathId, "path-b");
    assert.equal(decision.activatesRoadmap, false);
    assert.equal(decision.roadmapPathId, "path-a");
    assert.equal(decision.focusMissionId, "task-1");
    assert.deepEqual(decision.highlightIds, ["task-1"]);
    assert.equal(state.roadmapPathId, "path-a");
    assert.equal(state.focusMissionId, "task-1");
  });

  it("activates a roadmap only when the explicit use control asks for it", () => {
    const decision = resolveMapNodeActivation({ id: "path-b", type: "path" }, journey(), { openRoadmap: true });
    assert.equal(decision.action, "activate-roadmap");
    assert.equal(decision.activatesRoadmap, true);
    assert.equal(decision.roadmapPathId, "path-b");
    assert.equal(decision.focusMissionId, "task-1");
  });
});

function callout(partial) {
  return {
    nx: 0,
    ny: 0,
    nr: 8,
    w: 70,
    h: 14,
    left: 0,
    top: 0,
    kind: "sat",
    role: "",
    ...partial
  };
}

describe("label to node mapping", () => {
  it("keeps the mission title above the mission and the first task title on the first task", () => {
    const you = callout({ kind: "start", role: "", nx: 80, ny: 200, w: 24, h: 12 });
    const mission = callout({ role: "mission", nx: 220, ny: 200, w: 90, h: 28 });
    const firstTask = callout({ role: "task", nx: 220, ny: 218, w: 80, h: 14 });
    const secondTask = callout({ role: "task", nx: 220, ny: 260, w: 80, h: 14 });
    placeTitleBesideNode([you, mission, firstTask, secondTask], { left: 0, right: 800 }, { spineAbove: false });

    assert.equal(mission.side, "above");
    assert.ok(mission.top + mission.h < mission.ny - mission.nr, "mission title sits above its node");

    for (const task of [firstTask, secondTask]) {
      const labelMid = task.top + task.h / 2;
      assert.ok(Math.abs(labelMid - task.ny) < 1, "task title is level with its own node");
      assert.ok(
        Math.abs(labelMid - task.ny) < Math.abs(labelMid - mission.ny),
        "task title is nearer its task than the mission"
      );
    }
    assert.ok(firstTask.top > mission.ny, "first task title is not parked above the mission node");
  });

  it("aligns task titles on a phone layout without pulling the first task onto the mission", () => {
    const you = callout({ kind: "start", nx: 40, ny: 180, w: 20, h: 12 });
    const mission = callout({ role: "mission", nx: 180, ny: 180, w: 88, h: 28 });
    const firstTask = callout({ role: "task", nx: 180, ny: 196, w: 72, h: 14 });
    placeTitleBesideNode([you, mission, firstTask], { left: 0, right: 360 }, { spineAbove: true });
    assert.equal(mission.side, "above");
    assert.ok(Math.abs(firstTask.top + firstTask.h / 2 - firstTask.ny) < 1);
    assert.notEqual(firstTask.side, "above");
  });
});

describe("mission numbering", () => {
  it("numbers missions in roadmap order, separate from task indexes", () => {
    assert.equal(missionNumberLabel(0), "Mission 1");
    assert.equal(missionNumberLabel(1), "Mission 2");
    assert.equal(missionNumberLabel(2), "Mission 3");
    assert.notEqual(missionNumberLabel(0), "Task 1");
  });
});
