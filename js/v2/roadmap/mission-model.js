/**
 * Normalized mission fields for roadmaps (all path types).
 *
 * @typedef {object} CircleBackState
 * @property {boolean} active
 * @property {string} reason
 * @property {string} instructions
 * @property {string} returnDate ISO date or empty
 *
 * @typedef {object} RoadmapMission
 * @property {string} id
 * @property {string} title
 * @property {string} text
 * @property {string} whom
 * @property {string} askDo
 * @property {string} outcome
 * @property {boolean} done
 * @property {boolean} waiting
 * @property {CircleBackState} circleBack
 * @property {string[]} [suggestedSteps]
 * @property {string} [timelineNote]
 * @property {unknown[]} [resources]
 */

/** @returns {CircleBackState} */
export function emptyCircleBack() {
  return { active: false, reason: "", instructions: "", returnDate: "" };
}

/**
 * @param {unknown} raw
 * @param {number} missionIndex
 */
export function normalizeMissionFields(raw, missionIndex = 0) {
  const title = String(raw?.title || raw?.mission || "").trim().slice(0, 140);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const whom = String(raw?.whom || raw?.who || "").trim().slice(0, 200);
  const askDo = String(raw?.askDo || raw?.ask || raw?.action || "").trim().slice(0, 320);
  const outcome = String(raw?.outcome || raw?.output || "").trim().slice(0, 320);
  const text = String(raw?.text || "").trim().slice(0, 600);
  const circleRaw = raw?.circleBack && typeof raw.circleBack === "object" ? raw.circleBack : {};
  const circleBack = {
    active: Boolean(circleRaw.active ?? raw?.waiting),
    reason: String(circleRaw.reason || "").trim().slice(0, 400),
    instructions: String(circleRaw.instructions || "").trim().slice(0, 1200),
    returnDate: String(circleRaw.returnDate || raw?.returnDate || "").trim().slice(0, 32)
  };
  const waiting = Boolean(raw?.waiting || circleBack.active);
  return {
    id: typeof raw?.id === "string" && raw.id ? String(raw.id).slice(0, 64) : `m-${slug || missionIndex}`,
    title,
    text,
    whom,
    askDo,
    outcome,
    done: Boolean(raw?.done) && !waiting,
    waiting,
    circleBack,
    suggestedSteps: Array.isArray(raw?.suggestedSteps)
      ? raw.suggestedSteps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 5)
      : undefined,
    timelineNote: raw?.timelineNote ? String(raw.timelineNote).trim().slice(0, 240) : undefined,
    resources: raw?.resources
  };
}

/**
 * @param {RoadmapMission} mission
 */
export function missionActionLines(mission) {
  /** @type {string[]} */
  const lines = [];
  if (mission.whom) lines.push(`Who to ask: ${mission.whom}`);
  if (mission.askDo) lines.push(`What to ask or do: ${mission.askDo}`);
  if (mission.outcome) lines.push(`Outcome: ${mission.outcome}`);
  if (!lines.length && mission.text) lines.push(mission.text);
  return lines;
}

/**
 * @param {RoadmapMission} mission
 */
export function missionContextStamp(mission) {
  const cb = mission.circleBack || emptyCircleBack();
  return [
    mission.title,
    mission.text,
    mission.whom,
    mission.askDo,
    mission.outcome,
    cb.active ? "waiting" : "",
    cb.reason,
    cb.instructions,
    cb.returnDate,
    (mission.suggestedSteps || []).join("|"),
    mission.timelineNote || ""
  ].join("\n");
}

/**
 * @param {Array<{ missions?: RoadmapMission[] }>} stages
 */
export function flattenMissions(stages) {
  return (stages || []).flatMap((stage) => stage.missions || []);
}

/**
 * Waiting tasks stay open and do not block siblings.
 * @param {RoadmapMission} mission
 */
export function isMissionReadyToWork(mission) {
  if (!mission || mission.done) return false;
  if (mission.waiting || mission.circleBack?.active) return false;
  return true;
}

/**
 * @param {RoadmapMission} mission
 * @param {boolean} done
 */
export function setMissionDone(mission, done) {
  if (!mission) return;
  if (mission.waiting || mission.circleBack?.active) {
    mission.done = false;
    return;
  }
  mission.done = Boolean(done);
}

/**
 * @param {RoadmapMission} mission
 * @param {Partial<CircleBackState>} patch
 */
export function applyCircleBack(mission, patch) {
  if (!mission) return;
  const next = { ...emptyCircleBack(), ...(mission.circleBack || {}), ...patch };
  next.active = Boolean(next.reason.trim() || next.instructions.trim() || next.returnDate.trim());
  mission.circleBack = next;
  mission.waiting = next.active;
  if (next.active) mission.done = false;
}

/** @param {RoadmapMission} mission */
export function clearCircleBack(mission) {
  if (!mission) return;
  mission.circleBack = emptyCircleBack();
  mission.waiting = false;
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @param {string} missionId
 */
export function invalidateDraftsForMission(journey, missionId) {
  const stages = journey.missionsStages || [];
  let mission = null;
  for (const stage of stages) {
    mission = stage.missions?.find((item) => item.id === missionId) || mission;
  }
  if (!mission) return;
  const stamp = missionContextStamp(mission);
  journey.missionDrafts = (journey.missionDrafts || []).filter((draft) => draft.missionTitle !== mission.title);
}
