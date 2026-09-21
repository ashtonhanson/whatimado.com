import { PHASE } from "../phases.js";
import { normalizeResources } from "../roadmap/resources.js";

/** @typedef {import("../phases.js").Phase} Phase */
/** @typedef {{ role: "user"|"assistant", content: string }} JourneyMessage */
/** @typedef {{
 *   id: string | null,
 *   createdAt: number,
 *   updatedAt: number,
 *   phase: Phase,
 *   messages: JourneyMessage[],
 *   turnCount: number,
 *   ghostDismissed: boolean,
 *   pathsGenerated: boolean,
 *   selectedPathId: string | null,
 *   pathMode: "direct"|"flexible"|null,
 *   awaitingPathModeChoice: boolean,
 *   profileIntakeStep: string | null,
 *   clarifyingQuestionsAsked: number,
 *   locationConfirmed: boolean,
 *   intakeComplete: boolean,
 *   completedIntakeSteps: string[],
 *   mapChatType: "discuss"|"alter"|"redirect"|null,
 *   mapChatPathId: string | null,
 *   pathDirectionNote: string,
 *   mapFeedbackGiven: boolean,
 *   mapFeedbackSentiment: "yes"|"no"|null,
 *   planConfirmed: boolean,
 *   planBullets: string[],
 *   confirmGateAwaitingRevision: boolean,
 *   threadBreak: number | null,
 *   missionsStages: { label: string, desc: string, missions: { title: string, text: string }[] }[],
 *   missionResources: { name: string, org: string, details: string, url: string, phone: string }[]
 * }} Journey */

const PHASE_VALUES = new Set(Object.values(PHASE));

/** @returns {Journey} */
export function createEmptyJourney() {
  return {
    id: null,
    createdAt: 0,
    updatedAt: 0,
    phase: PHASE.OPEN,
    messages: [],
    turnCount: 0,
    ghostDismissed: false,
    pathsGenerated: false,
    selectedPathId: null,
    pathMode: null,
    awaitingPathModeChoice: false,
    profileIntakeStep: null,
    clarifyingQuestionsAsked: 0,
    locationConfirmed: false,
    intakeComplete: false,
    completedIntakeSteps: [],
    mapChatType: null,
    mapChatPathId: null,
    pathDirectionNote: "",
    mapFeedbackGiven: false,
    mapFeedbackSentiment: null,
    planConfirmed: false,
    planBullets: [],
    confirmGateAwaitingRevision: false,
    threadBreak: null,
    missionsStages: [],
    missionResources: []
  };
}

function newJourneyId() {
  return `jrn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * First prompt creates the journey id; later prompts just touch updatedAt.
 * @param {Journey} journey
 * @returns {Journey}
 */
export function ensureJourneyStarted(journey) {
  const now = Date.now();
  if (journey.id) {
    journey.updatedAt = now;
    return journey;
  }
  journey.id = newJourneyId();
  journey.createdAt = now;
  journey.updatedAt = now;
  return journey;
}

/** @param {unknown} phase @returns {Phase} */
function normalizePhase(phase) {
  const value = String(phase || "");
  return PHASE_VALUES.has(value) ? /** @type {Phase} */ (value) : PHASE.OPEN;
}

/**
 * @param {unknown} raw
 * @returns {JourneyMessage[]}
 */
function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const role = entry.role === "user" ? "user" : "assistant";
      const content = String(entry.content || "").trim();
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-200);
}

/**
 * @param {unknown} raw
 * @returns {Journey}
 */
export function normalizeJourney(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const messages = normalizeMessages(source.messages);
  const id = typeof source.id === "string" && source.id ? source.id : null;
  return {
    id,
    createdAt: Number(source.createdAt) || 0,
    updatedAt: Number(source.updatedAt) || 0,
    phase: normalizePhase(source.phase),
    messages,
    turnCount: Number(source.turnCount) || messages.filter((m) => m.role === "user").length,
    ghostDismissed: Boolean(source.ghostDismissed),
    pathsGenerated: Boolean(source.pathsGenerated),
    selectedPathId: typeof source.selectedPathId === "string" ? source.selectedPathId : null,
    pathMode: source.pathMode === "direct" || source.pathMode === "flexible" ? source.pathMode : null,
    awaitingPathModeChoice: Boolean(source.awaitingPathModeChoice),
    profileIntakeStep: typeof source.profileIntakeStep === "string" && source.profileIntakeStep ? source.profileIntakeStep : null,
    clarifyingQuestionsAsked: Number(source.clarifyingQuestionsAsked) || 0,
    locationConfirmed: Boolean(source.locationConfirmed),
    intakeComplete: Boolean(source.intakeComplete),
    completedIntakeSteps: Array.isArray(source.completedIntakeSteps)
      ? source.completedIntakeSteps.map((step) => String(step || "")).filter(Boolean)
      : [],
    mapChatType:
      source.mapChatType === "discuss" || source.mapChatType === "alter" || source.mapChatType === "redirect"
        ? source.mapChatType
        : null,
    mapChatPathId: typeof source.mapChatPathId === "string" && source.mapChatPathId ? source.mapChatPathId : null,
    pathDirectionNote: typeof source.pathDirectionNote === "string" ? source.pathDirectionNote.slice(0, 400) : "",
    mapFeedbackGiven: Boolean(source.mapFeedbackGiven),
    mapFeedbackSentiment: source.mapFeedbackSentiment === "yes" || source.mapFeedbackSentiment === "no" ? source.mapFeedbackSentiment : null,
    planConfirmed: Boolean(source.planConfirmed),
    planBullets: Array.isArray(source.planBullets)
      ? source.planBullets.map((bullet) => String(bullet || "").trim()).filter(Boolean).slice(0, 7)
      : [],
    confirmGateAwaitingRevision: Boolean(source.confirmGateAwaitingRevision),
    threadBreak: Number.isInteger(source.threadBreak) ? source.threadBreak : null,
    missionsStages: normalizeStages(source.missionsStages),
    missionResources: normalizeResources(source.missionResources)
  };
}

/**
 * @param {unknown} raw
 * @returns {{ label: string, desc: string, missions: { title: string, text: string }[] }[]}
 */
function normalizeStages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 4)
    .map((stage) => {
      const missions = Array.isArray(stage?.missions) ? stage.missions : Array.isArray(stage?.tasks) ? stage.tasks : [];
      return {
        label: String(stage?.label || "").trim().slice(0, 80),
        desc: String(stage?.desc || "").trim().slice(0, 320),
        missions: missions
          .slice(0, 4)
          .map((mission) => ({
            title: String(mission?.title || mission?.mission || "").trim().slice(0, 140),
            text: String(mission?.text || "").trim().slice(0, 600)
          }))
          .filter((mission) => mission.title)
      };
    })
    .filter((stage) => stage.label && stage.missions.length);
}

export function isRestorableJourney(journey) {
  return Boolean(journey?.id && journey.messages.length);
}
