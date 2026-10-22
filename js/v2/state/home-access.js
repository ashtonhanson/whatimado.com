/**
 * Public homepage vs authentication entry policy for / (and legacy /app.html aliases).
 *
 * The homepage (open phase, map + prompt) must stay reachable without signing in.
 * Auth UI is voluntary except password-recovery flows.
 */
import { isFounderUser } from "./cloud-config.js";

/**
 * Whether the guest account dialog may open automatically on first load.
 * First-time visitors previously saw sign-up immediately; that is disabled so
 * shared links land on the homepage.
 *
 * @param {{ acknowledged: boolean, hasActiveJourney: boolean, sessionMode: string | undefined }} ctx
 */
export function shouldAutoOpenGuestAccountSheet(ctx) {
  void ctx;
  return false;
}

/**
 * Auth boot may auto-present the account sheet only for in-app password recovery.
 * @param {{ recovering: boolean, user: unknown }} state
 */
export function shouldAutoOpenAccountSheetOnAuthReady(state) {
  return Boolean(state.recovering);
}

/**
 * @param {unknown} user
 */
export function canAccessLaunchStats(user) {
  return isFounderUser(user);
}

/**
 * Analytics is an owner desktop page. A narrow layout hides the menu entry.
 * The owner check is the authorization; the layout flag does not grant access.
 * @param {unknown} user
 * @param {{ desktop?: boolean }} [layout]
 */
export function analyticsPageAllowed(user, { desktop = false } = {}) {
  return Boolean(desktop) && canAccessLaunchStats(user);
}

/**
 * Anonymous or signed-in visitors opening the public entry must never be sent to an
 * external sign-in route. (In-app reload stays on the same path.)
 *
 * @param {{ supabaseUser: unknown, pathname?: string }} ctx
 */
export function shouldForceAuthRedirectForBoot(ctx) {
  void ctx;
  return false;
}

/**
 * Path used after an in-app reload (sign-in complete, sign-out, etc.).
 * @param {string} pathname
 */
export function entryPathAfterInAppReload(pathname) {
  return pathname || "/";
}
