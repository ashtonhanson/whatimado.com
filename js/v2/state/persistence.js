import { serializeGraph } from "../graph-store.js";
import { appStore, hydrateAppStore } from "./store.js";
import { isRestorableJourney, normalizeJourney } from "./journey.js";
import { normalizeUserProfile } from "./user-profile.js";
import { normalizeLocationDraft, normalizeUserLocation } from "./location.js";

const STORAGE_KEY = "whatimado_v2_journey_guest";
const VERSION = 1;
const SAVE_DEBOUNCE_MS = 280;

let saveTimer = 0;
let persistBound = false;
let persistEnabled = true;

export function setPersistEnabled(enabled) {
  persistEnabled = Boolean(enabled);
}

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function removeRaw() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** @returns {object | null} */
export function loadGuestSnapshot() {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return null;
    const journey = normalizeJourney(parsed.journey);
    if (!isRestorableJourney(journey)) return null;
    return {
      version: VERSION,
      savedAt: Number(parsed.savedAt) || 0,
      sessionOwner: "guest",
      journey,
      profile: normalizeUserProfile(parsed.profile),
      location: normalizeUserLocation(parsed.location),
      locationDraft: normalizeLocationDraft(parsed.locationDraft),
      graph: parsed.graph && typeof parsed.graph === "object" ? parsed.graph : { nodes: [], edges: [], selectedId: null }
    };
  } catch {
    return null;
  }
}

export function buildGuestSnapshot() {
  const { journey, profile, location, locationDraft } = appStore;
  if (!isRestorableJourney(journey)) return null;
  return {
    version: VERSION,
    savedAt: Date.now(),
    sessionOwner: "guest",
    journey: {
      ...journey,
      messages: journey.messages.map((m) => ({ role: m.role, content: m.content }))
    },
    profile: normalizeUserProfile(profile),
    location: normalizeUserLocation(location),
    locationDraft: normalizeLocationDraft(locationDraft),
    graph: serializeGraph()
  };
}

export function saveGuestJourney() {
  if (!persistEnabled) return false;
  const snapshot = buildGuestSnapshot();
  if (!snapshot) return false;
  return writeRaw(JSON.stringify(snapshot));
}

export function clearGuestJourney() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
  }
  removeRaw();
}

export function schedulePersist() {
  if (!persistEnabled) return;
  if (!appStore.journey.id) return;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    saveGuestJourney();
  }, SAVE_DEBOUNCE_MS);
}

export function flushPersist() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
  }
  saveGuestJourney();
}

/** @returns {boolean} whether a journey was restored */
export function restoreGuestJourney() {
  const snapshot = loadGuestSnapshot();
  if (!snapshot) return false;
  hydrateAppStore(snapshot);
  return isRestorableJourney(appStore.journey);
}

export function bindPersistLifecycle() {
  if (persistBound) return;
  persistBound = true;
  window.addEventListener("pagehide", flushPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });
}
