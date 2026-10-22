import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highlightIdsForChatFocus, hoverChatTargetId, resolveMapNodeActivation, timelineShowsInOpenChat } from "./map-chat-focus.js";
import { missionNumberLabel, placeTitleBesideNode, wrapMapLabel } from "../map/callouts.js";

function journey() {
  return {
    planConfirmed: true,
    roadmapPathId: "path-a",
    focusMissionId: "task-1",
    chatFocusId: "task-1"
  };
}

function nodes() {
  return [
    { id: "milestone-0", type: "mission" },
    { id: "task-1", type: "task", parentId: "milestone-0", title: "Write the captions" },
    { id: "task-2", type: "task", parentId: "milestone-0", title: "Pick three pieces" },
    { id: "milestone-1", type: "mission" },
    { id: "task-3", type: "task", parentId: "milestone-1", title: "Write the captions" },
    { id: "task-4", type: "task", parentId: "milestone-1", title: "Write the captions" }
  ];
}

describe("chat focus and map highlight", () => {
  it("opens the clicked task and keeps its mission highlighted with it", () => {
    const state = { ...journey(), nodes: nodes() };
    const before = {
      planConfirmed: state.planConfirmed,
      roadmapPathId: state.roadmapPathId,
      focusMissionId: state.focusMissionId,
      chatFocusId: state.chatFocusId
    };
    const decision = resolveMapNodeActivation({ id: "task-2", type: "task" }, state);
    assert.equal(decision.action, "open-working-context");
    assert.equal(decision.chatFocusId, "task-2");
    assert.deepEqual(decision.highlightIds, ["milestone-0", "task-2"]);
    assert.equal(decision.focusMissionId, "task-1");
    assert.equal(decision.roadmapPathId, "path-a");
    assert.equal(decision.changesProgress, false);
    assert.equal(decision.activatesRoadmap, false);
    assert.equal(state.focusMissionId, before.focusMissionId);
    assert.equal(state.roadmapPathId, before.roadmapPathId);
    assert.deepEqual(highlightIdsForChatFocus(decision.chatFocusId, state.nodes, state.focusMissionId), [
      "milestone-0",
      "task-2"
    ]);
  });

  it("keeps the mission highlighted with the progress task that belongs to it", () => {
    const decision = resolveMapNodeActivation({ id: "milestone-0", type: "mission" }, { ...journey(), nodes: nodes() });
    assert.equal(decision.action, "open-working-context");
    assert.equal(decision.contextType, "mission");
    assert.equal(decision.chatFocusId, "milestone-0");
    assert.deepEqual(decision.highlightIds, ["milestone-0", "task-1"]);
    assert.equal(decision.focusMissionId, "task-1");
  });

  it("does not pull a task from another mission when the mission changes", () => {
    const graph = nodes();
    const switched = resolveMapNodeActivation({ id: "milestone-1", type: "mission" }, { ...journey(), nodes: graph });
    assert.deepEqual(switched.highlightIds, ["milestone-1"]);
    assert.deepEqual(highlightIdsForChatFocus("task-4", graph, "task-1"), ["milestone-1", "task-4"]);
    assert.notEqual(graph.find((node) => node.id === "task-3").title, "");
    assert.equal(graph.find((node) => node.id === "task-1").title, graph.find((node) => node.id === "task-4").title);
    assert.deepEqual(highlightIdsForChatFocus("task-3", graph, "task-1"), ["milestone-1", "task-3"]);
  });

  it("hover names the task id and leaves the persistent pair alone", () => {
    const graph = nodes();
    assert.equal(hoverChatTargetId(graph.find((node) => node.id === "task-4")), "task-4");
    assert.equal(hoverChatTargetId(graph.find((node) => node.id === "milestone-1")), "");
    assert.deepEqual(highlightIdsForChatFocus("task-2", graph, "task-1"), ["milestone-0", "task-2"]);
    assert.deepEqual(highlightIdsForChatFocus("", graph, "task-1"), []);
  });
});

describe("alternate roadmap confirmation", () => {
  it("previews an alternate roadmap without activating it or moving progress", () => {
    const state = { ...journey(), nodes: nodes() };
    const decision = resolveMapNodeActivation({ id: "path-b", type: "path" }, state, { openRoadmap: false });
    assert.equal(decision.action, "preview-alternate");
    assert.equal(decision.previewPathId, "path-b");
    assert.equal(decision.activatesRoadmap, false);
    assert.equal(decision.roadmapPathId, "path-a");
    assert.equal(decision.focusMissionId, "task-1");
    assert.deepEqual(decision.highlightIds, ["milestone-0", "task-1"]);
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
      assert.equal(task.side, "right");
      assert.ok(task.left > task.nx, "task title sits to the right of its node");
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
    assert.equal(firstTask.side, "right");
  });

  it("keeps an unused roadmap title to the right of its node", () => {
    const you = callout({ kind: "start", nx: 80, ny: 160, w: 24, h: 12 });
    const selected = callout({ kind: "main", nx: 220, ny: 160, w: 90, h: 16 });
    const unused = callout({ kind: "path", nx: 220, ny: 230, w: 180, h: 14 });
    placeTitleBesideNode([you, selected, unused], { left: 0, right: 280 }, { spineAbove: false });
    assert.equal(selected.side, "above");
    assert.equal(unused.side, "right");
    assert.ok(unused.left > unused.nx);
  });
});

describe("mission numbering", () => {
  it("numbers missions in roadmap order, separate from task indexes", () => {
    assert.deepEqual(wrapMapLabel("Write the captions"), ["Write the captions"]);
    assert.deepEqual(wrapMapLabel("Publish the portfolio page this week"), [
      "Publish the portfolio",
      "page this week"
    ]);
    assert.equal(missionNumberLabel(0), "Mission 1");
    assert.equal(missionNumberLabel(1), "Mission 2");
    assert.equal(missionNumberLabel(2), "Mission 3");
    assert.notEqual(missionNumberLabel(0), "Task 1");
  });
});

describe("roadmap timeline placement", () => {
  it("shows the timeline only inside the open roadmap chat", () => {
    const open = {
      roadmapPathId: "path-a",
      chatRoadmapId: "path-a",
      planConfirmed: true,
      page: ""
    };
    assert.equal(timelineShowsInOpenChat(open), true);
    assert.equal(timelineShowsInOpenChat({ ...open, page: "settings" }), false);
    assert.equal(timelineShowsInOpenChat({ ...open, page: "analytics" }), false);
    assert.equal(timelineShowsInOpenChat({ ...open, page: "notes" }), false);
    assert.equal(timelineShowsInOpenChat({ ...open, chatRoadmapId: "path-b" }), false);
    assert.equal(timelineShowsInOpenChat({ ...open, planConfirmed: false }), false);
    assert.equal(timelineShowsInOpenChat({ ...open, roadmapPathId: "" }), false);
  });
});
