/** Guest/account profile fields used by intake chips (Slice 2). */

/** @typedef {{
 *   name: string,
 *   incomeUrgency: string,
 *   pathPreference: string,
 *   workMode: string,
 *   willingToRelocate: string,
 *   founderStage: string,
 *   idStatus: string,
 *   housingStatus: string,
 *   transportStatus: string,
 *   dependentSupport: string,
 *   skills: string,
 *   constraints: string,
 *   goals: string,
 *   summary: string,
 *   updatedAt: number
 * }} UserProfile */

/** @returns {UserProfile} */
export function emptyUserProfile() {
  return {
    name: "",
    incomeUrgency: "",
    pathPreference: "",
    workMode: "",
    willingToRelocate: "",
    founderStage: "",
    idStatus: "",
    housingStatus: "",
    transportStatus: "",
    dependentSupport: "",
    skills: "",
    constraints: "",
    goals: "",
    summary: "",
    updatedAt: 0
  };
}

/**
 * @param {unknown} profile
 * @returns {UserProfile}
 */
export function normalizeUserProfile(profile = emptyUserProfile()) {
  const source = profile && typeof profile === "object" ? /** @type {Record<string, unknown>} */ (profile) : {};
  return {
    name: String(source.name || "").trim(),
    incomeUrgency: String(source.incomeUrgency || "").trim(),
    pathPreference: String(source.pathPreference || "").trim(),
    workMode: String(source.workMode || "").trim(),
    willingToRelocate: String(source.willingToRelocate || "").trim(),
    founderStage: String(source.founderStage || "").trim(),
    idStatus: String(source.idStatus || "").trim(),
    housingStatus: String(source.housingStatus || "").trim(),
    transportStatus: String(source.transportStatus || "").trim(),
    dependentSupport: String(source.dependentSupport || "").trim(),
    skills: String(source.skills || "").trim(),
    constraints: String(source.constraints || "").trim(),
    goals: String(source.goals || "").trim(),
    summary: String(source.summary || "").trim(),
    updatedAt: Number(source.updatedAt) || 0
  };
}

/**
 * @param {UserProfile} profile
 * @param {string} field
 * @param {string} value
 * @returns {UserProfile}
 */
export function setUserProfileField(profile, field, value) {
  const next = normalizeUserProfile(profile);
  if (!field || !(field in next) || field === "updatedAt") return next;
  next[field] = String(value || "").trim();
  next.updatedAt = Date.now();
  return next;
}
