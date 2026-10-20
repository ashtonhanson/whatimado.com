/**
 * Chat-to-roadmap handoff for one mission.
 *
 * The chat may talk in sentences. Only the structured object below is written
 * onto the mission. Raw transcripts stay in the conversation and are not
 * copied into roadmap settings.
 *
 * @typedef {object} DifficultyUpdate
 * @property {string} title
 * @property {string} description
 * @property {string[]} suggested_steps
 * @property {string} timeline_adjustments
 */

/**
 * @param {{ title?: string, text?: string, done?: boolean, suggestedSteps?: string[], timelineNote?: string }} mission
 * @param {string} [stageLabel]
 */
export function buildDifficultyPrompt(mission, stageLabel = "") {
  const steps = Array.isArray(mission.suggestedSteps) ? mission.suggestedSteps.filter(Boolean).join("; ") : "";
  return [
    "You are whatimado, helping one person make a single mission easier to start.",
    "Rewrite this mission so it is clearer and smaller. Do not add a new life goal.",
    `Stage: ${stageLabel || "current stage"}`,
    `Title: ${mission.title || ""}`,
    `Description: ${mission.text || ""}`,
    `Already done: ${mission.done ? "yes" : "no"}`,
    steps ? `Existing steps: ${steps}` : "",
    mission.timelineNote ? `Timing note: ${mission.timelineNote}` : "",
    "Return ONLY JSON with this shape:",
    '{"title":"short action","description":"two concrete sentences","suggested_steps":["first small step","second small step"],"timeline_adjustments":"when to do it, or an empty string"}'
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {string} text
 * @returns {DifficultyUpdate | null}
 */
export function parseDifficultyUpdate(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    const title = String(data.title || "").trim().slice(0, 140);
    const description = String(data.description || "").trim().slice(0, 700);
    if (!title || !description) return null;
    const suggested_steps = Array.isArray(data.suggested_steps)
      ? data.suggested_steps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 5)
      : [];
    const timeline_adjustments = String(data.timeline_adjustments || "").trim().slice(0, 240);
    return { title, description, suggested_steps, timeline_adjustments };
  } catch {
    return null;
  }
}

/**
 * Used when the advisor cannot be reached. Still a structured rewrite, not a transcript.
 * @param {{ title?: string, text?: string }} mission
 * @returns {DifficultyUpdate}
 */
export function fallbackDifficultyUpdate(mission) {
  const title = String(mission.title || "This mission").trim();
  const text = String(mission.text || "").trim();
  const first = text.split(/(?<=\.)\s+/)[0] || text || "Do the smallest piece you can finish today.";
  return {
    title: title.startsWith("Start smaller:") ? title : `Start smaller: ${title}`.slice(0, 140),
    description: `Do only this first: ${first}`.slice(0, 700),
    suggested_steps: [first.slice(0, 180)],
    timeline_adjustments: "Give this one sitting, then stop."
  };
}

/**
 * Copy structured fields onto the matching mission. Other missions are unchanged.
 * @param {Array<{ missions: object[] }>} stages
 * @param {string} missionId
 * @param {DifficultyUpdate} update
 */
export function applyStructuredMissionUpdate(stages, missionId, update) {
  return (stages || []).map((stage) => ({
    ...stage,
    missions: (stage.missions || []).map((mission) => {
      if (mission.id !== missionId) return mission;
      return {
        ...mission,
        title: update.title,
        text: update.description,
        suggestedSteps: update.suggested_steps,
        timelineNote: update.timeline_adjustments
      };
    })
  }));
}
