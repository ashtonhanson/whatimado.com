import { missionContextStamp } from "./mission-model.js";

/** @typedef {{
 *   missionsStages: unknown[],
 *   missionDrafts: unknown[],
 *   taskChats: Record<string, unknown>,
 *   focusMissionId: string | null
 * }} RoadmapUndoSnapshot */

export const ROADMAP_UNDO_MAX = 25;

/** @param {unknown} value */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @returns {RoadmapUndoSnapshot}
 */
export function snapshotRoadmapState(journey) {
  return {
    missionsStages: clone(journey.missionsStages || []),
    missionDrafts: clone(journey.missionDrafts || []),
    taskChats: clone(journey.taskChats || {}),
    focusMissionId: typeof journey.focusMissionId === "string" ? journey.focusMissionId : null
  };
}

/**
 * @param {import("../state/journey.js").Journey} journey
 */
export function pushRoadmapUndo(journey) {
  if (!Array.isArray(journey.roadmapUndoStack)) journey.roadmapUndoStack = [];
  journey.roadmapUndoStack.push(snapshotRoadmapState(journey));
  if (journey.roadmapUndoStack.length > ROADMAP_UNDO_MAX) journey.roadmapUndoStack.shift();
}

/**
 * @param {import("../state/journey.js").Journey} journey
 */
export function canRoadmapUndo(journey) {
  return Boolean(journey.roadmapUndoStack?.length);
}

/**
 * Drop generated drafts that no longer match restored mission context.
 * @param {import("../state/journey.js").Journey} journey
 * @param {unknown[]} drafts
 */
function reconcileDraftsAfterRestore(journey, drafts) {
  const missions = (journey.missionsStages || []).flatMap((stage) => stage.missions || []);
  const byTitle = new Map(missions.map((mission) => [mission.title, mission]));
  return (drafts || [])
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const draft = /** @type {{ missionTitle?: string, contextStamp?: string, body?: string }} */ (raw);
      const mission = byTitle.get(String(draft.missionTitle || ""));
      if (!mission?.title || !draft.body) return null;
      const stamp = missionContextStamp(mission);
      if (draft.contextStamp && draft.contextStamp !== stamp) return null;
      return { ...draft, contextStamp: stamp };
    })
    .filter(Boolean);
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function popRoadmapUndo(journey) {
  const stack = journey.roadmapUndoStack;
  if (!Array.isArray(stack) || !stack.length) {
    return { ok: false, reason: "Nothing to undo." };
  }
  const snap = /** @type {RoadmapUndoSnapshot} */ (stack.pop());
  journey.missionsStages = clone(snap.missionsStages) || [];
  journey.taskChats = clone(snap.taskChats) || {};
  journey.focusMissionId = snap.focusMissionId || null;
  journey.missionDrafts = reconcileDraftsAfterRestore(journey, snap.missionDrafts);
  return { ok: true };
}
