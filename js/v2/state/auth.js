/**
 * Supabase email/password accounts for v2.
 *
 * Signing in (or creating an account that gets a session right away) runs:
 *   1. carry over an account made on this device before Supabase sign-in
 *   2. pull the account's roadmaps from public.user_roadmaps into this device
 *   3. move the guest roadmap in progress onto the account (guest-account.js rules)
 *   4. push the merged account back up
 * and the caller reloads into the account's live roadmap.
 *
 * If Supabase asks for email confirmation first, the guest roadmap stays put
 * and moves over when the confirmation link opens the app signed in.
 */
import { getSupabase } from "./supabase-client.js";
import { LAUNCH_POST_SINCE, isFounderUser } from "./cloud-config.js";
import { accountRowsFromSnapshot, deleteRoadmaps, mergeCloudRows, pullRoadmaps, pushRoadmaps } from "./cloud-roadmaps.js";
import { adoptLegacyAccount, loadAccountSnapshot, readSession, saveAccountSnapshot } from "./guest-account.js";
import { adoptAccountSession, clearAllLocalRoadmaps, flushPersist, onAccountSaved, signOutToGuest } from "./persistence.js";
import { analyticsSessionId, setAnalyticsUser, trackEvent } from "./analytics.js";
import { clearPrefs, readPrefs, writePrefs } from "./prefs.js";

const PUSH_DEBOUNCE_MS = 2500;
const RELOAD_GUARD_KEY = "whatimado_v2_cloud_reload";
const ARRIVED_FOR_RECOVERY = typeof window !== "undefined" && /type=recovery/.test(window.location.hash);

/** @typedef {{ user: any, founder: boolean, ready: boolean, sync: "idle" | "syncing" | "ok" | "error" | "offline", syncError: string, recovering: boolean }} AuthState */

/** @type {Set<(state: AuthState) => void>} */
const listeners = new Set();
/** @type {any} */
let currentUser = null;
let ready = false;
/** @type {AuthState["sync"]} */
let syncState = "idle";
let syncError = "";
let recovering = ARRIVED_FOR_RECOVERY;
let pushTimer = 0;

/** @returns {AuthState} */
export function authState() {
  return { user: currentUser, founder: isFounderUser(currentUser), ready, sync: syncState, syncError, recovering };
}

/** @param {(state: AuthState) => void} listener */
export function onAuthChange(listener) {
  listeners.add(listener);
  listener(authState());
  return () => listeners.delete(listener);
}

function emit() {
  const state = authState();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      /* one broken view should not stop the others */
    }
  }
}

/** @param {AuthState["sync"]} state @param {string} [message] */
function setSync(state, message = "") {
  syncState = state;
  syncError = message;
  emit();
}

/** @param {any} user */
function setUser(user) {
  currentUser = user || null;
  setAnalyticsUser(currentUser?.id || null);
}

function redirectUrl() {
  return `${window.location.origin}/app.html`;
}

export function reloadApp() {
  const url = new URL(window.location.href);
  url.searchParams.delete("demo");
  const hash = /access_token|error_description|type=/.test(url.hash) ? "" : url.hash;
  window.location.assign(`${url.pathname}${hash}`);
}

/** At most one automatic reload per user every 30s, so a sync problem cannot loop. */
function mayAutoReload(userId) {
  try {
    const last = JSON.parse(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || "null");
    if (last?.userId === userId && Date.now() - Number(last.at) < 30000) return false;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ userId, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** @param {any} error */
function describeError(error) {
  const message = String(error?.message || error || "").trim();
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. The link is in your inbox (check spam too).";
  if (/rate limit|too many/i.test(message)) return "Too many tries in a row. Wait a minute and try again.";
  if (/failed to fetch|network/i.test(message)) return "Could not reach the account service. Check your connection and try again.";
  if (/user_roadmaps|schema cache|42P01/i.test(message)) return "Cloud roadmaps are not set up yet (supabase/migrations/006_user_roadmaps.sql).";
  return message.length > 140 ? `${message.slice(0, 137)}…` : message || "Something went wrong. Try again.";
}

async function pushNow() {
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = 0;
  const client = await getSupabase();
  const user = currentUser;
  if (!client || !user) return false;
  const account = loadAccountSnapshot(user.id);
  if (!account) return true;
  setSync("syncing");
  try {
    await pushRoadmaps(client, accountRowsFromSnapshot(account, user.id));
    setSync("ok");
    return true;
  } catch (error) {
    setSync("error", describeError(error));
    return false;
  }
}

/** @param {string} userId */
function schedulePush(userId) {
  if (!currentUser || currentUser.id !== userId) return;
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushNow(), PUSH_DEBOUNCE_MS);
}

/** @param {any} client @param {any} user */
async function pullIntoDevice(client, user) {
  const rows = await pullRoadmaps(client);
  const local = loadAccountSnapshot(user.id);
  if (!rows.length && !local) return { changedLive: false };
  const { account, changedLive } = mergeCloudRows(local, rows, user.id);
  saveAccountSnapshot(account);
  return { changedLive };
}

/** @param {any} user */
function adoptMetadataPrefs(user) {
  const meta = user?.user_metadata || {};
  const prefs = readPrefs();
  if (prefs.name || prefs.location.city || prefs.location.region) return;
  if (!meta.full_name && !meta.whatimado_location) return;
  writePrefs({ name: meta.full_name, location: meta.whatimado_location });
}

/** @param {any} client @param {any} user */
async function completeSignIn(client, user) {
  setUser(user);
  adoptLegacyAccount(user.email || "", user.id);
  try {
    await pullIntoDevice(client, user);
  } catch (error) {
    setSync("error", describeError(error));
  }
  const moved = adoptAccountSession(user.id, user.email || "");
  await pushNow();
  adoptMetadataPrefs(user);
  emit();
  return moved;
}

/** Boot: restore the Supabase session and keep this device and the cloud in step. */
export async function initAuth() {
  onAccountSaved(schedulePush);
  window.addEventListener("pagehide", () => {
    if (pushTimer) void pushNow();
  });
  const client = await getSupabase();
  if (!client) {
    ready = true;
    setSync("offline");
    return;
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      emit();
    } else if (event === "SIGNED_OUT") {
      setUser(null);
      emit();
    } else if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && session?.user) {
      setUser(session.user);
      emit();
    }
  });

  const { data } = await client.auth.getSession();
  const user = data?.session?.user || null;
  ready = true;
  if (!user) {
    emit();
    return;
  }

  const local = readSession();
  if (!recovering && (local?.mode !== "account" || local.userId !== user.id)) {
    await completeSignIn(client, user);
    if (mayAutoReload(user.id)) reloadApp();
    return;
  }

  setUser(user);
  emit();
  if (recovering) return;
  try {
    const { changedLive } = await pullIntoDevice(client, user);
    if (changedLive && mayAutoReload(user.id)) {
      adoptAccountSession(user.id, user.email || "");
      reloadApp();
      return;
    }
    await pushNow();
  } catch (error) {
    setSync("error", describeError(error));
  }
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ ok: boolean, signedIn?: boolean, needsConfirmation?: boolean, duplicate?: boolean, keptGuest?: boolean, replacedLive?: boolean, message?: string }>}
 */
export async function createAccount(email, password) {
  const client = await getSupabase();
  if (!client) return { ok: false, message: describeError("network") };
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) {
    trackEvent("auth_signup_failed");
    return { ok: false, message: describeError(error) };
  }
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    trackEvent("auth_signup_duplicate");
    return { ok: false, duplicate: true, message: "An account with this email already exists. Sign in instead." };
  }
  if (data?.session?.user) {
    const moved = await completeSignIn(client, data.session.user);
    trackEvent("auth_signup_completed", { immediate_session: true });
    return { ok: true, signedIn: true, ...moved };
  }
  trackEvent("auth_signup_completed", { immediate_session: false });
  return { ok: true, signedIn: false, needsConfirmation: true };
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function signIn(email, password) {
  const client = await getSupabase();
  if (!client) return { ok: false, message: describeError("network") };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    trackEvent("auth_signin_failed");
    return { ok: false, message: describeError(error) };
  }
  const moved = await completeSignIn(client, data.user);
  trackEvent("auth_signin_completed");
  return { ok: true, ...moved };
}

/** @param {string} email */
export async function requestPasswordReset(email) {
  const client = await getSupabase();
  if (!client) return { ok: false, message: describeError("network") };
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) return { ok: false, message: describeError(error) };
  trackEvent("auth_password_reset_requested");
  return { ok: true };
}

/** Finish a reset link: set the new password, then open the account. @param {string} password */
export async function updatePassword(password) {
  const client = await getSupabase();
  if (!client) return { ok: false, message: describeError("network") };
  const { data, error } = await client.auth.updateUser({ password });
  if (error || !data?.user) return { ok: false, message: describeError(error) };
  recovering = false;
  await completeSignIn(client, data.user);
  return { ok: true };
}

export async function signOut() {
  const client = await getSupabase();
  flushPersist();
  const synced = currentUser ? await pushNow() : true;
  await client?.auth.signOut().catch(() => {});
  setUser(null);
  signOutToGuest();
  return { ok: true, synced };
}

/** Upload now (Settings "Sync now"). */
export function syncNow() {
  flushPersist();
  return pushNow();
}

/**
 * @param {{ name: string, location: { country: string, region: string, city: string, postal: string } }} prefs
 */
export async function saveProfile(prefs) {
  const saved = writePrefs(prefs);
  trackEvent("account_prefs_saved");
  if (!currentUser) return { ok: true, synced: false };
  const client = await getSupabase();
  const { data, error } = (await client?.auth.updateUser({ data: { full_name: saved.name, whatimado_location: saved.location } })) || {};
  if (data?.user) setUser(data.user);
  return { ok: true, synced: !error };
}

/**
 * @param {string} name
 * @param {string} suggestion
 */
export async function submitSuggestion(name, suggestion) {
  const client = await getSupabase();
  if (!client) return { ok: false, message: describeError("network") };
  const { error } = await client.from("site_suggestions").insert({
    suggestion: suggestion.slice(0, 2000),
    submitter_name: name.slice(0, 80) || null,
    session_id: analyticsSessionId(),
    user_id: currentUser?.id ?? null,
    page_path: window.location.pathname,
    build_tag: document.querySelector('meta[name="whatimado-build"]')?.getAttribute("content") || "v2"
  });
  if (error) return { ok: false, message: describeError(error) };
  trackEvent("suggestion_submitted");
  return { ok: true };
}

/** @param {"post" | "week" | "all"} period */
export function statsPeriodSince(period) {
  if (period === "post") return LAUNCH_POST_SINCE;
  if (period === "week") return new Date(Date.now() - 7 * 86400000).toISOString();
  return null;
}

/** @param {"post" | "week" | "all"} period */
export async function loadLaunchStats(period) {
  const client = await getSupabase();
  if (!client || !isFounderUser(currentUser)) return { ok: false, message: "Sign in with the founder account to see launch stats." };
  const { data, error } = await client.rpc("get_launch_stats", { since_at: statsPeriodSince(period) });
  if (error) return { ok: false, message: /not authorized|42501/i.test(error.message || "") ? "This account can't read launch stats." : describeError(error) };
  return { ok: true, data };
}

/** Settings > Delete all maps and data. Cloud rows first, then this browser. */
export async function deleteAllData() {
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = 0;
  const client = await getSupabase();
  if (currentUser && client) {
    try {
      await deleteRoadmaps(client, currentUser.id);
    } catch (error) {
      return { ok: false, message: describeError(error) };
    }
  }
  clearAllLocalRoadmaps();
  clearPrefs();
  trackEvent("journey_reset");
  return { ok: true };
}
