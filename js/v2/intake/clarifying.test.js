import assert from "node:assert/strict";
import test from "node:test";
import { buildClarifyingPrompt, lacksBasicResources, shouldAdvancePastClarifying } from "./clarifying.js";

const HOMELESS_DESIGNER = "I'm homeless and looking for a job. I know how to do graphic design and illustration.";

test("a homeless designer is never assumed to have a computer", () => {
  assert.equal(lacksBasicResources(HOMELESS_DESIGNER), true);
  assert.match(buildClarifyingPrompt(HOMELESS_DESIGNER), /Never assume they own or can privately use a computer/);
  const followUp = buildClarifyingPrompt(HOMELESS_DESIGNER, {
    turn: 2,
    transcript: `User: ${HOMELESS_DESIGNER}\n\nAdvisor: What can you reach today?\n\nUser: mostly my phone`
  });
  assert.match(followUp, /RESOURCE REALITY/);
});

test("housed users and advisor wording do not trigger the resource rule", () => {
  assert.equal(lacksBasicResources("I do graphic design from home and want more clients."), false);
  assert.equal(lacksBasicResources("I fix bikes", "Advisor: Is a shelter program helping you?\n\nUser: no, I have an apartment"), false);
  assert.doesNotMatch(buildClarifyingPrompt("I do graphic design from home and want more clients."), /RESOURCE REALITY/);
});

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
