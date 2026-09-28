/**
 * Anonymous product events into public.site_events (insert-only for browsers).
 * Launch stats count distinct sessions for app_loaded, prompt_submitted,
 * map_generated and roadmap_opened. Metadata is scalars only, never user text.
 *
 * Every row carries is_admin. It turns true once the founder/admin account signs in
 * and stays true for the rest of that browser session, matching the database
 * trigger (which also backfills the session's earlier events and has the final say).
 */
import { getSupabase } from "./supabase-client.js";
import { isAdminUser } from "./cloud-config.js";

const SESSION_KEY = "whatimado_v2_analytics_session";
const ADMIN_SESSION_KEY = "whatimado_v2_analytics_admin";
const ONCE = new Set(["app_loaded", "prompt_submitted", "map_generated", "roadmap_opened"]);
const sent = new Set();

/** @type {string | null} */
let currentUserId = null;
let adminSession = readAdminSession();

function readAdminSession() {
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** @param {{ id?: string } | null | undefined} user */
export function setAnalyticsUser(user) {
  currentUserId = user?.id || null;
  if (!isAdminUser(user) || adminSession) return;
  adminSession = true;
  try {
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  } catch {
    /* private mode: the flag still holds for this page */
  }
}

export function analyticsIsAdmin() {
  return adminSession;
}

export function analyticsSessionId() {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** @param {Record<string, unknown>} metadata */
function cleanMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) => typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 48)
    )
  );
}

function buildTag() {
  return document.querySelector('meta[name="whatimado-build"]')?.getAttribute("content") || "v2";
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [metadata]
 */
export function buildEventRow(eventName, metadata = {}) {
  return {
    event_name: eventName,
    session_id: analyticsSessionId(),
    user_id: currentUserId,
    is_admin: adminSession,
    last_screen: "v2",
    page_path: window.location.pathname,
    metadata: cleanMetadata({ build: buildTag(), ...metadata })
  };
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [metadata]
 */
export function trackEvent(eventName, metadata = {}) {
  if (!/^[a-z][a-z0-9_]{1,80}$/.test(eventName)) return;
  if (new URLSearchParams(window.location.search).has("demo")) return;
  if (ONCE.has(eventName)) {
    if (sent.has(eventName)) return;
    sent.add(eventName);
  }
  const row = buildEventRow(eventName, metadata);
  getSupabase()
    .then((client) => client?.from("site_events").insert(row))
    .catch(() => {});
}
