import assert from "node:assert/strict";
import { advisorSoundsUncertain, parseAdvisorCheck } from "./ui.js";

const plain = parseAdvisorCheck("Here is a clear next step.");
assert.equal(plain.check, null);
assert.equal(plain.body, "Here is a clear next step.");

const withCheck = parseAdvisorCheck(
  "Sounds like weekend mobile work.\n\n[[check]]\nWhat might be off: You might mean weekdays instead.\nClarify: Are weekends required?\n[[/check]]"
);
assert.equal(withCheck.body, "Sounds like weekend mobile work.");
assert.equal(withCheck.check?.off, "You might mean weekdays instead.");
assert.equal(withCheck.check?.clarify, "Are weekends required?");

assert.equal(advisorSoundsUncertain("If I'm reading this right, you want remote work."), true);
assert.equal(advisorSoundsUncertain("Your next step is to list three local shops."), false);

console.log("ui.advisor-check.test.mjs: all assertions passed");
