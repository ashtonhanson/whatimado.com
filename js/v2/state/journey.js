import { PHASE } from "../phases.js";

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
 *   intakeComplete: boolean
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
    intakeComplete: false
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
    intakeComplete: Boolean(source.intakeComplete)
  };
}

export function isRestorableJourney(journey) {
  return Boolean(journey?.id && journey.messages.length);
}
