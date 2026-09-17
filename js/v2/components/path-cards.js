import { escapeHtml } from "../ui.js";

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   paths: import("../graph-store.js").GraphNode[],
 *   selectedId: string | null,
 *   canAddMore: boolean,
 *   moreBusy: boolean,
 *   regenBusy: boolean,
 *   feedbackGiven: boolean,
 *   onSelect: (id: string) => void,
 *   onPreview: (id: string | null) => void,
 *   onDiscuss: (id: string) => void,
 *   onAlter: (id: string) => void,
 *   onMore: () => void,
 *   onRegenerate: () => void,
 *   onFeedback: (sentiment: "yes" | "no") => void
 * }} spec
 */
export function renderPathCards(container, spec) {
  if (!container) return;

  const { paths, selectedId } = spec;
  const cards = paths
    .map((path) => {
      const selected = path.id === selectedId;
      const meta = [path.cost, path.timeline, path.income].filter(Boolean);
      return `
      <article class="v2-path-card${selected ? " is-selected" : ""}" data-path-id="${escapeHtml(path.id)}" style="--path-accent: ${escapeHtml(path.accent || "#2ee8d6")}">
        <button type="button" class="v2-path-card__open" data-path-open="${escapeHtml(path.id)}">
          ${path.ideaType ? `<p class="v2-path-card__type">${escapeHtml(path.ideaType)}</p>` : ""}
          <h3>${escapeHtml(path.title || path.label)}</h3>
          ${path.tagline || path.description ? `<p class="v2-path-card__tagline">${escapeHtml(path.tagline || path.description || "")}</p>` : ""}
          ${meta.length ? `<p class="v2-path-card__meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>` : ""}
          ${path.why ? `<p class="v2-path-card__why">${escapeHtml(path.why)}</p>` : ""}
        </button>
        <div class="v2-path-card__actions">
          <button type="button" class="v2-path-card__action v2-text-box v2-text-box--chrome" data-path-discuss="${escapeHtml(path.id)}">Discuss</button>
          <button type="button" class="v2-path-card__action v2-text-box v2-text-box--chrome" data-path-alter="${escapeHtml(path.id)}">Alter this path</button>
        </div>
      </article>`;
    })
    .join("");

  const moreLabel = spec.moreBusy ? "Finding more paths…" : "More paths";
  const regenLabel = spec.regenBusy ? "Regenerating…" : "Regenerate";
  const toolbar = `
    <div class="v2-path-toolbar">
      ${
        spec.canAddMore
          ? `<button type="button" class="v2-path-toolbar__btn v2-text-box v2-text-box--chrome" data-path-more ${spec.moreBusy ? "disabled" : ""}>${moreLabel}</button>`
          : ""
      }
      <button type="button" class="v2-path-toolbar__btn v2-text-box v2-text-box--chrome" data-path-regen ${spec.regenBusy ? "disabled" : ""}>${regenLabel}</button>
    </div>
    <div class="v2-path-feedback" ${spec.feedbackGiven ? "hidden" : ""}>
      <p class="v2-path-feedback__title">Did this help so far?</p>
      <div class="v2-path-feedback__actions">
        <button type="button" class="v2-path-toolbar__btn v2-text-box v2-text-box--chrome" data-path-feedback="yes">Yes, helpful</button>
        <button type="button" class="v2-path-toolbar__btn v2-text-box v2-text-box--chrome" data-path-feedback="no">Not really yet</button>
      </div>
    </div>
    <p class="v2-path-feedback__thanks" ${spec.feedbackGiven ? "" : "hidden"}>Thanks. That helps us improve.</p>
    <p class="v2-path-sync">Maps auto-save on this device. Sign in later to continue on another one.</p>
  `;

  container.innerHTML = `${cards}${toolbar}`;
  container._pathCardSpec = spec;

  container.querySelectorAll(".v2-path-card").forEach((card) => {
    const id = card.getAttribute("data-path-id");
    if (!id) return;
    card.addEventListener("mouseenter", () => container._pathCardSpec?.onPreview(id));
    card.addEventListener("mouseleave", () => container._pathCardSpec?.onPreview(null));
  });

  if (container._pathCardsBound) return;
  container._pathCardsBound = true;
  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const current = container._pathCardSpec;
    if (!target || !current) return;
    const more = target.closest("[data-path-more]");
    if (more && !more.hasAttribute("disabled")) {
      current.onMore();
      return;
    }
    const regen = target.closest("[data-path-regen]");
    if (regen && !regen.hasAttribute("disabled")) {
      current.onRegenerate();
      return;
    }
    const feedback = target.closest("[data-path-feedback]");
    if (feedback) {
      const sentiment = feedback.getAttribute("data-path-feedback");
      if (sentiment === "yes" || sentiment === "no") current.onFeedback(sentiment);
      return;
    }
    const discuss = target.closest("[data-path-discuss]");
    if (discuss) {
      current.onDiscuss(discuss.getAttribute("data-path-discuss") || "");
      return;
    }
    const alter = target.closest("[data-path-alter]");
    if (alter) {
      current.onAlter(alter.getAttribute("data-path-alter") || "");
      return;
    }
    const open = target.closest("[data-path-open]");
    if (open) {
      current.onSelect(open.getAttribute("data-path-open") || "");
    }
  });
}
