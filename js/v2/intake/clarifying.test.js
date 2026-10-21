import assert from "node:assert/strict";
import test from "node:test";
import { shouldAdvancePastClarifying } from "./clarifying.js";

test("the first ability answer does not end the conversation", () => {
  assert.equal(shouldAdvancePastClarifying("I can cook and I like fixing bikes", 1), false);
  assert.equal(shouldAdvancePastClarifying("yes I cook", 1), false);
});

test("a later yes means the restatement was right", () => {
  assert.equal(shouldAdvancePastClarifying("yes, that's right", 2), true);
  assert.equal(shouldAdvancePastClarifying("No, I meant teaching, not cooking", 2), false);
});

test("the user can ask to move on after the first question", () => {
  assert.equal(shouldAdvancePastClarifying("that's all, let's continue", 1), true);
  assert.equal(shouldAdvancePastClarifying("move on", 0), false);
});
