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
  const p = normalizeUserProfile(profile);
  if (p.idStatus === "needs") return true;
  if (p.idStatus === "has") return false;
  return p.stabilityContext === STABILITY_CONTEXT.SIGNALS;
}

export function needsHousingFirst(profile) {
  const p = normalizeUserProfile(profile);
  if (p.housingStatus === "needs") return true;
  if (p.housingStatus === "has") return false;
  return p.stabilityContext === STABILITY_CONTEXT.SIGNALS;
}

/** If ID or housing is not confirmed `has`, never open with job boards. */
export function shouldBlockJobBoards(profile) {
  return needsIdFirst(profile) || needsHousingFirst(profile);
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
    p.willingToRelocate ? `- Relocate: ${p.willingToRelocate}` : "",
    p.founderStage ? `- Founder stage: ${p.founderStage}` : "",
    p.name ? `- Name: ${p.name}` : "",
    location ? `- Location: ${location}` : "",
    pathMode ? `- Path mode: ${pathMode}` : ""
  ].filter(Boolean);

  if (shouldBlockJobBoards(p)) {
    lines.push(
      "STABILITY FIRST: ID or housing is not confirmed as has.",
      "Do NOT propose Indeed, Google Jobs, job-board hunting, or a Contact Tracking Spreadsheet as early steps.",
      "Prefer shelter, ID, documents, and local stability resources first.",
      p.idStatus === "needs"
        ? "They said ID is not sorted yet. Include getting ID as a concrete, supportive step — never as a prerequisite that stalls everything else."
        : ""
    );
  } else if (p.stabilityContext === STABILITY_CONTEXT.PROFESSIONAL) {
    lines.push(
      "This person presents as an experienced professional or operator.",
      "ID and housing were intentionally not asked. Do NOT raise ID, shelter, or basic-needs steps unless they bring it up."
    );
  }

  return lines.filter(Boolean).join("\n");
}
