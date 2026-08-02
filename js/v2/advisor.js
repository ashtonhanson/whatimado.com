const ADVISOR_MODEL = "claude-sonnet-4-5";

function getApiOrigin() {
  const { origin, hostname } = window.location;
  if (hostname === "whatimado.com" || hostname === "www.whatimado.com") {
    return "https://www.whatimado.com";
  }
  return origin;
}

function extractAdvisorText(data) {
  const block = data?.content?.find((entry) => entry.type === "text");
  return block?.text?.trim() || "";
}

/**
 * @param {string} prompt
 * @param {{ maxTokens?: number, feature?: string }} [options]
 */
export async function callAdvisor(prompt, options = {}) {
  const { maxTokens = 700, feature = "v2_chat" } = options;
  const response = await fetch(`${getApiOrigin()}/api/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ADVISOR_MODEL,
      max_tokens: maxTokens,
      feature,
      messages: [{ role: "user", content: prompt }]
    })
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid response from advisor");
  }

  if (!response.ok) {
    const msg = data?.error?.message || data?.error || `Request failed (${response.status})`;
    throw new Error(String(msg));
  }

  return extractAdvisorText(data);
}

const EXPLORATION_SYSTEM = `You are whatimado — a warm career and life planning peer, not a licensed professional.
PRIVACY: Do not collect or repeat medical, substance-use, or mental-health details. Acknowledge briefly and focus on skills, logistics, and forward motion.
PACING: Ask exactly ONE question per reply unless the user asked for a plan overview.
Keep replies under 120 words. Plain text only.`;

/**
 * @param {{ role: "user"|"assistant", content: string }[]} messages
 */
export function buildExplorationPrompt(messages) {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`)
    .join("\n\n");
  return `${EXPLORATION_SYSTEM}\n\nConversation:\n${transcript}\n\nRespond to the user's latest message.`;
}

const PATHS_SYSTEM = `You are whatimado — a career and life planning peer.
From the conversation below, propose exactly 3 distinct, realistic paths the user could take next.
Each path should fit their constraints (schedule, skills, stability needs) mentioned in the chat.
Do not include medical or clinical advice.

Return ONLY valid JSON — no markdown fences, no commentary:
{
  "intro": "One warm sentence inviting them to explore the map",
  "paths": [
    {
      "id": "kebab-case-id",
      "label": "Short map label (max 14 chars)",
      "title": "Clear path name",
      "description": "1-2 sentences on what this path involves"
    }
  ]
}`;

/**
 * @param {{ role: "user"|"assistant", content: string }[]} messages
 */
export function buildPathsPrompt(messages) {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`)
    .join("\n\n");
  return `${PATHS_SYSTEM}\n\nConversation:\n${transcript}\n\nGenerate the JSON now.`;
}

/**
 * @param {string} raw
 * @returns {{ intro: string, paths: { id: string, label: string, title: string, description: string }[] }}
 */
export function parseAdvisorPathsResponse(raw) {
  const text = String(raw || "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Advisor did not return JSON paths");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const paths = Array.isArray(parsed?.paths) ? parsed.paths : [];

  if (paths.length < 1) {
    throw new Error("No paths in advisor response");
  }

  return {
    intro: String(parsed.intro || "Here are a few directions that could fit — tap a node or card to explore."),
    paths: paths.slice(0, 4).map((path, index) => ({
      id: String(path.id || `path-${index + 1}`),
      label: String(path.label || path.title || `Path ${index + 1}`),
      title: String(path.title || path.label || `Path ${index + 1}`),
      description: String(path.description || "")
    }))
  };
}
