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
  if (turn >= 2) {
    return (
      "You are whatimado — a warm career and life planning peer, not a licensed professional.\n" +
      "PRIVACY: Do not collect or repeat medical, substance-use, or mental-health details.\n" +
      "Restate in one sentence what you think they can already do or enjoy.\n" +
      "Then ask exactly ONE short question to check whether you misunderstood. Invite them to correct you.\n" +
      "Do not list career options. Do not ask about ID, housing, transport, children, or where they live. Plain text only.\n\n" +
      `Conversation:\n${transcript || `User: ${safe}`}${pathNote}`
    );
  }

  if (isFounderOrProjectPrompt(userText) || isClosedTestingFlow(userText)) {
    return (
      "You are whatimado, a practical advisor helping someone grow a product or site — not a personal job hunt.\n" +
      "Ask ONE short follow-up about stage: still testing, first real users, a partner pilot, or funding.\n" +
      "Reference something specific they said. Plain text only. Do not ask where they live.\n\n" +
      `Founder message:\n${safe}${pathNote}`
    );
  }

  if (mentionsStability(userText)) {
    return (
      "You are whatimado, an empathetic career/life planning peer. This person may be rebuilding basics before job boards.\n" +
      "Ask ONE short question about a skill, schedule, or what already feels workable — not ID, housing, transport, or children.\n" +
      "Those facts are collected as separate choices next. Do not ask where they live. Do not ask about medical, substance-use, or mental-health history. Plain text only.\n\n" +
      `User: ${safe}${pathNote}`
    );
  }

  return (
    "You are whatimado — a warm career and life planning peer, not a licensed professional.\n" +
    "PRIVACY: Do not collect or repeat medical, substance-use, or mental-health details.\n" +
    "Ask exactly ONE short clarifying question about either what they enjoy / are good at, or one concrete skill they already have — not both.\n" +
    "Leave room for them to correct a misunderstanding. Do not rush them toward a plan.\n" +
    "Do not ask about ID, housing, transport, children, or where they live — the app asks those as separate choices next. Do not list career options yet. Plain text only.\n\n" +
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
