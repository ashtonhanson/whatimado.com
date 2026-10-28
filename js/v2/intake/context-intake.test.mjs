import assert from "node:assert/strict";
import { emptyUserProfile, setUserProfileField } from "../state/user-profile.js";
import {
  shouldAskSituationQuestion,
  shouldSuppressHousingStep,
  shouldSuppressIdStep,
  shouldSuppressTransportStep
} from "./persona-signals.js";
import { nextChipStep } from "./profile-chips.js";
import { buildIntakeContextBlock, needsHousingFirst, needsIdFirst } from "./stability-gates.js";
import { fallbackIdeas } from "../map/ideas.js";
import { fallbackStages } from "../roadmap/missions.js";
import { fallbackPlanSummary } from "../roadmap/confirm-gate.js";

const designer =
  "I'm an experienced designer. I need income right away while I develop a website pilot.";
const housing = "I don't have a place to stay. I need housing before I can take on work.";
const missingId = "I don't have an ID yet, and I need to replace it before I can get hired.";

function chipsFor(text) {
  return {
    suppressId: shouldSuppressIdStep(text, { founder: false }),
    suppressHousing: shouldSuppressHousingStep(text, { founder: false }),
    suppressTransport: shouldSuppressTransportStep(text),
    askSituation: shouldAskSituationQuestion(text, { founder: false })
  };
}

const designerFlags = chipsFor(designer);
assert.equal(designerFlags.suppressId, true);
assert.equal(designerFlags.suppressHousing, true);
assert.equal(designerFlags.suppressTransport, true);
assert.equal(designerFlags.askSituation, true);
assert.equal(nextChipStep(emptyUserProfile(), designerFlags), "situation");

const designerStages = JSON.stringify(fallbackStages({ title: "Website pilot" }, emptyUserProfile()));
assert.equal(/place to stay|missing ID|shelter/i.test(designerStages), false);
const designerIdeas = fallbackIdeas(emptyUserProfile()).map((idea) => idea.title).join(" ");
assert.equal(/safe place|replace your id/i.test(designerIdeas), false);
const designerPlan = fallbackPlanSummary(emptyUserProfile(), "Website pilot").bullets.join(" ");
assert.equal(/place to stay|replace the id/i.test(designerPlan), false);
const designerContext = buildIntakeContextBlock(emptyUserProfile());
assert.match(designerContext, /not homelessness/i);
assert.doesNotMatch(designerContext, /STABILITY FIRST/i);

const unknown = setUserProfileField(emptyUserProfile(), "stabilityContext", "signals");
unknown.incomeUrgency = "immediate";
assert.equal(needsHousingFirst(unknown), false);
assert.equal(needsIdFirst(unknown), false);
assert.equal(/place to stay|missing ID/i.test(JSON.stringify(fallbackStages({ title: "Paid design work" }, unknown))), false);

const housingFlags = chipsFor(housing);
assert.equal(housingFlags.suppressHousing, false);
assert.equal(housingFlags.suppressId, true);
assert.equal(nextChipStep(emptyUserProfile(), housingFlags), "housing_status");
const housed = setUserProfileField(emptyUserProfile(), "housingStatus", "needs");
const housingTasks = fallbackStages({ title: "Paid design work" }, housed)[0].missions.map((mission) => mission.title);
assert.equal(housingTasks.some((title) => /place to stay/i.test(title)), true);
assert.equal(housingTasks.some((title) => /missing ID/i.test(title)), false);
assert.match(fallbackPlanSummary(housed, "Paid design work").bullets.join(" "), /place to stay/i);

const idFlags = chipsFor(missingId);
assert.equal(idFlags.suppressId, false);
assert.equal(idFlags.suppressHousing, true);
assert.equal(nextChipStep(emptyUserProfile(), idFlags), "id_status");
const needsPapers = setUserProfileField(emptyUserProfile(), "idStatus", "needs");
const idTasks = fallbackStages({ title: "Paid design work" }, needsPapers)[0].missions.map((mission) => mission.title);
assert.equal(idTasks.some((title) => /missing ID/i.test(title)), true);
assert.equal(idTasks.some((title) => /place to stay/i.test(title)), false);

console.log("context-intake.test.mjs: all assertions passed");
