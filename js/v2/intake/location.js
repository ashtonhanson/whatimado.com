import { INTAKE_STEP } from "./profile-chips.js";
import { isLocationSkip, parseLocationAnswer } from "../state/location.js";

export function locationPrompt(step, draft) {
  if (step === INTAKE_STEP.LOCATION_COUNTRY) {
    return "To personalize your roadmap to your region, I only have a few more questions.\n\nWhat country do you live in?";
  }
  if (step === INTAKE_STEP.LOCATION_REGION) {
    return `Got it — ${draft.country}.\n\nWhat state, province, or region? (Type skip if that doesn't apply.)`;
  }
  if (step === INTAKE_STEP.LOCATION_CITY) {
    const place = draft.region ? `${draft.region}, ${draft.country}` : draft.country || "";
    return place ? `What city or town in ${place}?` : "What city or town?";
  }
  if (step === INTAKE_STEP.LOCATION_POSTAL) {
    return `ZIP or postal code for ${draft.city || "your area"}? (Optional — type skip to continue.)`;
  }
  return "";
}

export function isLocationStep(step) {
  return (
    step === INTAKE_STEP.LOCATION_COUNTRY ||
    step === INTAKE_STEP.LOCATION_REGION ||
    step === INTAKE_STEP.LOCATION_CITY ||
    step === INTAKE_STEP.LOCATION_POSTAL
  );
}

/**
 * @param {string} step
 * @param {string} text
 * @param {import("../state/location.js").LocationDraft} draft
 * @returns {{ draft: import("../state/location.js").LocationDraft, next: string | "done", full?: boolean }}
 */
export function applyLocationAnswer(step, text, draft) {
  const trimmed = String(text || "").trim();
  const nextDraft = { ...draft };

  if (step === INTAKE_STEP.LOCATION_COUNTRY) {
    const parsed = parseLocationAnswer(trimmed);
    if (parsed.city && (parsed.region || parsed.country) && trimmed.includes(",")) {
      return {
        draft: {
          country: parsed.country || trimmed,
          region: parsed.region,
          city: parsed.city,
          postal: parsed.postal
        },
        next: parsed.postal ? "done" : INTAKE_STEP.LOCATION_POSTAL,
        full: true
      };
    }
    nextDraft.country = trimmed;
    return { draft: nextDraft, next: INTAKE_STEP.LOCATION_REGION };
  }

  if (step === INTAKE_STEP.LOCATION_REGION) {
    nextDraft.region = isLocationSkip(trimmed) ? "" : trimmed;
    return { draft: nextDraft, next: INTAKE_STEP.LOCATION_CITY };
  }

  if (step === INTAKE_STEP.LOCATION_CITY) {
    nextDraft.city = trimmed;
    return { draft: nextDraft, next: INTAKE_STEP.LOCATION_POSTAL };
  }

  if (step === INTAKE_STEP.LOCATION_POSTAL) {
    nextDraft.postal = isLocationSkip(trimmed) ? "" : trimmed;
    return { draft: nextDraft, next: "done" };
  }

  return { draft: nextDraft, next: step };
}
