/**
 * Settings > Your profile. Name and location saved here are filled into new
 * roadmaps so intake can skip those questions.
 */
import { hasUsableLocation, locationFromDraft, normalizeUserLocation } from "./location.js";

const PREFS_KEY = "whatimado_v2_prefs";

/** @returns {{ name: string, location: ReturnType<typeof normalizeUserLocation> }} */
export function readPrefs() {
  let parsed = null;
  try {
    parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "null");
  } catch {
    parsed = null;
  }
  return {
    name: String(parsed?.name || "").trim().slice(0, 80),
    location: normalizeUserLocation(parsed?.location)
  };
}

/** @param {{ name?: string, location?: unknown }} prefs */
export function writePrefs(prefs) {
  const next = {
    name: String(prefs?.name || "").trim().slice(0, 80),
    location: normalizeUserLocation(prefs?.location)
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function clearPrefs() {
  try {
    window.localStorage.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fill empty name/location on a fresh store from saved prefs.
 * @param {{ profile: { name: string }, location: any }} store
 */
export function applyPrefsToStore(store) {
  const prefs = readPrefs();
  if (prefs.name && !store.profile.name) store.profile.name = prefs.name;
  const saved = locationFromDraft(prefs.location);
  if (hasUsableLocation(saved) && !hasUsableLocation(store.location)) store.location = saved;
}
