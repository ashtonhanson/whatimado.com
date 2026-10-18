import { isFounderOrProjectPrompt } from "../intake/clarifying.js";
import { isClosedTestingFlow } from "../intake/persona-signals.js";
import { buildIntakeContextBlock } from "../intake/stability-gates.js";
import { formatUserLocation } from "./location.js";
import { normalizeUserProfile, setUserProfileField } from "./user-profile.js";

/** @typedef {{
 *   version: number,
 *   intent: string,
 *   outcomes: string,
 *   background: string,
 *   skillsInterests: string,
 *   constraints: string,
 *   locationPreference: string,
 *   unknowns: string,
 *   lastCorrection: string,
 *   intentKind: "founder"|"employment"|"explore"|"mixed"|"unknown",
 *   updatedAt: number
 * }} GoalBrief */

const CORRECTION_PATTERN =
  /\b(actually|correction|i meant|forget that|instead|rather than|not (?:a|an) job|not looking for (?:a )?job|my real goal|what i really want)\b/i;

/**
 * @param {unknown} raw
 * @returns {GoalBrief}
 */
export function normalizeGoalBrief(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const intentKind = source.intentKind;
  return {
    version: Math.max(1, Number(source.version) || 1),
    intent: String(source.intent || "").slice(0, 1200),
    outcomes: String(source.outcomes || "").slice(0, 600),
    background: String(source.background || "").slice(0, 600),
    skillsInterests: String(source.skillsInterests || "").slice(0, 600),
    constraints: String(source.constraints || "").slice(0, 600),
    locationPreference: String(source.locationPreference || "").slice(0, 200),
    unknowns: String(source.unknowns || "").slice(0, 400),
    lastCorrection: String(source.lastCorrection || "").slice(0, 400),
    intentKind:
      intentKind === "founder" ||
      intentKind === "employment" ||
      intentKind === "explore" ||
      intentKind === "mixed"
        ? intentKind
        : "unknown",
    updatedAt: Number(source.updatedAt) || 0
  };
}

/** @param {string} blob */
function classifyIntentKind(blob) {
  const text = String(blob || "").toLowerCase();
  const founder =
    isFounderOrProjectPrompt(blob) ||
    isClosedTestingFlow(blob) ||
    /\b(funding|investor|beta users|go-to-market|startup|build(?:ing)? (?:a|an|my) (?:app|product|platform|business))\b/.test(text);
  const rejectsEmployment = /\bnot (?:a |an )?(?:job|employment|hire)\b|\bnot looking for (?:a )?job\b/.test(text);
  const employment =
    !rejectsEmployment &&
    /\b(job|hire|employment|salary|career change|get hired|interview|resume|linkedin|remote work|full[- ]time)\b/.test(text);
  const explore = /\b(explore|not sure|figure out|options|what if|trying to decide|uncertain)\b/.test(text);
  if (founder && employment) return "mixed";
  if (founder) return "founder";
  if (employment && !explore) return "employment";
  if (explore && !employment) return "explore";
  if (employment && explore) return "mixed";
  return "unknown";
}

/** @param {string} blob @param {import("./user-profile.js").UserProfile} profile */
function inferIntentStatement(blob, profile) {
  const kind = classifyIntentKind(blob);
  if (profile.founderStage && kind !== "employment") {
    return "Build or grow their product/project (founder or builder intent — not assumed to be job-seeking).";
  }
  if (kind === "founder") {
    return "Build or grow a product, site, or venture (founder/builder intent).";
  }
  if (kind === "employment") {
    return "Find paid work or a job that fits their situation.";
  }
  if (kind === "explore") {
    return "Explore realistic options before committing to one direction.";
  }
  if (kind === "mixed") {
    return "Pursue more than one priority (e.g. income plus a longer-term project); keep both visible.";
  }
  const first = blob.split("\n").map((line) => line.trim()).find(Boolean);
  return first ? first.slice(0, 280) : "Goal not fully stated yet — use their words from the conversation.";
}

/** @param {import("./user-profile.js").UserProfile} profile @param {import("./location.js").UserLocation | null | undefined} location */
function buildConstraints(profile, location) {
  const parts = [];
  if (profile.incomeUrgency) parts.push(`Income urgency: ${profile.incomeUrgency}`);
  if (profile.transportStatus) parts.push(`Transport: ${profile.transportStatus}`);
  if (profile.dependentSupport) parts.push(`Dependents/childcare: ${profile.dependentSupport}`);
  if (profile.idStatus) parts.push(`ID status: ${profile.idStatus}`);
  if (profile.housingStatus) parts.push(`Housing: ${profile.housingStatus}`);
  if (profile.pathPreference) parts.push(`Path preference: ${profile.pathPreference}`);
  if (profile.willingToRelocate) parts.push(`Relocate: ${profile.willingToRelocate}`);
  const place = formatUserLocation(location);
  if (place) parts.push(`Location: ${place}`);
  return parts.join("; ");
}

/**
 * @param {{
 *   messages?: { role: string, content: string }[],
 *   profile?: import("./user-profile.js").UserProfile,
 *   location?: import("./location.js").UserLocation | null,
 *   pathDirectionNote?: string,
 * }} input
 * @returns {GoalBrief}
 */
export function buildGoalBrief(input) {
  const profile = normalizeUserProfile(input.profile);
  const userBlob = (input.messages || [])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n")
    .slice(0, 6000);
  const intentKind = classifyIntentKind(userBlob);
  const intent = inferIntentStatement(userBlob, profile);
  const direction = String(input.pathDirectionNote || "").trim();
  const backgroundParts = [];
  if (profile.skills) backgroundParts.push(`Skills/experience (background, not necessarily target job): ${profile.skills}`);
  if (profile.founderStage) backgroundParts.push(`Founder/project stage: ${profile.founderStage}`);
  if (profile.workMode) backgroundParts.push(`Work setup preference: ${profile.workMode}`);

  const unknowns = [];
  if (!userBlob.trim()) unknowns.push("User has not described their situation in chat yet.");
  if (!profile.skills) unknowns.push("Skills/interests not captured yet.");
  if (!formatUserLocation(input.location) && !profile.willingToRelocate) unknowns.push("Location not confirmed.");

  return normalizeGoalBrief({
    version: 1,
    intent: direction ? `${intent} Direction note: ${direction.slice(0, 300)}` : intent,
    outcomes: "",
    background: backgroundParts.join(" "),
    skillsInterests: profile.skills || "",
    constraints: buildConstraints(profile, input.location),
    locationPreference: profile.workMode === "remote" ? "Remote-friendly options preferred." : formatUserLocation(input.location) || "",
    unknowns: unknowns.join(" "),
    lastCorrection: "",
    intentKind,
    updatedAt: Date.now()
  });
}

/** @param {string} text */
export function isExplicitGoalCorrection(text) {
  return CORRECTION_PATTERN.test(String(text || "").trim());
}

/**
 * Refresh journey goal brief and profile summary fields. Bumps goalVersion on explicit correction.
 * @param {import("./journey.js").Journey} journey
 * @param {import("./user-profile.js").UserProfile} profile
 * @param {import("./location.js").UserLocation | null | undefined} location
 * @param {{ latestUserText?: string }} [options]
 * @returns {{ corrected: boolean, previousVersion: number, nextVersion: number, profile: import("./user-profile.js").UserProfile }}
 */
export function refreshGoalBrief(journey, profile, location, options = {}) {
  const previousVersion = Number(journey.goalVersion) || 1;
  let nextVersion = previousVersion;
  const latest = String(options.latestUserText || "").trim();
  const corrected = isExplicitGoalCorrection(latest);
  if (corrected) nextVersion = previousVersion + 1;

  const brief = buildGoalBrief({
    messages: journey.messages,
    profile,
    location,
    pathDirectionNote: journey.pathDirectionNote
  });
  brief.version = nextVersion;
  if (corrected && latest) brief.lastCorrection = latest.slice(0, 400);
  brief.updatedAt = Date.now();

  journey.goalBrief = brief;
  journey.goalVersion = nextVersion;

  const summary = [
    brief.intent,
    brief.constraints ? `Constraints: ${brief.constraints}` : "",
    brief.background ? `Background: ${brief.background}` : ""
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 900);

  let nextProfile = setUserProfileField(profile, "summary", summary);
  nextProfile = setUserProfileField(nextProfile, "goals", brief.intent.slice(0, 400));
  nextProfile = setUserProfileField(nextProfile, "constraints", brief.constraints.slice(0, 400));

  if (corrected && nextVersion > (Number(journey.acceptedGoalVersion) || 0)) {
    invalidateDownstreamWork(journey);
  }

  return { corrected, previousVersion, nextVersion, profile: nextProfile };
}

/** @param {import("./journey.js").Journey} journey */
export function invalidateDownstreamWork(journey) {
  journey.planConfirmed = false;
  journey.planBullets = [];
  journey.missionsStages = [];
  journey.missionResources = [];
  journey.missionDrafts = [];
  journey.confirmGateAwaitingRevision = false;
}

/**
 * Mark successful path generation against current goal version.
 * @param {import("./journey.js").Journey} journey
 */
export function markPathsAcceptedForGoal(journey) {
  journey.acceptedGoalVersion = Number(journey.goalVersion) || 1;
  journey.pathsGoalVersion = journey.acceptedGoalVersion;
}

/**
 * Mark successful mission generation against current goal version.
 * @param {import("./journey.js").Journey} journey
 */
export function markMissionsAcceptedForGoal(journey) {
  journey.missionsGoalVersion = Number(journey.goalVersion) || 1;
  journey.acceptedGoalVersion = journey.missionsGoalVersion;
}

/** @param {GoalBrief | null | undefined} brief */
export function formatGoalBriefForPrompt(brief) {
  const b = normalizeGoalBrief(brief);
  if (!b.intent && !b.background && !b.constraints) {
    return "GOAL BRIEF: Unknown — rely on conversation, but do not invent a single employment/training/freelance template.";
  }
  return (
    `GOAL BRIEF (version ${b.version}; authoritative for intent — background is not automatically the job target):\n` +
    `- Intent: ${b.intent || "Unknown"}\n` +
    (b.outcomes ? `- Desired outcomes: ${b.outcomes}\n` : "") +
    (b.background ? `- Background: ${b.background}\n` : "") +
    (b.skillsInterests ? `- Skills/interests: ${b.skillsInterests}\n` : "") +
    (b.constraints ? `- Constraints: ${b.constraints}\n` : "") +
    (b.locationPreference ? `- Location/remote: ${b.locationPreference}\n` : "") +
    (b.unknowns ? `- Unknown or not asked yet: ${b.unknowns}\n` : "") +
    (b.lastCorrection ? `- Last explicit correction: ${b.lastCorrection}\n` : "") +
    `- Intent kind (heuristic): ${b.intentKind}\n` +
    `Preserve mixed or uncategorized goals. Do not collapse everything into generic employment, training, or freelance paths unless the user chose that.`
  );
}

/**
 * Shared profile chips + goal brief block for advisor prompts.
 * @param {{
 *   journey: import("./journey.js").Journey,
 *   profile: import("./user-profile.js").UserProfile,
 *   location?: import("./location.js").UserLocation | null,
 * }} ctx
 */
export function buildSharedPromptContext(ctx) {
  const profile = normalizeUserProfile(ctx.profile);
  const location = formatUserLocation(ctx.location);
  const intake = buildIntakeContextBlock(profile, location, ctx.journey.pathMode);
  const brief = formatGoalBriefForPrompt(ctx.journey.goalBrief);
  return `${brief}\n\n${intake}`;
}
