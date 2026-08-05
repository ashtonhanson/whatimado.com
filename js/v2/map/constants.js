/** Brand map physics — keep aligned with docs/v2-brand-system.md */
export const VIEW_W = 800;
export const VIEW_H = 240;

/** Post-release glide tuning */
export const GLIDE_VEL_SCALE = 0.52;
export const GLIDE_FRICTION = 0.905;
export const GLIDE_MIN_SPEED = 0.06;
export const GLIDE_MAX_SPEED = 14;

/** Map edge recovery — pull nodes back into the visible constellation band */
export const BOUND_PAD_X = 22;
export const BOUND_PAD_Y = 26;
export const BOUND_PULL = 0.1;
export const BOUND_GLIDE_DAMP = 0.52;

/** Home anchor — free pull anywhere; spring back to layout vicinity on release */
export const HOME_SOFT_RADIUS = 36;
export const HOME_SPRING_K = 0.042;
export const HOME_SPRING_DAMP = 0.928;
export const HOME_SPRING_DAMP_SETTLE = 0.82;
export const HOME_SETTLE_DIST = 0.22;
export const HOME_SETTLE_SPEED = 0.028;
export const HOME_RETURN_KICK = 0.014;
export const HOME_RETURN_KICK_MAX = 1.35;

/** Pinch zoom — scale around view center; focal point stays under fingers */
export const ZOOM_MIN = 0.72;
export const ZOOM_MAX = 2.45;
export const SCALE_CENTER_X = VIEW_W / 2;
export const SCALE_CENTER_Y = VIEW_H / 2;

/** Label sits above node body — keep in sync with renderNodeLayer text y */
export const NODE_LABEL_OFFSET = 6;
export const NODE_LABEL_CAP = 11;
export const MOBILE_MQ = window.matchMedia("(max-width: 900px)");
