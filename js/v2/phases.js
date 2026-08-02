/** Roadmap UI phases — visibility rules for shell regions */
export const PHASE = {
  OPEN: "open",
  EXPLORING: "exploring",
  COACHING: "coaching",
  POSSIBILITIES: "possibilities",
  PATH_SELECTED: "path_selected",
  MISSIONS: "missions"
};

/** @typedef {typeof PHASE[keyof typeof PHASE]} Phase */
/** @typedef {"hidden"|"ghost"|"faint"|"visible"} MapMode */

/**
 * @param {Phase} phase
 * @param {{ ghostDismissed?: boolean }} [options]
 * @returns {{ map: MapMode, resources: boolean, possibilities: boolean, homePrompt: boolean }}
 */
export function getPhaseVisibility(phase, options = {}) {
  const { ghostDismissed = false } = options;

  switch (phase) {
    case PHASE.OPEN:
      return {
        map: ghostDismissed ? "faint" : "ghost",
        resources: true,
        possibilities: false,
        homePrompt: true
      };
    case PHASE.EXPLORING:
    case PHASE.COACHING:
      return { map: "faint", resources: true, possibilities: false, homePrompt: false };
    case PHASE.POSSIBILITIES:
      return { map: "visible", resources: true, possibilities: true, homePrompt: false };
    case PHASE.PATH_SELECTED:
    case PHASE.MISSIONS:
      return { map: "visible", resources: true, possibilities: false, homePrompt: false };
    default:
      return { map: "ghost", resources: true, possibilities: false, homePrompt: true };
  }
}

/**
 * @param {Document} doc
 * @param {Phase} phase
 * @param {{ ghostDismissed?: boolean }} [options]
 */
export function applyPhaseToDom(doc, phase, options = {}) {
  const body = doc.body;
  body.dataset.phase = phase;
  const vis = getPhaseVisibility(phase, options);

  const map = doc.querySelector("whatimado-map");
  if (map) {
    map.setAttribute("mode", vis.map);
  }

  const home = doc.getElementById("home-prompt");
  if (home) home.classList.toggle("hidden", !vis.homePrompt);

  const kicker = doc.getElementById("frame-kicker");
  if (kicker) {
    const showKicker = phase === PHASE.OPEN;
    kicker.classList.toggle("is-dismissing", !showKicker);
    if (showKicker) {
      kicker.classList.remove("hidden");
    } else {
      window.setTimeout(() => {
        if (doc.body.dataset.phase !== PHASE.OPEN) {
          kicker.classList.add("hidden");
        }
      }, 480);
    }
  }

  doc.documentElement.style.setProperty(
    "--v2-kicker-reserve",
    phase === PHASE.OPEN ? "clamp(4.5rem, 12vh, 6.25rem)" : "0px"
  );

  const possibilities = doc.getElementById("possibilities");
  if (possibilities) possibilities.classList.toggle("hidden", !vis.possibilities);

  const resources = doc.getElementById("resources-rail");
  if (resources) resources.classList.toggle("hidden", !vis.resources);
}
