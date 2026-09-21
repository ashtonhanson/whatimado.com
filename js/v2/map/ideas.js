import { PATH_MODE } from "../intake/path-mode.js";
import { shouldBlockJobBoards } from "../intake/stability-gates.js";

export const MAX_MAP_PATHS = 6;

/** @typedef {{
 *   id: string,
 *   label: string,
 *   title: string,
 *   type: string,
 *   tagline: string,
 *   why: string,
 *   cost: string,
 *   timeline: string,
 *   income: string,
 *   description: string
 * }} PathIdea */

const STABILITY_FALLBACKS = [
  {
    title: "Find a Safe Place for This Week",
    type: "Stability — housing",
    tagline: "Contact shelter and housing programs, check bed availability, and make one safe backup plan.",
    why: "A reliable place to sleep makes every document, benefit, and next step easier to manage.",
    cost: "$0",
    timeline: "Today",
    income: "Stability first"
  },
  {
    title: "Replace Your ID and Documents",
    type: "Stability — documents",
    tagline: "Confirm what you need for a birth certificate and state ID, then prepare the first request.",
    why: "Valid ID opens access to housing programs, benefits, healthcare, and later employment.",
    cost: "$0–50",
    timeline: "Start this week",
    income: "Unlocks later options"
  },
  {
    title: "Set Up Mail and Basic Benefits",
    type: "Stability — essentials",
    tagline: "Secure a mailing address and apply for food, healthcare, and housing help you can use now.",
    why: "A working address and basic support reduce immediate pressure while housing and ID are being sorted.",
    cost: "$0",
    timeline: "This week",
    income: "Reduces immediate costs"
  }
];

const DEFAULT_FALLBACKS = [
  {
    title: "Rebuild with your skills",
    type: "Employment",
    tagline: "Use what you already know while you stabilize hours and basics.",
    why: "Starting from skills you already have is faster than a full restart.",
    cost: "$0",
    timeline: "This week",
    income: "Part-time to start"
  },
  {
    title: "Train into a trade",
    type: "Training",
    tagline: "A structured certification route with clear milestones and local programs.",
    why: "A short, named training path beats a vague 'learn something new' plan.",
    cost: "Often $0–low with aid",
    timeline: "4–12 weeks",
    income: "After certification"
  },
  {
    title: "Freelance / self-employed",
    type: "Self-employment",
    tagline: "Small paid projects first, then repeat clients once one offer is proven.",
    why: "A tiny paid test shows whether this fits your schedule before you go all-in.",
    cost: "$0",
    timeline: "2–4 weeks to first test",
    income: "Project by project"
  }
];

/** @param {string} title @param {number} index */
export function ideaIdFromTitle(title, index) {
  const base = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return base || `path-${index + 1}`;
}

/** @param {unknown} entry @param {number} [index] */
export function coerceIdea(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;
  const raw = /** @type {Record<string, unknown>} */ (entry);
  const title = String(raw.title || raw.name || raw.path || raw.headline || raw.idea || "").trim();
  if (!title) return null;
  const tagline = String(raw.tagline || raw.description || raw.summary || raw.subtitle || "").trim();
  /** @type {PathIdea} */
  const idea = {
    id: ideaIdFromTitle(String(raw.id || title), index),
    label: String(raw.label || title).trim(),
    title,
    type: String(raw.type || raw.category || "Opportunity").trim(),
    tagline,
    why: String(raw.why || raw.reason || "").trim(),
    cost: raw.cost != null ? String(raw.cost).trim() : "",
    timeline: String(raw.timeline || raw.time || raw.duration || "").trim(),
    income: String(raw.income || raw.earnings || raw.revenue || "").trim(),
    description: tagline
  };
  return idea;
}

/** @param {unknown} ideas */
export function normalizeIdeas(ideas) {
  return (Array.isArray(ideas) ? ideas : []).map((entry, index) => coerceIdea(entry, index)).filter(Boolean);
}

/** @param {string | null} pathMode */
export function ideaCountForMode(pathMode) {
  return pathMode === PATH_MODE.DIRECT ? 1 : 3;
}

/**
 * @param {import("../state/user-profile.js").UserProfile} profile
 * @param {string | null} [pathMode]
 */
export function fallbackIdeas(profile, pathMode = null) {
  const source = shouldBlockJobBoards(profile) ? STABILITY_FALLBACKS : DEFAULT_FALLBACKS;
  return normalizeIdeas(source).slice(0, ideaCountForMode(pathMode));
}

/** @param {string} raw */
function extractJsonValue(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : text;
  const objectMatch = body.match(/\{[\s\S]*\}/);
  const arrayMatch = body.match(/\[[\s\S]*\]/);
  const candidate = objectMatch && (!arrayMatch || body.indexOf("{") <= body.indexOf("[")) ? objectMatch[0] : arrayMatch?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * @param {string} raw
 * @returns {{ intro: string, ideas: PathIdea[] }}
 */
export function parseIdeasResponse(raw) {
  const parsed = extractJsonValue(raw);
  if (Array.isArray(parsed)) {
    return {
      intro: "Here are a few directions that could fit — tap a node or card to explore.",
      ideas: normalizeIdeas(parsed)
    };
  }
  if (parsed && typeof parsed === "object") {
    const record = /** @type {Record<string, unknown>} */ (parsed);
    const ideas = normalizeIdeas(record.paths || record.ideas || []);
    return {
      intro: String(record.intro || "Here are a few directions that could fit — tap a node or card to explore."),
      ideas
    };
  }
  throw new Error("Advisor did not return path ideas");
}

/** @param {PathIdea[]} ideas @param {PathIdea[]} existing */
export function filterNewIdeas(ideas, existing) {
  const seen = new Set(existing.map((idea) => idea.title.toLowerCase().trim()));
  return ideas.filter((idea) => {
    const key = idea.title.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {{ role: string, content: string }[]} messages
 * @param {string} contextBlock
 * @param {{ count: number, excludeTitles?: string[], replaceTitle?: string, mode?: "generate"|"more"|"replace"|"regenerate" }} spec
 */
export function buildIdeasPrompt(messages, contextBlock, spec) {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`)
    .join("\n\n");
  const extra = contextBlock ? `\n${contextBlock}\n` : "";
  const count = Math.max(1, Number(spec.count) || 3);
  const exclude = (spec.excludeTitles || []).filter(Boolean).slice(0, 12);
  const excludeBlock = exclude.length
    ? `\nDo NOT repeat or closely resemble these paths already shown:\n${exclude.map((title) => `- ${title}`).join("\n")}\n`
    : "";
  const replaceBlock = spec.replaceTitle
    ? `\nReplace path "${spec.replaceTitle}" with ONE new idea that reflects the user's latest feedback. Keep the rest of the map unchanged.\n`
    : "";
  const modeNote =
    spec.mode === "more"
      ? `Generate exactly ${count} completely NEW paths.`
      : spec.mode === "regenerate"
        ? `Regenerate exactly ${count} NEW paths that reflect the latest conversation. Do not recycle the previous titles.`
        : spec.mode === "replace"
          ? "Return exactly ONE replacement path."
          : `Generate exactly ${count} distinct, realistic paths.`;

  return (
    "You are whatimado, a practical possibility advisor.\n" +
    "Write like a helpful mentor — warm, plain English. No medical or clinical advice.\n" +
    "Each path must use a different primary strategy (employment, self-employment, short training, gig/local work, or community route) unless stability-first rules say otherwise.\n" +
    "Every set must include at least one $0 path. Keep income projections modest and realistic.\n" +
    "Titles, taglines, and first steps should feel specific to what THIS person said — not generic hustle templates.\n" +
    "Keep tagline and why short enough to scan on a phone.\n" +
    `${modeNote}${excludeBlock}${replaceBlock}` +
    extra +
    "\nConversation:\n" +
    transcript +
    "\n\nReturn ONLY valid JSON — no markdown fences, no commentary:\n" +
    "{\n" +
    '  "intro": "One warm sentence inviting them to explore the map",\n' +
    '  "paths": [\n' +
    "    {\n" +
    '      "id": "kebab-case-id",\n' +
    '      "label": "Short map label (max 14 chars)",\n' +
    '      "title": "Clear path name",\n' +
    '      "type": "Employment | Training | Self-employment | Stability | Opportunity",\n' +
      '      "tagline": "one specific sentence, max 12 words",\n' +
      '      "why": "one short clause referencing what THEY said, max 10 words",\n' +
    '      "cost": "e.g. $0",\n' +
    '      "timeline": "e.g. 2-4 weeks",\n' +
    '      "income": "e.g. part-time to start"\n' +
    "    }\n" +
    "  ]\n" +
    "}"
  );
}

/**
 * @param {PathIdea} idea
 * @param {PathIdea[]} all
 */
export function buildDiscussSystemPrompt(idea, all) {
  const pathList = all.map((entry, index) => `${index + 1}. ${entry.title}`).join("\n");
  return (
    "You are whatimado — a warm career and life planning peer, not a licensed professional.\n" +
    "Help them think through this path — fit, tradeoffs, first steps, and alternatives.\n" +
    "Do NOT output JSON or regenerate paths. Ask at most one question. Keep replies under 120 words. Plain text only.\n\n" +
    `The user is discussing this specific path:\nTitle: ${idea.title}\nType: ${idea.type || "Opportunity"}\nTagline: ${idea.tagline || ""}\nWhy: ${idea.why || ""}\nCost: ${idea.cost || ""}\nTimeline: ${idea.timeline || ""}\nIncome: ${idea.income || ""}\n\n` +
    `All paths on their map:\n${pathList}`
  );
}

/** @param {PathIdea[]} all @param {boolean} direct */
export function buildAlterSystemPrompt(all, direct) {
  const pathList = all.map((entry, index) => `${index + 1}. ${entry.title}`).join("\n");
  if (direct) {
    return (
      "You are whatimado — a warm career and life planning peer.\n" +
      `The user is reviewing their single direct-path recommendation: ${all[0]?.title || "their path"}.\n` +
      "Help them clarify what's not fitting and what to adjust. Do NOT output JSON or regenerate paths. Ask at most one question. Keep replies under 120 words. Plain text only."
    );
  }
  return (
    "You are whatimado — a warm career and life planning peer.\n" +
    "The user is reviewing their possibility map and wants to discuss their paths.\n" +
    `Current paths:\n${pathList}\n\n` +
    "Help them explore what's not fitting and what they'd rather do. Do NOT output JSON or regenerate paths. Ask at most one question. Keep replies under 120 words. Plain text only."
  );
}

export function detectMapChatIntent(text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return null;
  if (/\b(update this path|replace this path|change this path|new path|different path)\b/.test(q)) {
    return "replace_path";
  }
  if (/\b(regenerat|redo|refresh|new|another|different)\b.*\b(path|option|map)\b/.test(q)) return "regenerate";
  if (/^(regenerate|redo|refresh)\b/.test(q) && q.length < 100) return "regenerate";
  if (/\b(alter|change|shift|new)\b.*\b(direction|focus|lane)\b/.test(q)) return "regenerate";
  return null;
}
