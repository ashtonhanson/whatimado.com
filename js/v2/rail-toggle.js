const STORAGE_KEY = "v2-nav-rail-collapsed";

/** @param {boolean} collapsed */
function applyNavRailCollapsed(collapsed) {
  const rail = document.getElementById("nav-rail");
  const toggle = document.getElementById("nav-rail-toggle");
  if (!rail) return;

  rail.classList.toggle("is-collapsed", collapsed);

  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  }
}

/** Restore saved rail width preference and wire the toggle control. */
export function initNavRailToggle() {
  const rail = document.getElementById("nav-rail");
  const toggle = document.getElementById("nav-rail-toggle");
  if (!rail || !toggle) return;

  let collapsed = false;
  try {
    collapsed = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    collapsed = false;
  }

  applyNavRailCollapsed(collapsed);

  toggle.addEventListener("click", () => {
    const next = !rail.classList.contains("is-collapsed");
    applyNavRailCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore storage failures */
    }
    window.dispatchEvent(new Event("resize"));
  });
}
