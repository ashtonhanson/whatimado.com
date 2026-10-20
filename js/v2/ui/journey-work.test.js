import assert from "node:assert/strict";
import test from "node:test";
import { PHASE } from "../phases.js";
import { createEmptyJourney } from "../state/journey.js";
import { journeyHasActiveWork, newMapConfirmMessage } from "./journey-work.js";

test("empty welcome state has no active work", () => {
  const journey = createEmptyJourney();
  assert.equal(journeyHasActiveWork(journey, { nodes: [] }, { composerText: "", includeStoredDraft: false }), false);
});

test("unsent composer draft counts as active work", () => {
  const journey = createEmptyJourney();
  assert.equal(journeyHasActiveWork(journey, { nodes: [] }, { composerText: "still typing" }), true);
});

test("submitted intake progress counts as active work", () => {
  const journey = createEmptyJourney();
  journey.id = "jrn_1";
  journey.messages.push({ role: "user", content: "I need a path" });
  assert.equal(journeyHasActiveWork(journey, { nodes: [] }), true);
});

test("generated path nodes count as active work", () => {
  const journey = createEmptyJourney();
  journey.id = "jrn_1";
  const graph = { nodes: [{ id: "p1", type: "path" }] };
  assert.equal(journeyHasActiveWork(journey, graph), true);
});

test("roadmap missions count as active work", () => {
  const journey = createEmptyJourney();
  journey.id = "jrn_1";
  journey.planConfirmed = true;
  journey.missionsStages = [{ label: "Week 1", desc: "", missions: [{ title: "Step", text: "Do it" }] }];
  assert.equal(journeyHasActiveWork(journey, { nodes: [] }), true);
});

test("guest confirm copy does not promise cloud backup", () => {
  const message = newMapConfirmMessage({ mode: "guest" }, { sync: "idle" });
  assert.match(message, /guest/i);
  assert.doesNotMatch(message, /backed up yet/i);
});

test("signed-in confirm copy mentions other saved roadmaps and cautious sync wording", () => {
  const message = newMapConfirmMessage({ mode: "account", userId: "u1" }, { sync: "error" });
  assert.match(message, /not deleted/i);
  assert.match(message, /may not be backed up/i);
});

test("signed-in sync ok does not warn about missing backup", () => {
  const message = newMapConfirmMessage({ mode: "account", userId: "u1" }, { sync: "ok" });
  assert.doesNotMatch(message, /may not be backed up/i);
});
