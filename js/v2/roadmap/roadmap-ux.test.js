import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueRoadmap, deleteMissionFromStages, dependentsOf, prerequisiteCheck } from "./mission-navigation.js";
import { canRoadmapUndo, popRoadmapUndo, pushRoadmapUndo } from "./roadmap-undo.js";
import { normalizeMissionFields } from "./mission-model.js";
import { normalizeJourney } from "../state/journey.js";

function journeyWithMissions(missions) {
  return {
    missionsStages: [{ label: "Week", desc: "", missions }],
    missionDrafts: [],
    taskChats: {},
    focusMissionId: missions[0]?.id || null,
    roadmapUndoStack: []
  };
}

describe("roadmap navigation", () => {
  it("continue marks bypassed without completing and focuses next task", () => {
    const a = normalizeMissionFields({ id: "a", title: "First" });
    const b = normalizeMissionFields({ id: "b", title: "Second" });
    const journey = journeyWithMissions([a, b]);
    const result = continueRoadmap(journey, "a");
    assert.equal(result.ok, true);
    assert.equal(result.focusId, "b");
    assert.equal(a.done, false);
    assert.equal(a.bypassed, true);
    assert.equal(b.bypassed, false);
  });

  it("continue preserves waiting state on skipped task", () => {
    const a = normalizeMissionFields({ id: "a", title: "Wait" });
    a.circleBack = { active: true, reason: "Reply", instructions: "", returnDate: "" };
    a.waiting = true;
    const b = normalizeMissionFields({ id: "b", title: "Next" });
    const journey = journeyWithMissions([a, b]);
    continueRoadmap(journey, "a");
    assert.equal(a.waiting, true);
    assert.equal(a.bypassed, false);
    assert.equal(journey.focusMissionId, "b");
  });

  it("blocks continue when explicit dependency is unfinished", () => {
    const a = normalizeMissionFields({ id: "a", title: "First" });
    const b = normalizeMissionFields({ id: "b", title: "Second", dependsOn: ["a"] });
    const journey = journeyWithMissions([a, b]);
    const blocked = continueRoadmap(journey, "a");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.blocked, true);
    assert.match(blocked.reason, /waits on/i);
    assert.equal(a.bypassed, false);
  });

  it("delete removes one mission and undo restores it with chats", () => {
    const mission = normalizeMissionFields({ id: "m1", title: "Only" });
    const journey = journeyWithMissions([mission]);
    journey.taskChats = { "path:m1": { messages: [{ role: "user", content: "note" }] } };
    pushRoadmapUndo(journey);
    journey.missionsStages = deleteMissionFromStages(journey.missionsStages, "m1");
    assert.equal(journey.missionsStages.length, 0);
    assert.equal(canRoadmapUndo(journey), true);
    const restored = popRoadmapUndo(journey);
    assert.equal(restored.ok, true);
    assert.equal(journey.missionsStages[0].missions[0].id, "m1");
    assert.equal(journey.taskChats["path:m1"].messages[0].content, "note");
  });

  it("normalizeJourney keeps focus and undo stack for reload", () => {
    const raw = {
      id: "j1",
      messages: [{ role: "user", content: "hi" }],
      focusMissionId: "m2",
      roadmapUndoStack: [{ missionsStages: [], missionDrafts: [], taskChats: {}, focusMissionId: null }],
      missionsStages: [{ label: "W", missions: [{ id: "m2", title: "T", text: "x" }] }]
    };
    const journey = normalizeJourney(raw);
    assert.equal(journey.focusMissionId, "m2");
    assert.equal(journey.roadmapUndoStack.length, 1);
  });

  it("undo reports empty stack", () => {
    const journey = journeyWithMissions([normalizeMissionFields({ id: "x", title: "X" })]);
    const result = popRoadmapUndo(journey);
    assert.equal(result.ok, false);
  });

  it("dependentsOf lists tasks that name a prerequisite id", () => {
    const stages = [
      {
        label: "S",
        missions: [
          normalizeMissionFields({ id: "root", title: "Root" }),
          normalizeMissionFields({ id: "child", title: "Child", dependsOn: ["root"] })
        ]
      }
    ];
    assert.equal(dependentsOf(stages, "root").length, 1);
    assert.equal(prerequisiteCheck(stages[0].missions[1], flatten(stages)).ok, false);

    function flatten(s) {
      return s.flatMap((stage) => stage.missions);
    }
  });
});
