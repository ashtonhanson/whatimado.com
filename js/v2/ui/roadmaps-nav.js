import { ROADMAPS_CHANGED_EVENT, listSavedRoadmaps, saveCurrentMap } from "../state/persistence.js";
import { escapeHtml } from "../ui.js";

/** @param {number} savedAt */
function savedLabel(savedAt) {
  if (!savedAt) return "";
  try {
    return new Date(savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Sidebar Roadmaps button: shows the open map and saved roadmaps; picking one reopens it.
 * @param {{ onOpen: (roadmapId: string) => void }} options
 */
export function bindRoadmapsNav({ onOpen }) {
  const button = document.getElementById("nav-roadmaps");
  const listEl = document.getElementById("nav-roadmaps-list");
  if (!button || !listEl) return;

  const isOpen = () => button.getAttribute("aria-expanded") === "true";

  function render() {
    const roadmaps = listSavedRoadmaps();
    if (!roadmaps.length) {
      listEl.innerHTML = `<li class="v2-roadmaps-empty">No saved roadmaps yet.</li>`;
      return;
    }
    listEl.innerHTML = roadmaps
      .map((entry) => {
        const when = entry.current ? "Open now" : savedLabel(entry.savedAt);
        return `<li>
          <button type="button" class="v2-roadmaps-item${entry.current ? " is-current" : ""}" data-roadmap-id="${escapeHtml(entry.id)}" title="${escapeHtml(entry.title)}"${entry.current ? ' aria-current="true"' : ""}>
            <span class="v2-roadmaps-item__title">${escapeHtml(entry.title)}</span>
            ${when ? `<span class="v2-roadmaps-item__meta">${escapeHtml(when)}</span>` : ""}
          </button>
        </li>`;
      })
      .join("");
  }

  /** @param {boolean} open */
  function setOpen(open) {
    button.setAttribute("aria-expanded", open ? "true" : "false");
    listEl.hidden = !open;
    if (open) render();
  }

  button.addEventListener("click", () => {
    const rail = document.getElementById("nav-rail");
    if (rail?.classList.contains("is-collapsed") && !document.body.classList.contains("v2-mobile-menu-open")) {
      document.getElementById("nav-rail-toggle")?.click();
      setOpen(true);
      return;
    }
    setOpen(!isOpen());
  });

  listEl.addEventListener("click", (event) => {
    const item = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest("[data-roadmap-id]") : null);
    if (!item || item.classList.contains("is-current")) return;
    onOpen(item.dataset.roadmapId || "");
  });

  window.addEventListener(ROADMAPS_CHANGED_EVENT, () => {
    if (isOpen()) render();
  });
}

/**
 * Save Map on the open roadmap.
 * @param {HTMLButtonElement | null} button
 */
export function bindSaveMapButton(button) {
  if (!button) return;
  let resetTimer = 0;
  button.addEventListener("click", () => {
    const saved = saveCurrentMap();
    button.textContent = saved ? "Saved" : "Not saved";
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      button.textContent = "Save Map";
    }, 1800);
  });
}
