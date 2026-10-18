import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskCoachPrompt,
  getTaskThread,
  normalizeTaskChats,
  taskChatStorageKey
} from "./task-chat.js";
import { createEmptyJourney, normalizeJourney } from "../state/journey.js";

test("taskChatStorageKey scopes threads to roadmap path and mission", () => {
  assert.equal(taskChatStorageKey("path-a", "mission-1"), "path-a:mission-1");
  assert.notEqual(taskChatStorageKey("path-a", "mission-1"), taskChatStorageKey("path-b", "mission-1"));
});

test("normalizeTaskChats drops empty threads and caps draft length", () => {
  const out = normalizeTaskChats({
    "p:m1": { messages: [{ role: "user", content: "Hi" }], composerDraft: "draft" },
    empty: { messages: [], composerDraft: "" },
    bad: null
  });
  assert.equal(Object.keys(out).length, 1);
  assert.equal(out["p:m1"].messages[0].content, "Hi");
  assert.equal(out["p:m1"].composerDraft, "draft");
});

test("getTaskThread keeps separate histories per key", () => {
  const journey = createEmptyJourney();
  const a = getTaskThread(journey, "path:one");
  const b = getTaskThread(journey, "path:two");
  a.messages.push({ role: "user", content: "A" });
  b.messages.push({ role: "user", content: "B" });
  assert.equal(a.messages.length, 1);
  assert.equal(b.messages.length, 1);
  assert.equal(a.messages[0].content, "A");
  assert.equal(b.messages[0].content, "B");
});

test("normalizeJourney restores taskChats", () => {
  const journey = normalizeJourney({
    taskChats: {
      "x:y": { messages: [{ role: "assistant", content: "ok" }] }
    }
  });
  assert.ok(journey.taskChats["x:y"]);
  assert.equal(journey.taskChats["x:y"].messages[0].content, "ok");
});

test("buildTaskCoachPrompt includes task id, status and thread", () => {
  const prompt = buildTaskCoachPrompt({
    missionId: "m-42",
    missionTitle: "Call shelter",
    missionText: "Dial the number",
    missionDone: false,
    pathTitle: "Housing path",
    question: "What should I say?",
    thread: { messages: [{ role: "user", content: "Earlier" }], composerDraft: "" }
  });
  assert.match(prompt, /Task id: m-42/);
  assert.match(prompt, /not done yet/);
  assert.match(prompt, /Call shelter/);
  assert.match(prompt, /Earlier/);
  assert.match(prompt, /What should I say\?/);
});
