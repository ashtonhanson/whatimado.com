import { normalizeUserProfile } from "../state/user-profile.js";

/** Ordered chip steps. Skip a step only when the profile already has a value. */

export const INTAKE_STEP = {
  PATH_MODE: "path_mode",
  CLARIFYING: "clarifying",
  ID: "id_status",
  HOUSING: "housing_status",
  TRANSPORT: "transport_status",
  DEPENDENTS: "dependent_support",
  INCOME: "income",
  PATH: "path",
  FOUNDER: "founder_stage",
  WORK_MODE: "work_mode",
  BUSINESS_SETUP: "business_setup",
  SKILLS: "skills",
  RELOCATE: "relocate",
  LOCATION_COUNTRY: "location_country",
  LOCATION_REGION: "location_region",
  LOCATION_CITY: "location_city",
  LOCATION_POSTAL: "location_postal",
  NAME: "name"
};

/** @typedef {{ field: string, value: string, label: string }} ChipOption */

/**
 * @param {string} step
 * @param {{ founder?: boolean }} [ctx]
 * @returns {{ prompt: string, options: ChipOption[] } | null}
 */
export function getChipStep(step, ctx = {}) {
  const founder = Boolean(ctx.founder);
  switch (step) {
    case INTAKE_STEP.ID:
      return {
        prompt:
          "Do you have a valid ID right now — like a driver's license or state ID — or is getting that sorted still on your to-do list?",
        options: [
          { field: "idStatus", value: "has", label: "Yes, I have valid ID" },
          { field: "idStatus", value: "needs", label: "No — I still need to get ID sorted" },
          { field: "idStatus", value: "needs", label: "Not sure / working on it" }
        ]
      };
    case INTAKE_STEP.HOUSING:
      return {
        prompt: "Before we plan work or income, do you have a safe place you can reliably stay for at least the next week?",
        options: [
          { field: "housingStatus", value: "has", label: "Yes — I have a safe, reliable place" },
          { field: "housingStatus", value: "needs", label: "Only temporary / not reliable" },
          { field: "housingStatus", value: "needs", label: "No — I need housing or shelter help" }
        ]
      };
    case INTAKE_STEP.TRANSPORT:
      return {
        prompt: "Do you have reliable transportation right now — like a car that runs, or steady access to transit/rides?",
        options: [
          { field: "transportStatus", value: "has", label: "Yes — car or reliable transport" },
          { field: "transportStatus", value: "limited", label: "Limited — bus, rides, or sometimes" },
          { field: "transportStatus", value: "needs", label: "No — no reliable transport" }
        ]
      };
    case INTAKE_STEP.DEPENDENTS:
      return {
        prompt:
          "One more practical detail before we map options — do you have kids or others you're responsible for day to day?",
        options: [
          { field: "dependentSupport", value: "none", label: "No children or dependents" },
          { field: "dependentSupport", value: "needs_help", label: "Yes — include help/resources for them" },
          { field: "dependentSupport", value: "no_help", label: "Yes — just plan around my schedule" }
        ]
      };
    case INTAKE_STEP.INCOME:
      return {
        prompt: "When do you need income to start?",
        options: [
          { field: "incomeUrgency", value: "immediate", label: "Immediately" },
          { field: "incomeUrgency", value: "three_months", label: "Within 3 months" },
          { field: "incomeUrgency", value: "long_term", label: "Long-term is OK" }
        ]
      };
    case INTAKE_STEP.PATH:
      return {
        prompt: founder ? "For this product right now, what's the main focus?" : "What are you mainly aiming for?",
        options: founder
          ? [
              { field: "pathPreference", value: "business", label: "Grow the site / product" },
              { field: "pathPreference", value: "either", label: "Mix of product + partnerships" },
              { field: "pathPreference", value: "employment", label: "Keep my day job too" }
            ]
          : [
              { field: "pathPreference", value: "employment", label: "Get hired" },
              { field: "pathPreference", value: "business", label: "Start my own thing" },
              { field: "pathPreference", value: "either", label: "Either works" }
            ]
      };
    case INTAKE_STEP.FOUNDER:
      return {
        prompt: "Where is this project at right now?",
        options: [
          { field: "founderStage", value: "beta", label: "Still testing if it works" },
          { field: "founderStage", value: "validation", label: "First strangers to try it" },
          { field: "founderStage", value: "pilot", label: "Formal pilot with a partner" },
          { field: "founderStage", value: "growth", label: "Grants / sponsors / scaling" }
        ]
      };
    case INTAKE_STEP.WORK_MODE:
      return {
        prompt: "For work, what setup fits you best?",
        options: [
          { field: "workMode", value: "remote", label: "Remote" },
          { field: "workMode", value: "hybrid", label: "Hybrid" },
          { field: "workMode", value: "in_person", label: "In-person" },
          { field: "workMode", value: "flexible", label: "Flexible" }
        ]
      };
    case INTAKE_STEP.BUSINESS_SETUP:
      return {
        prompt: "How will you reach customers?",
        options: [
          { field: "workMode", value: "mobile", label: "Mobile — I go to them" },
          { field: "workMode", value: "fixed_location", label: "At a shop or location" },
          { field: "workMode", value: "online", label: "Online / remote" },
          { field: "workMode", value: "mix", label: "Mix" }
        ]
      };
    case INTAKE_STEP.SKILLS:
      return {
        prompt: "What could you realistically use to earn money soon — skills you already have, or something you'd learn in 2–4 weeks?",
        options: [
          { field: "skills", value: "customer service, typing, and clear communication", label: "Customer service / admin" },
          { field: "skills", value: "writing, organizing, spreadsheets, and research", label: "Writing / organizing" },
          { field: "skills", value: "hands-on work, fixing things, and physical tasks", label: "Hands-on / trade-adjacent" },
          { field: "skills", value: "creative work, design, music, or making things", label: "Creative / making" },
          { field: "skills", value: "teaching, coaching, or explaining things clearly", label: "Teaching / coaching" },
          { field: "skills", value: "computers, troubleshooting, and learning new software fast", label: "Tech-comfortable" },
          { field: "skills", value: "not sure yet — help me figure out what I can sell or apply with", label: "Not sure yet" }
        ]
      };
    case INTAKE_STEP.RELOCATE:
      return {
        prompt: "Would you relocate for the right opportunity?",
        options: [
          { field: "willingToRelocate", value: "yes", label: "Yes" },
          { field: "willingToRelocate", value: "maybe", label: "Maybe" },
          { field: "willingToRelocate", value: "no", label: "No" }
        ]
      };
    default:
      return null;
  }
}

export function isChipStep(step) {
  return Boolean(getChipStep(step));
}

export function profilePathIsOwnBusiness(profile) {
  return normalizeUserProfile(profile).pathPreference === "business";
}

/**
 * Next chip step that is still unknown. Location/name are handled separately.
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {{ founder?: boolean }} [ctx]
 */
export function nextChipStep(profile, ctx = {}) {
  const p = normalizeUserProfile(profile);
  const founder = Boolean(ctx.founder);
  if (!p.idStatus) return INTAKE_STEP.ID;
  if (!p.housingStatus) return INTAKE_STEP.HOUSING;
  if (!p.transportStatus) return INTAKE_STEP.TRANSPORT;
  if (!p.dependentSupport) return INTAKE_STEP.DEPENDENTS;
  if (!p.incomeUrgency) return INTAKE_STEP.INCOME;
  if (!p.pathPreference) return INTAKE_STEP.PATH;
  if (founder && !p.founderStage) return INTAKE_STEP.FOUNDER;
  if (founder) return null;
  if (!p.workMode) return profilePathIsOwnBusiness(p) ? INTAKE_STEP.BUSINESS_SETUP : INTAKE_STEP.WORK_MODE;
  if (!p.skills) return INTAKE_STEP.SKILLS;
  if (p.pathPreference === "employment" && !p.willingToRelocate) return INTAKE_STEP.RELOCATE;
  return null;
}

export function parseIdStatus(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(yes|yeah|yep|have (?:my )?(?:id|license)|valid id)\b/.test(q) && !/\b(no|don'?t|need)\b/.test(q)) return "has";
  if (/\b(no|nope|not yet|don'?t have|need to get|lost|missing|no id|not sure|unsure|working on)\b/.test(q)) return "needs";
  return "";
}

export function parseHousingStatus(text) {
  const q = String(text || "").toLowerCase().trim();
  if (/^(yes|yeah|yep|i do|i have one)$/.test(q)) return "has";
  if (/^(no|nope|not yet|unsure|not sure|maybe)$/.test(q)) return "needs";
  if (/\b(temporary|not reliable|not safe|shelter|homeless|couch|motel|need housing)\b/.test(q)) return "needs";
  if (/\b(yes|safe|stable|reliable place|have (?:a )?place|have housing)\b/.test(q)) return "has";
  return "";
}

export function parseTransportStatus(text) {
  const q = String(text || "").toLowerCase().trim();
  if (/\b(yes|car|drive|reliable)\b/.test(q) && !/\b(no|don'?t|limited|bus)\b/.test(q)) return "has";
  if (/\b(sometimes|limited|bus|transit|uber|lyft|bike)\b/.test(q)) return "limited";
  if (/\b(no|nope|don'?t have|no car|no transport)\b/.test(q)) return "needs";
  return "";
}

export function parseDependentSupport(text) {
  const q = String(text || "").toLowerCase().trim();
  if (/\b(no children|no kids|no dependents|none|just me|only myself)\b/.test(q)) return "none";
  if (/\b(help|support|assistance|childcare|daycare)\b/.test(q) && /\b(yes|need|want|include)\b/.test(q)) {
    return "needs_help";
  }
  if (/\b(kids?|children|son|daughter|dependents|parent)\b/.test(q)) return "no_help";
  if (/^yes\b/.test(q)) return "no_help";
  if (/^no\b/.test(q)) return "none";
  return "";
}

export function parseIncomeUrgency(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(immediate|asap|right away|this week|urgent|now)\b/.test(q)) return "immediate";
  if (/\b(3 month|three month|few month|within months)\b/.test(q)) return "three_months";
  if (/\b(long[- ]?term|no rush|eventually|not urgent)\b/.test(q)) return "long_term";
  return "";
}

export function parsePathPreference(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(either|both|open to|either works)\b/.test(q)) return "either";
  if (/\b(start(?:ing)? my own|own (?:thing|business)|self[- ]?employ|freelance|entrepreneur|\bbusiness\b)\b/.test(q)) {
    return "business";
  }
  if (/\b(hired|job|employ|get a job|get hired)\b/.test(q)) return "employment";
  return "";
}

export function parseWorkMode(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(remote|work from home|wfh)\b/.test(q)) return "remote";
  if (/\b(hybrid)\b/.test(q)) return "hybrid";
  if (/\b(in[- ]?person|on[- ]?site)\b/.test(q)) return "in_person";
  if (/\b(flexible|no preference|any)\b/.test(q)) return "flexible";
  return "";
}

export function parseBusinessSetup(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(mobile|van|on the road|go to them)\b/.test(q)) return "mobile";
  if (/\b(online|website|digital)\b/.test(q)) return "online";
  if (/\b(shop|salon|store|office|studio|fixed)\b/.test(q)) return "fixed_location";
  if (/\b(mix|both)\b/.test(q)) return "mix";
  return parseWorkMode(text);
}

export function parseRelocatePreference(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(yes|willing|would move|relocate)\b/.test(q) && !/\b(not|no)\b/.test(q)) return "yes";
  if (/\b(maybe|depends|possibly)\b/.test(q)) return "maybe";
  if (/\b(no|not willing|stay here|can'?t move)\b/.test(q)) return "no";
  return "";
}

export function parseFounderStage(text) {
  const q = String(text || "").toLowerCase();
  if (/\b(beta|test if it works|just testing)\b/.test(q)) return "beta";
  if (/\b(first (real )?strangers|validation|early users)\b/.test(q)) return "validation";
  if (/\b(pilot|partner)\b/.test(q)) return "pilot";
  if (/\b(grant|sponsor|scale|growth)\b/.test(q)) return "growth";
  return "";
}

/**
 * @param {string} step
 * @param {string} text
 */
export function parseChipAnswer(step, text) {
  switch (step) {
    case INTAKE_STEP.ID:
      return { field: "idStatus", value: parseIdStatus(text) };
    case INTAKE_STEP.HOUSING:
      return { field: "housingStatus", value: parseHousingStatus(text) };
    case INTAKE_STEP.TRANSPORT:
      return { field: "transportStatus", value: parseTransportStatus(text) };
    case INTAKE_STEP.DEPENDENTS:
      return { field: "dependentSupport", value: parseDependentSupport(text) };
    case INTAKE_STEP.INCOME:
      return { field: "incomeUrgency", value: parseIncomeUrgency(text) };
    case INTAKE_STEP.PATH:
      return { field: "pathPreference", value: parsePathPreference(text) };
    case INTAKE_STEP.FOUNDER:
      return { field: "founderStage", value: parseFounderStage(text) };
    case INTAKE_STEP.WORK_MODE:
      return { field: "workMode", value: parseWorkMode(text) };
    case INTAKE_STEP.BUSINESS_SETUP:
      return { field: "workMode", value: parseBusinessSetup(text) };
    case INTAKE_STEP.SKILLS:
      return { field: "skills", value: String(text || "").trim().slice(0, 200) };
    case INTAKE_STEP.RELOCATE:
      return { field: "willingToRelocate", value: parseRelocatePreference(text) };
    default:
      return { field: "", value: "" };
  }
}
