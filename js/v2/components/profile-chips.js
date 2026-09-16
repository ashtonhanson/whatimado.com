import { escapeHtml } from "../ui.js";
import { PATH_MODE_OPTIONS } from "../intake/path-mode.js";

const CHIPS_ID = "v2-intake-chips";

function scrollMessages(container) {
  const frameBody = container?.closest?.(".whatimado-frame__body");
  if (frameBody) {
    requestAnimationFrame(() => {
      frameBody.scrollTop = frameBody.scrollHeight;
    });
  }
}

/** @param {HTMLElement | null} container */
export function hideIntakeChips(container) {
  container?.querySelector(`#${CHIPS_ID}`)?.remove();
}

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   variant?: "chips" | "path-mode",
 *   options: { field?: string, value: string, label: string, description?: string }[],
 *   onSelect: (option: { field?: string, value: string, label: string }) => void
 * }} spec
 */
export function renderIntakeChips(container, spec) {
  if (!container) return;
  hideIntakeChips(container);

  const wrap = document.createElement("div");
  wrap.id = CHIPS_ID;
  wrap.className =
    spec.variant === "path-mode"
      ? "v2-intake-chips v2-intake-chips--path-mode"
      : "v2-intake-chips";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", spec.variant === "path-mode" ? "Choose your roadmap style" : "Quick answer options");

  if (spec.variant === "path-mode") {
    wrap.innerHTML = PATH_MODE_OPTIONS.map(
      (option) => `
      <button type="button" class="v2-path-mode-card v2-text-box v2-text-box--chrome" data-field="pathMode" data-value="${escapeHtml(option.value)}">
        <span class="v2-path-mode-card__title">${escapeHtml(option.label)}</span>
        <span class="v2-path-mode-card__desc">${escapeHtml(option.description)}</span>
      </button>`
    ).join("");
  } else {
    wrap.innerHTML = `<div class="v2-intake-chips__list">${spec.options
      .map(
        (option) =>
          `<button type="button" class="v2-intake-chip v2-text-box v2-text-box--chrome" data-field="${escapeHtml(option.field || "")}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`
      )
      .join("")}</div>`;
  }

  wrap.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-value]") : null;
    if (!button || button.hasAttribute("disabled")) return;
    wrap.querySelectorAll("button").forEach((el) => el.setAttribute("disabled", "true"));
    spec.onSelect({
      field: button.getAttribute("data-field") || "",
      value: button.getAttribute("data-value") || "",
      label: button.querySelector(".v2-path-mode-card__title")?.textContent?.trim() || button.textContent?.trim() || ""
    });
  });

  container.appendChild(wrap);
  scrollMessages(container);
}
