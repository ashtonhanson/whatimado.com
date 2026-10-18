import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCircleBack,
  flattenMissions,
  missionActionLines,
  missionContextStamp,
  normalizeMissionFields,
  setMissionDone
} from "./mission-model.js";

describe("mission model", () => {
  it("keeps whom, ask/do, and outcome distinct", () => {
    const mission = normalizeMissionFields({
      title: "Ask the studio",
      whom: "Front desk at a local print shop",
      askDo: "Ask whether they take commission referrals",
      outcome: "One yes/no and a name to email",
      text: "Fallback prose"
    });
    const lines = missionActionLines(mission);
    assert.match(lines.join("\n"), /Who to ask/);
    assert.match(lines.join("\n"), /What to ask/);
    assert.match(lines.join("\n"), /Outcome/);
    assert.equal(mission.whom.includes("@"), false);
  });

  it("persists independent completion and blocks done while waiting", () => {
    const a = normalizeMissionFields({ title: "A", text: "one" });
    const b = normalizeMissionFields({ title: "B", text: "two" });
    setMissionDone(a, true);
    assert.equal(b.done, false);
    applyCircleBack(b, { reason: "Awaiting reply", instructions: "Email again Friday" });
    setMissionDone(b, true);
    assert.equal(b.done, false);
    assert.equal(b.waiting, true);
  });

  it("circle back stamp invalidates draft context", () => {
    const mission = normalizeMissionFields({ title: "Follow up", text: "Send note" });
    const before = missionContextStamp(mission);
    applyCircleBack(mission, { reason: "Waiting on callback" });
    const after = missionContextStamp(mission);
    assert.notEqual(before, after);
  });

  it("flattenMissions preserves stage order", () => {
    const stages = [
      { label: "S1", missions: [normalizeMissionFields({ title: "First" })] },
      { label: "S2", missions: [normalizeMissionFields({ title: "Second" })] }
    ];
    assert.deepEqual(flattenMissions(stages).map((m) => m.title), ["First", "Second"]);
  });
});
