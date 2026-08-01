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

/**
 * @param {Phase} phase
 * @returns {{ map: "hidden"|"faint"|"visible", resources: boolean, possibilities: boolean, homePrompt: boolean }}
 */
export function getPhaseVisibility(phase) {
  switch (phase) {
    case PHASE.OPEN:
      return { map: "hidden", resources: false, possibilities: false, homePrompt: true };
    case PHASE.EXPLORING:
    case PHASE.COACHING:
      return { map: "faint", resources: false, possibilities: false, homePrompt: false };
    case PHASE.POSSIBILITIES:
      return { map: "visible", resources: true, possibilities: true, homePrompt: false };
    case PHASE.PATH_SELECTED:
    case PHASE.MISSIONS:
      return { map: "visible", resources: true, possibilities: false, homePrompt: false };
    default:
      return { map: "hidden", resources: false, possibilities: false, homePrompt: true };
  }
}

/**
 * @param {Document} doc
 * @param {Phase} phase
 */
export function applyPhaseToDom(doc, phase) {
  const body = doc.body;
  body.dataset.phase = phase;
  const vis = getPhaseVisibility(phase);

  const map = doc.getElementById("map-canvas");
  if (map) {
    map.classList.toggle("is-visible", vis.map === "visible");
    map.classList.toggle("is-faint", vis.map === "faint");
    map.setAttribute("aria-hidden", vis.map === "hidden" ? "true" : "false");
  }

  const home = doc.getElementById("home-prompt");
  if (home) home.classList.toggle("hidden", !vis.homePrompt);

  const kicker = doc.getElementById("frame-kicker");
  if (kicker) kicker.classList.toggle("hidden", phase !== PHASE.OPEN);

  const possibilities = doc.getElementById("possibilities");
  if (possibilities) possibilities.classList.toggle("hidden", !vis.possibilities);

  const resources = doc.getElementById("resources-rail");
  if (resources) resources.classList.toggle("hidden", !vis.resources);
}
