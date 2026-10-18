import { flattenMissions, isMissionReadyToWork } from "./mission-model.js";

/**
 * @param {{ dependsOn?: string[] }} mission
 */
export function missionDependsOn(mission) {
  if (!mission || !Array.isArray(mission.dependsOn)) return [];
  return mission.dependsOn.map((id) => String(id || "").trim()).filter(Boolean);
}

/**
 * @param {Array<{ missions?: object[] }>} stages
 * @param {string} missionId
 */
export function dependentsOf(stages, missionId) {
  return flattenMissions(stages).filter((mission) => missionDependsOn(mission).includes(missionId));
}

/**
 * @param {{ id?: string, dependsOn?: string[] }} mission
 * @param {Array<{ id?: string, title?: string, done?: boolean }>} all
 */
export function prerequisiteCheck(mission, all) {
  const deps = missionDependsOn(mission);
  if (!deps.length) return { ok: true };
  const byId = new Map(all.map((item) => [item.id, item]));
  const blocked = deps.filter((id) => !byId.get(id)?.done);
  if (!blocked.length) return { ok: true };
  const labels = blocked.map((id) => byId.get(id)?.title || id).join(", ");
  return { ok: false, reason: `This task waits on: ${labels}. Finish those first or return to them.` };
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @param {Array<{ missions?: object[] }>} stages
 */
export function effectiveFocusMissionId(journey, stages) {
  const all = flattenMissions(stages);
  const focus = typeof journey.focusMissionId === "string" ? journey.focusMissionId : "";
  if (focus && all.some((mission) => mission.id === focus)) return focus;
  const next = pickDefaultFocusMission(stages);
  if (next) journey.focusMissionId = next;
  return next || null;
}

/**
 * @param {Array<{ missions?: object[] }>} stages
 */
export function pickDefaultFocusMission(stages) {
  const all = flattenMissions(stages);
  const ready = all.find((mission) => isMissionReadyToWork(mission) && !mission.bypassed);
  if (ready?.id) return ready.id;
  const waiting = all.find((mission) => (mission.waiting || mission.circleBack?.active) && !mission.done);
  if (waiting?.id) return waiting.id;
  const open = all.find((mission) => !mission.done);
  return open?.id || null;
}

/**
 * @param {{ done?: boolean, waiting?: boolean, circleBack?: { active?: boolean }, bypassed?: boolean }} mission
 */
export function isMissionWaiting(mission) {
  return Boolean(mission?.waiting || mission?.circleBack?.active);
}

/**
 * Timeline / list status label.
 * @param {object} mission
 * @param {string | null} focusId
 */
export function missionStatusLabel(mission, focusId) {
  if (mission.done) return "Completed";
  if (isMissionWaiting(mission)) return "Waiting";
  if (mission.id === focusId) return "Now";
  if (mission.bypassed) return "Not completed";
  return "Later";
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @param {string} [fromMissionId] When omitted, uses current focus.
 * @returns {{ ok: true, focusId: string } | { ok: false, end?: boolean, blocked?: boolean, reason: string, focusId?: string }}
 */
export function continueRoadmap(journey, fromMissionId) {
  const stages = journey.missionsStages || [];
  const all = flattenMissions(stages);
  if (!all.length) return { ok: false, end: true, reason: "No tasks on this roadmap yet." };

  const focusId = fromMissionId || effectiveFocusMissionId(journey, stages) || all[0].id;
  const fromIndex = Math.max(0, all.findIndex((mission) => mission.id === focusId));
  const current = all[fromIndex];

  for (let index = fromIndex + 1; index < all.length; index += 1) {
    const candidate = all[index];
    if (candidate.done) continue;
    const gate = prerequisiteCheck(candidate, all);
    if (!gate.ok) {
      return { ok: false, blocked: true, reason: gate.reason, focusId: current?.id || focusId };
    }
    if (current && !current.done && !isMissionWaiting(current)) {
      current.bypassed = true;
    }
    journey.focusMissionId = candidate.id;
    candidate.bypassed = false;
    return { ok: true, focusId: candidate.id };
  }

  journey.focusMissionId = current?.id || focusId;
  return { ok: false, end: true, reason: "You reached the last task on this roadmap.", focusId: journey.focusMissionId };
}

/**
 * @param {Array<{ label?: string, desc?: string, missions?: object[] }>} stages
 * @param {string} missionId
 */
export function deleteMissionFromStages(stages, missionId) {
  return (stages || [])
    .map((stage) => ({
      ...stage,
      missions: (stage.missions || []).filter((mission) => mission.id !== missionId)
    }))
    .filter((stage) => stage.missions?.length);
}
