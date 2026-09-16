/** One-question clarifying prompts. Skip PHI. Chips collect structured facts separately. */

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
    /\bpossibility map\b/
  ].filter((pattern) => pattern.test(q)).length;
  return score >= 2 || (/\bwhatimado\b/.test(q) && raw.length > 350);
}

function mentionsStability(text) {
  return /\b(id\b|driver'?s license|housing|shelter|homeless|reentry|incarcerat|parole|released|got out)\b/i.test(
    String(text || "")
  );
}

/**
 * @param {string} userText
 * @param {{ pathMode?: string | null }} [options]
 */
export function buildClarifyingPrompt(userText, options = {}) {
  const safe = String(userText || "").trim().slice(0, 2000) || "[details omitted — career focus only]";
  const pathNote =
    options.pathMode === "direct"
      ? " They chose a Direct Path — one focused step-by-step roadmap after they pick a starting direction."
      : options.pathMode === "flexible"
        ? " They chose a Flexible Path — they will pick between options at every step."
        : "";

  if (isFounderOrProjectPrompt(userText)) {
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
    "Do not ask about ID, housing, transport, children, or where they live — the app asks those as separate choices next. Do not list career options yet. Plain text only.\n\n" +
    `User: ${safe}${pathNote}`
  );
}

export function clarifyingFallback(userText) {
  if (isFounderOrProjectPrompt(userText)) {
    return "Where is the project at right now — still testing, first users, a partner pilot, or looking for funding?";
  }
  if (mentionsStability(userText)) {
    return "What's one practical thing already going well that we should protect while the basics get stable?";
  }
  return "What's one thing you're already good at — or used to enjoy — that we should not ignore?";
}
