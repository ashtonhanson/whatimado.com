import { normalizeUserProfile } from "../state/user-profile.js";

/** Stability-first gates used later by roadmap generate/finalize. */

export function needsIdFirst(profile) {
  return normalizeUserProfile(profile).idStatus !== "has";
}

export function needsHousingFirst(profile) {
  return normalizeUserProfile(profile).housingStatus !== "has";
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
      "Prefer shelter, ID, documents, and local stability resources first."
    );
  }

  return lines.join("\n");
}
