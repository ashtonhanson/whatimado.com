/** Vertical frame dock — free drag, inertial glide, midway gravity snap */
export const SNAP = {
  TOP: "top",
  HOME: "home",
  BOTTOM: "bottom",
  MOBILE_COLLAPSED: "mobile-collapsed",
  MOBILE_FOCUS: "mobile-focus"
};

export const MOBILE_MQ = window.matchMedia("(max-width: 900px)");
export const MOBILE_GROW_EASE_MS = 420;
export const MOBILE_GLIDE_EASE_MS = 520;
export const MOBILE_HINT_DELAY_MS = 380;
export const MOBILE_FOCUS_RELEASE_MS = 380;
export const MOBILE_LAYOUT_FADE_MS = 220;

/** Glide tuning — aligned with map node release physics */
export const GLIDE_VEL_SCALE = 0.52;
export const GLIDE_FRICTION = 0.905;
export const GLIDE_MIN_SPEED = 0.06;
export const GLIDE_MAX_SPEED = 22;

/** Minimum panel height at Bottom Cushion — uses min height, not live offsetHeight */
export const MIN_FRAME_HEIGHT = 260;
export const BOTTOM_CONTENT_CUSHION = 36;

/** Minimum vertical band between Home Base and Bottom Cushion (fraction of main height) */
export const HOME_BOTTOM_MIN_SEP = 0.2;

/** Final ease into anchor after glide settles */
export const SNAP_EASE_MS = 680;

/** Flick bias shifts midway thresholds in the direction of travel (px equivalent) */
export const FLICK_VEL_BIAS = 0.38;

export const KICKER_RESERVE_DEFAULT = "clamp(4.5rem, 11.5vh, 5.75rem)";

export const EASE_MS = SNAP_EASE_MS;
export const EASE_CURVE = "cubic-bezier(0.32, 0.94, 0.42, 1)";
