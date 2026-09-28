/**
 * Anonymous product events into public.site_events (insert-only for browsers).
 * Launch stats count distinct sessions for app_loaded, prompt_submitted,
 * map_generated and roadmap_opened. Metadata is scalars only, never user text.
 */
import { getSupabase } from "./supabase-client.js";

const SESSION_KEY = "whatimado_v2_analytics_session";
const ONCE = new Set(["app_loaded", "prompt_submitted", "map_generated", "roadmap_opened"]);
const sent = new Set();

/** @type {string | null} */
let currentUserId = null;

/** @param {string | null} userId */
export function setAnalyticsUser(userId) {
  currentUserId = userId || null;
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
export function trackEvent(eventName, metadata = {}) {
  if (!/^[a-z][a-z0-9_]{1,80}$/.test(eventName)) return;
  if (new URLSearchParams(window.location.search).has("demo")) return;
  if (ONCE.has(eventName)) {
    if (sent.has(eventName)) return;
    sent.add(eventName);
  }
  const row = {
    event_name: eventName,
    session_id: analyticsSessionId(),
    user_id: currentUserId,
    last_screen: "v2",
    page_path: window.location.pathname,
    metadata: cleanMetadata({ build: buildTag(), ...metadata })
  };
  getSupabase()
    .then((client) => client?.from("site_events").insert(row))
    .catch(() => {});
}
