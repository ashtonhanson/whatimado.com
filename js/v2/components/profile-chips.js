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

function frameFor(container) {
  return container?.closest?.("whatimado-frame") ?? null;
}

/**
 * Chips toggle; Continue sends every picked option as one answer.
 * @param {HTMLElement} wrap
 * @param {{ exclusiveValues?: string[], onSelect: (option: { field?: string, value: string, label: string }) => void }} spec
 */
function bindMultiSelect(wrap, spec) {
  const exclusive = new Set(spec.exclusiveValues || []);
  const chips = () => [...wrap.querySelectorAll(".v2-intake-chip[data-value]")];
  const done = /** @type {HTMLButtonElement | null} */ (wrap.querySelector("[data-chips-done]"));
  const hint = wrap.querySelector(".v2-intake-chips__hint");
  const picked = () => chips().filter((chip) => chip.getAttribute("aria-pressed") === "true");

  const refresh = () => {
    const count = picked().length;
    if (done) done.disabled = count === 0;
    if (hint) hint.textContent = count ? `${count} selected` : "Pick all that apply";
  };

  /** @param {Element} chip */
  const toggle = (chip) => {
    const on = chip.getAttribute("aria-pressed") !== "true";
    const value = chip.getAttribute("data-value") || "";
    if (on) {
      chips().forEach((other) => {
        if (other === chip) return;
        const otherValue = other.getAttribute("data-value") || "";
        if (exclusive.has(value) || exclusive.has(otherValue)) other.setAttribute("aria-pressed", "false");
      });
    }
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    refresh();
  };

  const submit = () => {
    const selection = picked();
    if (!selection.length) return;
    wrap.querySelectorAll("button").forEach((el) => el.setAttribute("disabled", "true"));
    spec.onSelect({
      field: selection[0].getAttribute("data-field") || "",
      value: selection.map((chip) => chip.getAttribute("data-value") || "").join("; "),
      label: selection.map((chip) => chip.textContent?.trim() || "").join(", ")
    });
  };

  /* The chat sheet can swallow click on touch, so pointerup acts too; the matching click is then ignored. */
  let pointerHandled = null;
  const activate = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button || !wrap.contains(button) || button.hasAttribute("disabled")) return;
    if (event.type === "click" && pointerHandled === button) {
      pointerHandled = null;
      return;
    }
    if (event.type === "pointerup") {
      pointerHandled = button;
      window.setTimeout(() => {
        if (pointerHandled === button) pointerHandled = null;
      }, 450);
    }
    event.preventDefault();
    if (button.hasAttribute("data-chips-done")) submit();
    else toggle(button);
  };
  wrap.addEventListener("pointerup", activate);
  wrap.addEventListener("click", activate);
}

/** @param {HTMLElement | null} container */
export function hideIntakeChips(container) {
  container?.querySelector(`#${CHIPS_ID}`)?.remove();
  frameFor(container)?.classList.remove("has-intake-chips");
}

/**
 * @param {HTMLElement | null} container
 * @param {{
 *   variant?: "chips" | "path-mode",
 *   options: { field?: string, value: string, label: string, description?: string }[],
 *   multiple?: boolean,
 *   exclusiveValues?: string[],
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
    const pressed = spec.multiple ? ' aria-pressed="false"' : "";
    wrap.innerHTML =
      `<div class="v2-intake-chips__list">${spec.options
        .map(
          (option) =>
            `<button type="button" class="v2-intake-chip v2-text-box v2-text-box--chrome" data-field="${escapeHtml(option.field || "")}" data-value="${escapeHtml(option.value)}"${pressed}>${escapeHtml(option.label)}</button>`
        )
        .join("")}</div>` +
      (spec.multiple
        ? `<div class="v2-intake-chips__done-row">
            <span class="v2-intake-chips__hint">Pick all that apply</span>
            <button type="button" class="v2-intake-chips__done" data-chips-done disabled>Continue</button>
          </div>`
        : "");
  }

  if (spec.multiple && spec.variant !== "path-mode") {
    bindMultiSelect(wrap, spec);
    container.appendChild(wrap);
    frameFor(container)?.classList.add("has-intake-chips");
    scrollMessages(container);
    return;
  }

  const activate = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-value]") : null;
    if (!button || button.hasAttribute("disabled")) return;
    event.preventDefault();
    wrap.querySelectorAll("button").forEach((el) => el.setAttribute("disabled", "true"));
    spec.onSelect({
      field: button.getAttribute("data-field") || "",
      value: button.getAttribute("data-value") || "",
      label: button.querySelector(".v2-path-mode-card__title")?.textContent?.trim() || button.textContent?.trim() || ""
    });
  };
  wrap.addEventListener("pointerup", activate);
  wrap.addEventListener("click", activate);

  container.appendChild(wrap);
  frameFor(container)?.classList.add("has-intake-chips");
  scrollMessages(container);
}
