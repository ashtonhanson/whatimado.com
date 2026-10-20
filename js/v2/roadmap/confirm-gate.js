import { escapeHtml, scrollFrameChildIntoView } from "../ui.js";
import { shouldBlockJobBoards } from "../intake/stability-gates.js";

const GATE_ID = "v2-confirm-gate";

const FALLBACK_INTRO = "Here's a high-level plan based on what you shared. Review it before I build your roadmap.";

/** @param {import("../state/user-profile.js").UserProfile} profile @param {string} [title] */
export function fallbackPlanSummary(profile, title = "this path") {
  if (shouldBlockJobBoards(profile)) {
    return {
      intro: FALLBACK_INTRO,
      bullets: [
        "Step 1: Sort a safe place to stay and a backup for this week",
        "Step 2: Replace ID and essential documents",
        "Step 3: Set up mail and basic benefits so later work is possible",
        `Step 4: Return to “${title}” once the basics are stable`
      ]
    };
  }
  return {
    intro: FALLBACK_INTRO,
    bullets: [
      `Step 1: Confirm that “${title}” still fits your schedule and constraints`,
      "Step 2: Line up the first practical action you can finish this week",
      "Step 3: Build proof or income that matches this path",
      "Step 4: Only then stack longer training or job-board work"
    ]
  };
}

/** @param {string} raw */
export function parsePlanSummary(raw, fallback) {
  const backup = fallback || { intro: FALLBACK_INTRO, bullets: ["Step 1: Handle the next practical step"] };
  const text = String(raw || "").trim();
  if (!text) return backup;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1] : text;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      const bullets = Array.isArray(parsed.bullets)
        ? parsed.bullets.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 7)
        : [];
      if (bullets.length) {
        return {
          intro: String(parsed.intro || backup.intro).trim() || backup.intro,
          bullets
        };
      }
    } catch {
      /* fall through */
    }
  }
  const bullets = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 7);
  return {
    intro: backup.intro,
    bullets: bullets.length ? bullets : backup.bullets
  };
}

/**
 * @param {{ title?: string, tagline?: string, why?: string, cost?: string, timeline?: string, income?: string, ideaType?: string }} idea
 * @param {string} contextBlock
 * @param {string} [revision]
 */
export function buildPlanSummaryPrompt(idea, contextBlock, revision = "") {
  const title = idea?.title || "this path";
  const extra = revision ? `\nUser requested changes: "${String(revision).slice(0, 600)}"\n` : "";
  return (
    `Plan a HIGH-LEVEL roadmap outline for "${title}" — NOT detailed tasks yet.\n\n` +
    `Path: ${title}\n` +
    `Type: ${idea?.ideaType || idea?.type || "Opportunity"}\n` +
    `Tagline: ${idea?.tagline || ""}\n` +
    `Why: ${idea?.why || ""}\n` +
    `Cost: ${idea?.cost || ""}\n` +
    `Timeline: ${idea?.timeline || ""}\n` +
    `Income: ${idea?.income || ""}\n` +
    (contextBlock ? `\n${contextBlock}\n` : "") +
    extra +
    "Output ONLY valid JSON:\n" +
    '{"intro":"2-3 short supportive sentences asking if this looks right","bullets":["Step 1: ...","Step 2: ..."]}\n' +
    "- 3 to 7 bullets.\n" +
    "- Simple, scannable language — no jargon.\n" +
    "- Stability-first when ID or housing is not confirmed as has. Do not open with job boards in that case.\n"
  );
}

/**
 * @param {HTMLElement | null} container
 */
export function hideConfirmGate(container) {
  container?.querySelector(`#${GATE_ID}`)?.remove();
}

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   label?: string,
 *   bullets: string[],
 *   confirmLabel?: string,
 *   reviseLabel?: string,
 *   onConfirm: () => void,
 *   onRevise: () => void
 * }} spec
 */
export function renderConfirmGate(container, spec) {
  if (!container) return;
  hideConfirmGate(container);
  const wrap = document.createElement("div");
  wrap.id = GATE_ID;
  wrap.className = "v2-confirm-gate v2-text-box v2-text-box--chrome";
  wrap.setAttribute("aria-label", "Confirm your roadmap plan");
  wrap.innerHTML = `
    <p class="v2-confirm-gate__label">${escapeHtml(spec.label || "Here's the plan I'd suggest — does this look right?")}</p>
    <ul class="v2-confirm-gate__bullets">${(spec.bullets || [])
      .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
      .join("")}</ul>
    <div class="v2-confirm-gate__actions">
      <button type="button" class="v2-confirm-gate__btn v2-confirm-gate__btn--primary v2-text-box v2-text-box--chrome" data-confirm-action="confirm">${escapeHtml(spec.confirmLabel || "Looks good, create my roadmap")}</button>
      <button type="button" class="v2-confirm-gate__btn v2-text-box v2-text-box--chrome" data-confirm-action="revise">${escapeHtml(spec.reviseLabel || "Change something first")}</button>
    </div>
  `;
  wrap.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-confirm-action]") : null;
    if (!button) return;
    const action = button.getAttribute("data-confirm-action");
    wrap.querySelectorAll("button").forEach((el) => el.setAttribute("disabled", "true"));
    if (action === "confirm") spec.onConfirm();
    else spec.onRevise();
  });
  container.appendChild(wrap);
  scrollFrameChildIntoView(wrap);
}
