import { INTAKE_STEP, getChipStep } from "../intake/profile-chips.js";
import { formatUserLocation, hasUsableLocation } from "../state/location.js";
import { normalizeUserProfile } from "../state/user-profile.js";

export const FACT_PREFIX = "convo-fact-";

/**
 * @typedef {{
 *   key: string,
 *   id: string,
 *   category: string,
 *   step: string | null,
 *   field: string | null,
 *   affectsPaths: boolean
 * }} IntakeFactDef
 */

/** @type {IntakeFactDef[]} */
export const INTAKE_FACT_DEFS = [
  { key: "location", id: `${FACT_PREFIX}location`, category: "Location", step: null, field: null, affectsPaths: true },
  { key: "name", id: `${FACT_PREFIX}name`, category: "Name", step: INTAKE_STEP.NAME, field: "name", affectsPaths: false },
  { key: "id", id: `${FACT_PREFIX}id`, category: "ID", step: INTAKE_STEP.ID, field: "idStatus", affectsPaths: true },
  {
    key: "housing",
    id: `${FACT_PREFIX}housing`,
    category: "Shelter",
    step: INTAKE_STEP.HOUSING,
    field: "housingStatus",
    affectsPaths: true
  },
  {
    key: "transport",
    id: `${FACT_PREFIX}transport`,
    category: "Transport",
    step: INTAKE_STEP.TRANSPORT,
    field: "transportStatus",
    affectsPaths: true
  },
  {
    key: "skills",
    id: `${FACT_PREFIX}skills`,
    category: "Skills",
    step: INTAKE_STEP.SKILLS,
    field: "skills",
    affectsPaths: true
  },
  {
    key: "path",
    id: `${FACT_PREFIX}path`,
    category: "Aim",
    step: INTAKE_STEP.PATH,
    field: "pathPreference",
    affectsPaths: true
  },
  {
    key: "income",
    id: `${FACT_PREFIX}income`,
    category: "Income",
    step: INTAKE_STEP.INCOME,
    field: "incomeUrgency",
    affectsPaths: true
  },
  {
    key: "work",
    id: `${FACT_PREFIX}work`,
    category: "Work mode",
    step: INTAKE_STEP.WORK_MODE,
    field: "workMode",
    affectsPaths: true
  }
];

/** @param {string | null | undefined} id */
export function isIntakeFactId(id) {
  return Boolean(id && String(id).startsWith(FACT_PREFIX));
}

/** @param {string} id */
export function intakeFactDefForId(id) {
  return INTAKE_FACT_DEFS.find((fact) => fact.id === id) || null;
}

/**
 * Friendly label for a stored chip value.
 * @param {string | null} step
 * @param {string} field
 * @param {string} value
 */
export function friendlyFactValue(step, field, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!step) return raw;
  const spec = getChipStep(step, {});
  const match = spec?.options?.find((option) => option.field === field && option.value === raw);
  if (match?.label) return match.label;
  return raw;
}

/**
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {import("../state/location.js").UserLocation} location
 * @param {IntakeFactDef} def
 */
export function readFactValue(profile, location, def) {
  const p = normalizeUserProfile(profile);
  if (def.key === "location") return formatUserLocation(location) || "";
  if (!def.field) return "";
  return friendlyFactValue(def.step, def.field, p[def.field] || "");
}

/**
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {import("../state/location.js").UserLocation} location
 * @param {import("../state/journey.js").Journey} journey
 * @returns {{ id: string, label: string, title: string, value: string, editable: boolean, factKey: string }[]}
 */
export function deriveIntakeFactNodes(profile, location, journey) {
  const p = normalizeUserProfile(profile);
  const steps = new Set(journey.completedIntakeSteps || []);
  const current = journey.profileIntakeStep;
  const touched = (step) => Boolean(step) && (steps.has(step) || current === step);
  /** @type {{ id: string, label: string, title: string, value: string, editable: boolean, factKey: string }[]} */
  const nodes = [];

  for (const def of INTAKE_FACT_DEFS) {
    let ready = false;
    let value = "";
    if (def.key === "location") {
      ready = hasUsableLocation(location) || touched(INTAKE_STEP.LOCATION_CITY) || touched(INTAKE_STEP.LOCATION_REGION);
      value = formatUserLocation(location);
    } else if (def.key === "name") {
      ready = Boolean(p.name) || touched(INTAKE_STEP.NAME);
      value = p.name;
    } else if (def.key === "skills") {
      ready =
        Boolean(p.skills) ||
        touched(INTAKE_STEP.SKILLS) ||
        touched(INTAKE_STEP.FOUNDER) ||
        touched(INTAKE_STEP.BUSINESS_SETUP);
      value = friendlyFactValue(def.step, def.field, p.skills);
    } else if (def.key === "work") {
      ready = Boolean(p.workMode) || touched(INTAKE_STEP.WORK_MODE) || touched(INTAKE_STEP.BUSINESS_SETUP);
      value = friendlyFactValue(def.step, def.field, p.workMode || p.founderStage);
    } else if (def.field) {
      ready = Boolean(p[def.field]) || touched(def.step);
      value = friendlyFactValue(def.step, def.field, p[def.field]);
    }
    if (!ready || !value) continue;
    /* Short map label (category); full answer stays in value/title for edit/reflect. */
    nodes.push({
      id: def.id,
      factKey: def.key,
      label: def.category,
      title: value,
      value,
      editable: true
    });
  }

  if (journey.pathsGenerated) {
    nodes.push({
      id: "convo-phase-paths",
      factKey: "phase-paths",
      label: "Possibility Maps",
      title: "Possibility Maps",
      value: "Possibility Maps",
      editable: false
    });
  }
  if (journey.planConfirmed || (journey.missionsStages || []).length) {
    nodes.push({
      id: "convo-phase-missions",
      factKey: "phase-missions",
      label: "Missions",
      title: "Missions",
      value: "Missions",
      editable: false
    });
  }

  return nodes.slice(0, 8);
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, label: string, title: string, value?: string, editable?: boolean, factKey?: string }[]}
 */
export function normalizeMapTopics(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === "string") {
        const label = item.trim();
        if (!label) return null;
        return { id: `convo-topic-${index + 1}`, label, title: label, value: label, editable: false };
      }
      if (!item || typeof item !== "object") return null;
      const source = /** @type {Record<string, unknown>} */ (item);
      const label = String(source.label || source.title || "").trim();
      if (!label) return null;
      const id = String(source.id || `${FACT_PREFIX}${source.factKey || index + 1}`).trim();
      const title = String(source.title || source.value || label).trim() || label;
      return {
        id,
        label,
        title,
        value: String(source.value || title).trim(),
        editable: source.editable !== false && isIntakeFactId(id),
        factKey: typeof source.factKey === "string" ? source.factKey : undefined
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}
