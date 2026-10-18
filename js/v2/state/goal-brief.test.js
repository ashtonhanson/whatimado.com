import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyJourney } from "./journey.js";
import { emptyUserProfile } from "./user-profile.js";
import {
  buildGoalBrief,
  buildSharedPromptContext,
  formatGoalBriefForPrompt,
  invalidateDownstreamWork,
  isExplicitGoalCorrection,
  refreshGoalBrief
} from "./goal-brief.js";

test("founder and employment fixtures produce different intent kinds", () => {
  const founder = buildGoalBrief({
    messages: [
      {
        role: "user",
        content:
          "I'm building whatimado for reentry testers. We're in closed beta looking for funding and design partners, not a job."
      }
    ],
    profile: emptyUserProfile()
  });
  const jobSeeker = buildGoalBrief({
    messages: [
      {
        role: "user",
        content: "I'm a designer looking for remote employment and interview help after burnout."
      }
    ],
    profile: emptyUserProfile()
  });
  assert.equal(founder.intentKind, "founder");
  assert.equal(jobSeeker.intentKind, "employment");
  assert.notEqual(formatGoalBriefForPrompt(founder), formatGoalBriefForPrompt(jobSeeker));
});

test("explicit correction bumps goal version and clears downstream work", () => {
  const journey = createEmptyJourney();
  journey.messages = [{ role: "user", content: "I need a job." }];
  journey.planConfirmed = true;
  journey.missionsStages = [{ label: "A", desc: "", missions: [{ title: "t", text: "x" }] }];
  let profile = emptyUserProfile();
  const first = refreshGoalBrief(journey, profile, null);
  profile = first.profile;
  assert.equal(first.nextVersion, 1);
  const corrected = refreshGoalBrief(journey, profile, null, {
    latestUserText: "Actually I meant I'm building an app, not looking for a job."
  });
  assert.equal(corrected.corrected, true);
  assert.equal(corrected.nextVersion, 2);
  assert.equal(journey.planConfirmed, false);
  assert.equal(journey.missionsStages.length, 0);
});

test("isExplicitGoalCorrection recognizes correction phrases", () => {
  assert.equal(isExplicitGoalCorrection("Actually I meant funding, not employment."), true);
  assert.equal(isExplicitGoalCorrection("What about teaching as a side path?"), false);
});

test("buildSharedPromptContext includes goal brief and intake chips", () => {
  const journey = createEmptyJourney();
  journey.goalBrief = buildGoalBrief({
    messages: [{ role: "user", content: "Need rent money and also finishing my app." }],
    profile: { ...emptyUserProfile(), skills: "React and product design" }
  });
  const block = buildSharedPromptContext({
    journey,
    profile: journey.goalBrief ? { ...emptyUserProfile(), skills: "React and product design" } : emptyUserProfile(),
    location: { city: "Austin", region: "TX", country: "US" }
  });
  assert.match(block, /GOAL BRIEF/);
  assert.match(block, /Known profile/);
});

test("invalidateDownstreamWork resets plan and mission artifacts", () => {
  const journey = createEmptyJourney();
  journey.planConfirmed = true;
  journey.planBullets = ["One"];
  journey.missionDrafts = [{ id: "d", kind: "notes", label: "Notes", missionTitle: "t", body: "b" }];
  invalidateDownstreamWork(journey);
  assert.equal(journey.planConfirmed, false);
  assert.equal(journey.planBullets.length, 0);
  assert.equal(journey.missionDrafts.length, 0);
});
