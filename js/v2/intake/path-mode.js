/** Direct vs Flexible path mode — asked once, early. */

export const PATH_MODE = {
  DIRECT: "direct",
  FLEXIBLE: "flexible"
};

export const PATH_MODE_OPTIONS = [
  {
    value: PATH_MODE.DIRECT,
    label: "Direct Path",
    description: "A focused step-by-step guide to your goal."
  },
  {
    value: PATH_MODE.FLEXIBLE,
    label: "Flexible Path",
    description: "Choose from a variety of options at every step to build the roadmap that works for you."
  }
];

/** @param {unknown} value */
export function normalizePathMode(value) {
  return value === PATH_MODE.DIRECT || value === PATH_MODE.FLEXIBLE ? value : null;
}

/** @param {string} text */
export function parsePathMode(text) {
  const q = String(text || "").toLowerCase().trim();
  if (!q) return null;
  if (/\b(direct|linear|step[- ]?by[- ]?step|one path|focused)\b/.test(q) && !/\b(flex|branch)\b/.test(q)) {
    return PATH_MODE.DIRECT;
  }
  if (/\b(flex|flexible|branch|options at every|choose as I go)\b/.test(q)) {
    return PATH_MODE.FLEXIBLE;
  }
  if (/^direct( path)?$/.test(q)) return PATH_MODE.DIRECT;
  if (/^flex(ible)?( path)?$/.test(q)) return PATH_MODE.FLEXIBLE;
  return null;
}

/** @param {string} mode */
export function pathModeLabel(mode) {
  return mode === PATH_MODE.DIRECT ? "Direct Path" : mode === PATH_MODE.FLEXIBLE ? "Flexible Path" : "";
}
