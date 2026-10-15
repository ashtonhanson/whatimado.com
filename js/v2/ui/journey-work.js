import { PHASE } from "../phases.js";
import { readComposerDraftForCurrentScope } from "../state/composer-draft.js";

/**
 * Whether the visitor has meaningful progress beyond the default welcome shell.
 * @param {import("../state/journey.js").Journey | null | undefined} journey
 * @param {{ nodes?: { type?: string }[] } | null | undefined} graph
 * @param {{ composerText?: string, includeStoredDraft?: boolean }} [options]
 */
export function journeyHasActiveWork(journey, graph, options = {}) {
  const composerText =
    options.composerText ??
    (options.includeStoredDraft !== false ? readComposerDraftForCurrentScope() : "");
  if (String(composerText || "").trim()) return true;
  if (!journey) return false;

  if (journey.messages.some((m) => m.role === "user" && String(m.content || "").trim())) return true;
  if (journey.turnCount > 0) return true;
  if (journey.ghostDismissed && journey.messages.length > 0) return true;
  if (journey.profileIntakeStep) return true;
  if (journey.completedIntakeSteps?.length) return true;
  if (journey.intakeComplete) return true;
  if (journey.pathsGenerated) return true;
  if (journey.awaitingPathModeChoice) return true;
  if (journey.pathMode) return true;
  if (journey.selectedPathId) return true;
  if (journey.planConfirmed) return true;
  if (journey.missionsStages?.length) return true;
  if (journey.missionDrafts?.length) return true;
  if (journey.phase && journey.phase !== PHASE.OPEN && journey.id) return true;

  const nodes = graph?.nodes || [];
  if (nodes.some((node) => node.type === "path")) return true;

  return false;
}

/**
 * @param {{ mode?: string } | null | undefined} session
 * @param {{ sync?: string } | null | undefined} authState
 */
export function newMapConfirmMessage(session, authState) {
  let message =
    "Starting over clears this conversation and any unsent message in the composer.";
  if (session?.mode === "account") {
    message += " Other roadmaps already saved on your account are not deleted.";
    if (authState?.sync !== "ok") {
      message += " Your latest changes on this device may not be backed up yet.";
    }
  } else {
    message += " As a guest, the current map on this device will be replaced.";
  }
  return message;
}
