/**
 * Who should be asked the ID / housing questions.
 *
 * Stability signals always win: if the user's own words show ID or housing is
 * live for them, we ask regardless of how professional the rest reads.
 * Regexes ported from the monolith so both surfaces classify the same text
 * the same way (index.html ~28323-28499).
 */

export const STABILITY_CONTEXT = {
  /** Their words show ID/housing is a real, current constraint. */
  SIGNALS: "signals",
  /** Established professional / operator — suppress the basics questions. */
  PROFESSIONAL: "professional",
  /** Neither. Ask, but with the resource framing. */
  NEUTRAL: ""
};

export function mentionsIdNeed(text = "") {
  const blob = String(text || "").toLowerCase();
  return /\b(need(?:s|ed)? (?:an? )?(?:id|identification|birth certificate|driver'?s licen[sc]e|state id|ssn|social security)|don'?t have (?:a |an )?(?:id|birth certificate|driver'?s licen[sc]e|social security)|no (?:valid )?id\b|no job or id|no id or job|missing (?:my )?(?:id|documents|papers)|lost my (?:id|licen[sc]e)|get(?:ting)? (?:an? )?(?:id|birth certificate|documents)|replace (?:my )?(?:id|licen[sc]e)|sort (?:my )?id|id and housing|without (?:an? )?id|expired (?:id|licen[sc]e))\b/.test(
    blob
  );
}

export function confirmsHasId(text = "") {
  const blob = String(text || "").toLowerCase();
  if (mentionsIdNeed(blob)) return false;
  return /\b(have (?:my )?(?:id|driver'?s licen[sc]e|state id|birth certificate)|id is (?:good|fine|set|valid)|already have (?:an? )?(?:id|birth certificate|licen[sc]e))\b/.test(
    blob
  );
}

export function mentionsHousingInstability(text = "") {
  const blob = String(text || "").toLowerCase();
  return /\b(no place to stay|nowhere to stay|no(?:where| )?(?:to )?(?:live|stay|sleep)|(?:don'?t|do not) have (?:a )?(?:place|home|housing|somewhere to stay)|homeless|unhoused|in a shelter|living in (?:a |my )?(?:car|motel|shelter|van)|no home|no housing|evict|between places|couch ?surf|staying with friends temporarily|no permanent address)\b/.test(
    blob
  );
}

export function confirmsHasHousing(text = "") {
  const blob = String(text || "").toLowerCase();
  if (mentionsHousingInstability(blob)) return false;
  return /\b(have (?:a |my )?(?:safe |stable )?(?:place|apartment|housing|home|room|lease)|stable housing|i'?m housed|got (?:a )?(?:place|apartment|housing)|housing is (?:set|sorted|secure|stable))\b/.test(
    blob
  );
}

export function mentionsReentryHardship(text = "") {
  const blob = String(text || "").toLowerCase();
  return /\b(re-?entry|incarcerat|in prison|in jail|got out|just released|released from|on parole|on probation|halfway house|felony|my record|justice[- ]involved)\b/.test(
    blob
  );
}

/** Asking for benefits, shelter, or local services makes ID relevant again. */
export function asksForLocalServices(text = "") {
  const blob = String(text || "").toLowerCase();
  return /\b(food stamps|snap benefits|medicaid|medicare|welfare|general assistance|housing voucher|section 8|shelter bed|food bank|211|social services|case ?worker|disability benefits|unemployment benefits)\b/.test(
    blob
  );
}

/** Career-change language alone must never trigger the stability gates. */
export function looksLikeCareerPivot(text = "") {
  const blob = String(text || "").toLowerCase();
  if (!blob.trim()) return false;
  if (mentionsHousingInstability(blob) || mentionsIdNeed(blob) || mentionsReentryHardship(blob)) return false;
  return /\b(corporate|office job|9\s*[- ]?\s*to\s*[- ]?\s*5|desk job|career change|changing careers|switch careers|new career|second career|pivot(?:ing)?(?: careers)?|burn(?:ed|t)? out|burnout|tired of (?:my )?(?:job|work|career|role)|stuck in (?:my )?(?:job|career|role)|hate my job|leave (?:my )?(?:job|career)|mid[- ]?career|next chapter|ready for (?:a )?change|looking for (?:a )?new (?:field|industry)|switch(?:ing)? (?:fields?|industries)|reinvent(?:ing)? my career)\b/.test(
    blob
  );
}

/** Soft "starting over" only counts with a hard signal beside it. */
export function mentionsStabilityRebuild(text = "") {
  const blob = String(text || "").toLowerCase();
  if (!blob.trim()) return false;
  if (looksLikeCareerPivot(blob)) return false;
  if (mentionsHousingInstability(blob) || mentionsReentryHardship(blob)) return true;
  const softRebuild = /\b(rebuild(?:ing)? (?:my )?life|starting over|fresh start|back on (?:my )?feet|starting from nothing)\b/.test(
    blob
  );
  if (!softRebuild) return false;
  if (
    /\b(out in society|back out|reintegrat|everyday life|real world|on my own again|getting out|get back on)\b/.test(blob)
  ) {
    return true;
  }
  return mentionsIdNeed(blob) || /\b(no place|homeless|shelter|nowhere to stay|no (?:valid )?id)\b/.test(blob);
}

/**
 * Anything that makes ID / housing a live constraint for this person.
 * @param {string} text
 */
export function hasStabilitySignals(text = "") {
  const blob = String(text || "").toLowerCase();
  if (!blob.trim()) return false;
  return (
    mentionsIdNeed(blob) ||
    mentionsHousingInstability(blob) ||
    mentionsReentryHardship(blob) ||
    mentionsStabilityRebuild(blob) ||
    asksForLocalServices(blob)
  );
}

const PROFESSIONAL_PATTERNS = [
  // Multi-year work history
  /\b(\d{1,2}\+?\s*(?:years?|yrs?)|a decade|two decades)\b[^.!?]{0,40}\b(experience|in the industry|as an?|working|career|doing|building|managing)\b/,
  /\b(my career|throughout my career|since 20\d\d|been doing this since)\b/,
  // Shipping products
  /\b(shipped|launched|released|deployed|in production|went live|took it to market|end[- ]to[- ]end delivery)\b/,
  // Running a business
  /\b(my (?:clients?|company|firm|agency|studio|practice|shop)|my own business|s[- ]?corp|\bllc\b|sole proprietor|invoic(?:e|ing)|contracts? with|p&l|revenue|billable)\b/,
  // Leading teams
  /\b(led (?:a )?team|manage[ds]? (?:a )?team|direct reports?|team of \d+|mentor(?:ed|ing) (?:junior|new)|hired and|people manager|head of|director of|principal|senior (?:engineer|designer|manager|analyst))\b/,
  // Deep tool / craft fluency
  /\b(stack|codebase|ci\/cd|kubernetes|terraform|figma|autocad|solidworks|revit|quickbooks|salesforce|epic|ehr|cnc|journeyman|master electrician|\bcdl\b|board[- ]certified|licensed (?:contractor|nurse|therapist|architect|cpa))\b/,
  // Formal credentials
  /\b(my (?:resume|portfolio|cv)|bachelor'?s|master'?s|\bmba\b|\bphd\b|certified in|professional licen[sc]e)\b/
];

/**
 * Score, don't keyword-trigger — one stray word should not flip the persona.
 * @param {string} text
 * @returns {string[]} names of matched signals, for debugging
 */
export function professionalSignals(text = "") {
  const blob = String(text || "").toLowerCase();
  if (!blob.trim()) return [];
  return PROFESSIONAL_PATTERNS.map((pattern, index) => (pattern.test(blob) ? `p${index}` : "")).filter(Boolean);
}

/** @param {string} text */
export function looksProfessional(text = "") {
  return professionalSignals(text).length >= 2;
}

/**
 * Single classification used by the chip sequence and the stability gates.
 * @param {string} text All user text so far.
 * @param {{ founder?: boolean }} [ctx]
 * @returns {string} one of STABILITY_CONTEXT
 */
export function classifyStabilityContext(text = "", ctx = {}) {
  if (hasStabilitySignals(text)) return STABILITY_CONTEXT.SIGNALS;
  if (ctx.founder) return STABILITY_CONTEXT.PROFESSIONAL;
  if (looksProfessional(text)) return STABILITY_CONTEXT.PROFESSIONAL;
  if (looksLikeCareerPivot(text)) return STABILITY_CONTEXT.PROFESSIONAL;
  return STABILITY_CONTEXT.NEUTRAL;
}

/**
 * Skip the ID chip unless the conversation gives a reason to ask.
 * @param {string} text
 * @param {{ founder?: boolean }} [ctx]
 */
export function shouldSuppressIdStep(text = "", ctx = {}) {
  if (confirmsHasId(text)) return true;
  return classifyStabilityContext(text, ctx) === STABILITY_CONTEXT.PROFESSIONAL;
}

/**
 * @param {string} text
 * @param {{ founder?: boolean }} [ctx]
 */
export function shouldSuppressHousingStep(text = "", ctx = {}) {
  if (confirmsHasHousing(text)) return true;
  return classifyStabilityContext(text, ctx) === STABILITY_CONTEXT.PROFESSIONAL;
}
