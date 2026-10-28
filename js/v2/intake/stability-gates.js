import { normalizeUserProfile } from "../state/user-profile.js";
import { STABILITY_CONTEXT } from "./persona-signals.js";

/**
 * Stability-first gates used later by roadmap generate/finalize.
 *
 * Unknown status only gates when the conversation actually signalled a need.
 * Otherwise a suppressed ID question would quietly push a senior engineer into
 * a shelter-and-documents roadmap.
 */

export function needsIdFirst(profile) {
  return normalizeUserProfile(profile).idStatus === "needs";
}

export function needsHousingFirst(profile) {
  return normalizeUserProfile(profile).housingStatus === "needs";
}

/** Confirmed transportation barrier. Unknown is not a need. */
export function needsTransportHelp(profile) {
  const status = normalizeUserProfile(profile).transportStatus;
  return status === "needs" || status === "limited";
}

/** Only a confirmed ID or housing need changes the order of first steps. */
export function shouldBlockJobBoards(profile) {
  return needsIdFirst(profile) || needsHousingFirst(profile);
}

/**
 * How missions, resources, and drafts should sound.
 * Professional paths default to a mid- or senior-level peer, not an entry-level template.
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 */
export function writingVoice(profile) {
  if (shouldBlockJobBoards(profile)) {
    return "Write in plain, respectful language someone can use the same day. Be specific about what to ask and what to write down. Do not sound like a job application or a form letter.";
  }
  return [
    "Default to a mid- or senior-level professional unless the profile clearly describes someone earlier in their career.",
    "Sound like a thoughtful person writing to a peer: conversational, specific, and brief.",
    "Use their real place, skills, and path. Do not invent employers, titles, or metrics.",
    "No corporate boilerplate, no “I hope this email finds you well,” no talk of being eager to learn, and no entry-level placeholders.",
    "Leave only unknown names and times in [brackets]."
  ].join(" ");
}

/**
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {string} [location]
 * @param {string | null} [pathMode]
 */
export function buildIntakeContextBlock(profile, location = "", pathMode = null) {
  const p = normalizeUserProfile(profile);
  const lines = [
    "Known profile (from intake chips — treat as facts):",
    p.idStatus ? `- ID: ${p.idStatus}` : "",
    p.housingStatus ? `- Housing: ${p.housingStatus}` : "",
    p.transportStatus ? `- Transport: ${p.transportStatus}` : "",
    p.dependentSupport ? `- Dependents: ${p.dependentSupport}` : "",
    p.incomeUrgency ? `- Income urgency: ${p.incomeUrgency}` : "",
    p.pathPreference ? `- Path preference: ${p.pathPreference}` : "",
    p.workMode ? `- Work / business setup: ${p.workMode}` : "",
    p.skills ? `- Skills: ${p.skills}` : "",
    p.goals ? `- Goals: ${p.goals}` : "",
    p.constraints ? `- Constraints: ${p.constraints}` : "",
    p.willingToRelocate ? `- Relocate: ${p.willingToRelocate}` : "",
    p.founderStage ? `- Founder stage: ${p.founderStage}` : "",
    p.name ? `- Name: ${p.name}` : "",
    location ? `- Location: ${location}` : "",
    pathMode ? `- Path mode: ${pathMode}` : "",
    location
      ? "Local fit: name places, programs, agencies, pay, and costs that exist in this person's own city and country, in that country's terms and currency."
      : ""
  ].filter(Boolean);

  if (needsHousingFirst(p) || needsIdFirst(p) || needsTransportHelp(p)) {
    lines.push("CONFIRMED BARRIERS ONLY. Add a step only for a need they confirmed or described.");
    if (needsHousingFirst(p)) {
      lines.push("They confirmed housing is a need. Include one concrete housing step, and keep their stated goal in the plan.");
    }
    if (needsIdFirst(p)) {
      lines.push("They confirmed ID or documents are a need. Include getting that sorted as its own step. Do not stall every other goal on it.");
    }
    if (needsTransportHelp(p)) {
      lines.push("They confirmed transportation is a barrier. Include a practical way to get around.");
    }
    lines.push("Do not add a housing, ID, or transportation task they did not confirm.");
  } else if (p.stabilityContext === STABILITY_CONTEXT.PROFESSIONAL) {
    lines.push(
      "This person presents as an experienced professional or operator.",
      "Do NOT raise ID, shelter, housing, or transportation steps unless they bring it up."
    );
  } else {
    lines.push(
      "No housing, ID, or transportation need is confirmed.",
      "Do NOT add shelter, housing, ID, document, or transportation tasks.",
      "An unanswered question is not evidence of a need.",
      "Needing income soon, or other financial pressure, is not homelessness and is not missing ID."
    );
  }
  lines.push(
    "Preserve the goals, skills, experience, and constraints they actually stated. Do not replace their plan with a default shelter checklist."
  );

  return lines.filter(Boolean).join("\n");
}
