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
