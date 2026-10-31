/** One-question clarifying prompts. Skip PHI. Chips collect structured facts separately. */

import { isClosedTestingFlow } from "./persona-signals.js";

export function isFounderOrProjectPrompt(text) {
  const raw = String(text || "");
  const q = raw.toLowerCase();
  const score = [
    /\bwhatimado\b/,
    /\bbuilding\b.*\b(site|app|product|platform|project|business)\b/,
    /\bbusiness plan\b/,
    /\b(mobile )?(application|app|platform|startup)\b/,
    /\btarget (?:audience|market)\b/,
    /\b(grant|sponsor|nonprofit|workforce program)\b/,
    /\bpossibility map\b/,
    /\b(closed (?:data|beta|alpha)|functionality test|functional test|founding users|beta test)\b/,
    /\b(go[- ]to[- ]market|monetization|early users)\b/
  ].filter((pattern) => pattern.test(q)).length;
  return score >= 2 || (/\bwhatimado\b/.test(q) && raw.length > 350);
}

function mentionsStability(text) {
  return /\b(id\b|driver'?s license|housing|shelter|homeless|reentry|incarcerat|parole|released|got out)\b/i.test(
    String(text || "")
  );
}

/**
 * Stay in the ability conversation long enough to catch a misunderstanding.
 * The first reply is never enough. A later "yes" can mean the restatement was right.
 * @param {string} text
 * @param {number} questionsAsked
 */
export function shouldAdvancePastClarifying(text, questionsAsked) {
  const reply = String(text || "").trim();
  const asked = Number(questionsAsked) || 0;
  if (!reply || asked < 1) return false;
  if (/\b(move on|that'?s all|let'?s continue|lets continue|go ahead|i'?m ready|im ready|that'?s enough|skip ahead)\b/i.test(reply)) {
    return true;
  }
  if (asked >= 3) return true;
  if (asked >= 2 && /^(yes|yep|yeah|correct|right|exactly|that'?s right|thats right|you got it|sounds right)\b/i.test(reply)) {
    return true;
  }
  return false;
}

/**
 * @param {string} userText
 * @param {{ pathMode?: string | null, turn?: number, transcript?: string }} [options]
 */
export function buildClarifyingPrompt(userText, options = {}) {
  const safe = String(userText || "").trim().slice(0, 2000) || "[details omitted — career focus only]";
  const pathNote = " They will get flexible options at every step, so do not ask them to choose a direct or flexible path.";
  const turn = Number(options.turn) || 1;
  const transcript = String(options.transcript || "").trim().slice(0, 2500);
  const knownFacts =
    "KNOWN FACTS: Treat everything in their opening message as already known — job, business idea, assets, vehicle, constraints, skills. " +
    "Never re-ask a fact they already stated. Dig deeper on what they said (e.g. if they have a van, ask if it is big enough and reliable — do not ask whether they have transport). " +
    "If they said they want to start their own business, do not ask hired vs own. " +
    "Do not offer a generic skills menu (customer service, writing, hands-on, creative, teaching). " +
    "Keep it like a natural conversation, not a checklist. Only bring up vehicle, ID, or shelter if a clear gap appears.\n";

  if (turn >= 2) {
    return (
      "You are whatimado — a warm career and life planning peer, not a licensed professional.\n" +
      "PRIVACY: Do not collect or repeat medical, substance-use, or mental-health details.\n" +
      knownFacts +
      "Restate in one sentence what you think they can already do or enjoy.\n" +
      "Then ask exactly ONE short question to check whether you misunderstood. Invite them to correct you.\n" +
      "Do not list career options. Do not ask about ID, housing, transport, children, or where they live unless they raised a gap. Plain text only.\n\n" +
      `Conversation:\n${transcript || `User: ${safe}`}${pathNote}`
    );
  }

  if (isFounderOrProjectPrompt(userText) || isClosedTestingFlow(userText)) {
    return (
      "You are whatimado, a practical advisor helping someone grow a product or site — not a personal job hunt.\n" +
      knownFacts +
      "Ask ONE short follow-up about stage: still testing, first real users, a partner pilot, or funding.\n" +
      "Reference something specific they said. Plain text only. Do not ask where they live.\n\n" +
      `Founder message:\n${safe}${pathNote}`
    );
  }

  if (mentionsStability(userText)) {
    return (
      "You are whatimado, an empathetic career/life planning peer. This person may be rebuilding basics before job boards.\n" +
      knownFacts +
      "Ask ONE short question that builds on what they already said — a skill, schedule, asset, or what feels workable.\n" +
      "Do not re-ask vehicle, ID, housing, or children if they already covered it. Do not ask about medical, substance-use, or mental-health history. Plain text only.\n\n" +
      `User: ${safe}${pathNote}`
    );
  }

  return (
    "You are whatimado — a warm career and life planning peer, not a licensed professional.\n" +
    "PRIVACY: Do not collect or repeat medical, substance-use, or mental-health details.\n" +
    knownFacts +
    "Ask exactly ONE short clarifying question that builds on something specific they already said.\n" +
    "Leave room for them to correct a misunderstanding. Do not rush them toward a plan.\n" +
    "Do not ask about ID, housing, transport, children, or where they live unless they raised a gap. Do not list career options yet. Plain text only.\n\n" +
    `User: ${safe}${pathNote}`
  );
}

export function clarifyingFallback(userText) {
  if (isFounderOrProjectPrompt(userText) || isClosedTestingFlow(userText)) {
    return "Where is the project at right now — still testing, first users, a partner pilot, or looking for funding?";
  }
  if (mentionsStability(userText)) {
    return "What's one practical thing already going well that we should protect while the basics get stable?";
  }
  return "What's one thing you're already good at — or used to enjoy — that we should not ignore?";
}
