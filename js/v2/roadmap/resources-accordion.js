import { escapeHtml } from "../ui.js";
import { normalizeResources, renderResourceListHtml, resourcePlaceLabel } from "./resources.js";

/**
 * Same organizations the desktop rail shows. A task with its own list uses that
 * list; otherwise it uses the roadmap list. An empty list means no toggle.
 * @param {import("./resources.js").LocalResource[] | undefined} taskResources
 * @param {import("./resources.js").LocalResource[]} shared
 * @returns {import("./resources.js").LocalResource[]}
 */
export function resourcesForTask(taskResources, shared) {
  const own = normalizeResources(taskResources);
  if (own.length) return own;
  return shared || [];
}

/**
 * @param {{ id: string, resources: import("./resources.js").LocalResource[], place: string }} spec
 * @returns {string}
 */
export function renderResourcesAccordion(spec) {
  const resources = spec.resources || [];
  if (!resources.length) return "";
  const panelId = escapeHtml(spec.id);
  return `<div class="v2-resources-acc">
    <button type="button" class="v2-resources-acc__trigger" aria-expanded="false" aria-controls="${panelId}">
      <span>Resources</span>
      <svg class="v2-resources-acc__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </button>
    <div class="v2-resources-acc__panel is-collapsed" id="${panelId}" role="region" aria-label="Resources" aria-hidden="true" inert>
      <div class="v2-resources-acc__scroll">
        <p class="v2-nav-group-label v2-resources-region">${escapeHtml(spec.place)}</p>
        <ul class="v2-resources-list">${renderResourceListHtml(resources)}</ul>
      </div>
    </div>
  </div>`;
}

/** Keep an opened list above the composer without leaving the task. */
function revealPanel(panel) {
  const frameBody = panel.closest(".whatimado-frame__body");
  if (!frameBody) return;
  const composer = frameBody.closest("whatimado-frame")?.querySelector(".whatimado-frame__composer");
  requestAnimationFrame(() => {
    const limit = composer
      ? composer.getBoundingClientRect().top - 8
      : frameBody.getBoundingClientRect().bottom - 8;
    const overflow = panel.getBoundingClientRect().bottom - limit;
    if (overflow > 0) frameBody.scrollTop += overflow;
  });
}

/** Toggle stays on the list root so re-rendering cards does not stack listeners. */
export function bindResourcesAccordions(root) {
  if (!root || root.dataset.resourcesAccBound === "1") return;
  root.dataset.resourcesAccBound = "1";
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".v2-resources-acc__trigger");
    if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return;
    const panelId = button.getAttribute("aria-controls");
    const panel = panelId ? root.querySelector(`#${CSS.escape(panelId)}`) : null;
    const open = button.getAttribute("aria-expanded") === "true";
    const next = !open;
    button.setAttribute("aria-expanded", next ? "true" : "false");
    if (panel instanceof HTMLElement) {
      const scroller = panel.querySelector(".v2-resources-acc__scroll");
      if (!next && scroller) panel.dataset.scrollTop = String(scroller.scrollTop);
      panel.classList.toggle("is-collapsed", !next);
      panel.toggleAttribute("inert", !next);
      if (next) panel.removeAttribute("aria-hidden");
      else panel.setAttribute("aria-hidden", "true");
      if (next && scroller && panel.dataset.scrollTop) {
        scroller.scrollTop = Number(panel.dataset.scrollTop);
      }
      if (next) revealPanel(panel);
    }
  });
}

export { resourcePlaceLabel };
