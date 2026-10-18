import { callAdvisor } from "../advisor.js";
import { buildSharedPromptContext } from "../state/goal-brief.js";
import { invalidateDraftsForMission, missionActionLines } from "./mission-model.js";

/**
 * @typedef {object} CircleBackRipple
 * @property {Array<{ id: string, text?: string, whom?: string, askDo?: string, outcome?: string, suggestedSteps?: string[] }>} missionPatches
 */

/**
 * Build prompt with real store context.
 * @param {import("./mission-model.js").RoadmapMission} mission
 * @param {string} stageLabel
 * @param {import("../state/journey.js").Journey} journey
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {import("../state/location.js").UserLocation | null} location
 */
export function buildCircleBackRipplePrompt(mission, stageLabel, journey, profile, location) {
  const cb = mission.circleBack || {};
  const lines = missionActionLines(mission).join("\n");
  const others = (journey.missionsStages || [])
    .flatMap((stage) => stage.missions || [])
    .filter((item) => item.id !== mission.id && !item.done)
    .map((item) => `- ${item.id}: ${item.title}`)
    .join("\n");
  return (
    `You are whatimado. The user paused one task and left notes. Propose ONLY edits grounded in those notes.\n` +
    `Never invent people, emails, phone numbers, eligibility, or career pivots. Never paste provider marketing copy.\n` +
    `Do not modify completed tasks. Leave fields out instead of guessing.\n` +
    `Return ONLY JSON: {"missionPatches":[{"id":"","text":"","whom":"","askDo":"","outcome":"","suggestedSteps":[]}]}\n\n` +
    `Waiting task (${mission.id}): ${mission.title}\n${lines}\n` +
    `Reason: ${cb.reason || ""}\nInstructions: ${cb.instructions || ""}\nReturn: ${cb.returnDate || ""}\n\n` +
    `Other open tasks:\n${others || "None"}\n\n` +
    buildSharedPromptContext({ journey, profile, location })
  );
}

/**
 * @param {string} raw
 * @returns {CircleBackRipple | null}
 */
export function parseCircleBackRipple(raw) {
  const match = String(raw || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    const patches = Array.isArray(data.missionPatches) ? data.missionPatches : [];
    return {
      missionPatches: patches
        .map((patch) => ({
          id: String(patch?.id || "").trim(),
          text: patch?.text ? String(patch.text).trim().slice(0, 600) : undefined,
          whom: patch?.whom ? String(patch.whom).trim().slice(0, 200) : undefined,
          askDo: patch?.askDo ? String(patch.askDo).trim().slice(0, 320) : undefined,
          outcome: patch?.outcome ? String(patch.outcome).trim().slice(0, 320) : undefined,
          suggestedSteps: Array.isArray(patch?.suggestedSteps)
            ? patch.suggestedSteps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 5)
            : undefined
        }))
        .filter((patch) => patch.id)
    };
  } catch {
    return null;
  }
}

/**
 * Apply explicit patches; skip unknown ids and completed missions.
 * @param {Array<{ missions: object[] }>} stages
 * @param {CircleBackRipple} ripple
 */
export function applyCircleBackRipple(stages, ripple) {
  if (!ripple?.missionPatches?.length) return stages;
  return (stages || []).map((stage) => ({
    ...stage,
    missions: (stage.missions || []).map((mission) => {
      if (mission.done) return mission;
      const patch = ripple.missionPatches.find((entry) => entry.id === mission.id);
      if (!patch) return mission;
      return {
        ...mission,
        text: patch.text ?? mission.text,
        whom: patch.whom ?? mission.whom,
        askDo: patch.askDo ?? mission.askDo,
        outcome: patch.outcome ?? mission.outcome,
        suggestedSteps: patch.suggestedSteps ?? mission.suggestedSteps
      };
    })
  }));
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @param {import("./mission-model.js").RoadmapMission} mission
 * @param {string} stageLabel
 */
export async function rippleCircleBackNotes(journey, mission, stageLabel) {
  invalidateDraftsForMission(journey, mission.id);
  const instructions = String(mission.circleBack?.instructions || "").trim();
  if (!instructions) return journey.missionsStages;
  try {
    const { appStore } = await import("../state/store.js");
    const raw = await callAdvisor(
      buildCircleBackRipplePrompt(mission, stageLabel, journey, appStore.profile, appStore.location),
      { maxTokens: 700, feature: "v2_circle_back" }
    );
    const ripple = parseCircleBackRipple(raw);
    if (!ripple) return journey.missionsStages;
    return applyCircleBackRipple(journey.missionsStages || [], ripple);
  } catch {
    return journey.missionsStages;
  }
}
