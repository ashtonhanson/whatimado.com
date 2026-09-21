import assert from "node:assert/strict";
import {
  classifyStabilityContext,
  isClosedTestingFlow,
  shouldSuppressHousingStep,
  shouldSuppressIdStep
} from "./persona-signals.js";
import { isFounderOrProjectPrompt } from "./clarifying.js";
import { emptyUserProfile } from "../state/user-profile.js";
import { nextChipStep, parseFounderStage } from "./profile-chips.js";

function firstChip(text, extra = {}) {
  const founder = extra.founder ?? isFounderOrProjectPrompt(text);
  return nextChipStep(emptyUserProfile(), {
    founder,
    suppressId: shouldSuppressIdStep(text, { founder }),
    suppressHousing: shouldSuppressHousingStep(text, { founder })
  });
}

const closedDataPro =
  "I'm building whatimado for people in reentry. We're in closed data testing with a few trusted testers watching sessions — not a public launch.";

const careerPro =
  "I've spent 12 years as a senior engineer. I led a team of 6 and shipped three products. Burned out, looking at my next chapter.";

const shelter =
  "I just got out after four years and I'm staying at a shelter. No ID yet and I need work.";

const mixedProductAndSelf =
  "I'm building a reentry platform and I just got out of prison last month. I still don't have a state ID.";

const vague = "I want to figure out what to do next with my life.";

// Closed data / professional — must bypass ID (main-site behavior)
assert.equal(isClosedTestingFlow(closedDataPro), true);
assert.equal(isFounderOrProjectPrompt(closedDataPro), true);
assert.equal(classifyStabilityContext(closedDataPro, { founder: true }), "professional");
assert.equal(shouldSuppressIdStep(closedDataPro, { founder: true }), true);
assert.notEqual(firstChip(closedDataPro), "id_status");
assert.notEqual(firstChip(closedDataPro), "housing_status");
assert.equal(parseFounderStage("closed data testing"), "beta");
assert.equal(parseFounderStage("closed beta with 3 testers"), "beta");

assert.equal(shouldSuppressIdStep(careerPro, { founder: false }), true);
assert.notEqual(firstChip(careerPro), "id_status");

// Risky / unknown — must enter ID
assert.equal(shouldSuppressIdStep(shelter, { founder: false }), false);
assert.equal(firstChip(shelter), "id_status");
assert.equal(classifyStabilityContext(shelter, { founder: false }), "signals");

// First-person hardship still wins even on a founder prompt
assert.equal(shouldSuppressIdStep(mixedProductAndSelf, { founder: true }), false);
assert.equal(firstChip(mixedProductAndSelf), "id_status");

// Neutral / vague — opt-in like main, do not start with ID
assert.equal(shouldSuppressIdStep(vague, { founder: false }), true);
assert.notEqual(firstChip(vague), "id_status");

// Product-audience reentry without first-person need is trusted
const audienceOnly =
  "Grant-funded workforce program building a possibility map for reentry and jail-to-work transitions. Closed beta next month.";
assert.equal(shouldSuppressIdStep(audienceOnly, { founder: isFounderOrProjectPrompt(audienceOnly) }), true);
assert.notEqual(firstChip(audienceOnly), "id_status");

console.log("persona-signals.test.mjs: all assertions passed");
