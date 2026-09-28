import { serializeGraph } from "../graph-store.js";
import { appStore, hydrateAppStore } from "./store.js";
import { isRestorableJourney, normalizeJourney } from "./journey.js";
import { normalizeUserProfile } from "./user-profile.js";
import { normalizeLocationDraft, normalizeUserLocation } from "./location.js";
import {
  accountStorageKey,
  adoptLegacyAccount,
  clearGuestRecord,
  ensureGuestUserId,
  loadAccountSnapshot,
  migrateGuestSnapshot,
  readSession,
  removeAccountSnapshot,
  saveAccountSnapshot,
  startFreshAccountRoadmap,
  touchActiveRoadmapEntry,
  writeSession
} from "./guest-account.js";

const STORAGE_KEY = "whatimado_v2_journey_guest";
const VERSION = 1;
const SAVE_DEBOUNCE_MS = 280;

let saveTimer = 0;
let persistBound = false;
let persistEnabled = true;
/** @type {((userId: string) => void) | null} */
let accountSaveListener = null;

export function setPersistEnabled(enabled) {
  persistEnabled = Boolean(enabled);
}

/**
 * Called after every account snapshot write (cloud sync hooks in here).
 * @param {((userId: string) => void) | null} listener
 */
export function onAccountSaved(listener) {
  accountSaveListener = listener;
}

/** @param {string} userId */
function notifyAccountSaved(userId) {
  try {
    accountSaveListener?.(userId);
  } catch {
    /* sync is best effort */
  }
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
      guestUserId: typeof parsed.guestUserId === "string" ? parsed.guestUserId : ensureGuestUserId(),
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
  const session = readSession();
  const guestUserId = session?.mode === "account" ? null : ensureGuestUserId();
  return {
    version: VERSION,
    savedAt: Date.now(),
    sessionOwner: session?.mode === "account" ? session.userId : "guest",
    guestUserId,
    userId: session?.mode === "account" ? session.userId : null,
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
  const session = readSession();
  if (session?.mode === "account" && session.userId) {
    const existing = loadAccountSnapshot(session.userId);
    const saved = saveAccountSnapshot({
      ...(existing || {}),
      ...snapshot,
      ...touchActiveRoadmapEntry(existing, snapshot),
      userId: session.userId,
      importedRoadmaps: existing?.importedRoadmaps || []
    });
    if (saved) notifyAccountSaved(session.userId);
    return saved;
  }
  return writeRaw(JSON.stringify(snapshot));
}

/**
 * Signed in: shelve the live roadmap on the account and make an empty one active.
 * @returns {boolean} whether an account roadmap was opened
 */
export function openFreshAccountRoadmap() {
  const session = readSession();
  if (session?.mode !== "account" || !session.userId) return false;
  flushPersist();
  const next = startFreshAccountRoadmap(loadAccountSnapshot(session.userId), session.userId);
  const saved = saveAccountSnapshot(next);
  if (saved) notifyAccountSaved(session.userId);
  return saved;
}

/** Stop writing until the page reloads, so a handoff is not overwritten on pagehide. */
function freezePersist() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = 0;
  persistEnabled = false;
}

/**
 * Point this device at a signed-in Supabase user. A guest map in progress is
 * moved onto the account (the same handoff as account creation), and an
 * account made on this device before Supabase sign-in is carried over.
 * Persistence stays off afterwards; the caller reloads.
 * @param {string} userId Supabase user id
 * @param {string} email
 * @returns {{ keptGuest: boolean, replacedLive: boolean, adoptedLegacy: boolean }}
 */
export function adoptAccountSession(userId, email) {
  const session = readSession();
  if (session?.mode === "account" && session.userId !== userId) flushPersist();
  const adoptedLegacy = adoptLegacyAccount(email, userId);
  const guest = session?.mode === "account" ? null : buildGuestSnapshot() || loadGuestSnapshot();
  let moved = { imported: false, replacedLive: false };
  if (guest) moved = migrateGuestToAccount(userId, email);
  if (!moved.imported) writeSession({ mode: "account", userId, email });
  freezePersist();
  return { keptGuest: Boolean(moved.imported), replacedLive: Boolean(moved.replacedLive), adoptedLegacy };
}

/** Signed out: the account copy stays on the device for the next sign-in; the app opens as a guest. */
export function signOutToGuest() {
  flushPersist();
  writeSession({ mode: "guest", userId: ensureGuestUserId() });
  freezePersist();
}

/**
 * Delete every roadmap this browser holds for the current visitor.
 * @returns {string | null} the account user id that was cleared, if any
 */
export function clearAllLocalRoadmaps() {
  const session = readSession();
  freezePersist();
  removeRaw();
  if (session?.mode === "account" && session.userId) {
    removeAccountSnapshot(session.userId);
    return session.userId;
  }
  return null;
}

/** Active account roadmap entry, if the account has one. */
export function activeAccountRoadmap() {
  const session = readSession();
  if (session?.mode !== "account" || !session.userId) return null;
  const account = loadAccountSnapshot(session.userId);
  return (account?.roadmaps || []).find((entry) => entry?.id === account?.activeRoadmapId) || null;
}

/**
 * Move the guest snapshot onto an account, then delete the guest record.
 * An account that already has a live roadmap keeps it. The guest roadmap
 * is added beside it, dated today.
 * @param {string} accountUserId
 * @param {string} [email]
 */
export function migrateGuestToAccount(accountUserId, email = "") {
  const guest = buildGuestSnapshot() || loadGuestSnapshot();
  const existing = loadAccountSnapshot(accountUserId);
  const moved = migrateGuestSnapshot(guest, existing, accountUserId, new Date());
  if (!moved.accountSnapshot) return moved;
  saveAccountSnapshot(moved.accountSnapshot);
  writeSession({ mode: "account", userId: accountUserId, email });
  clearGuestRecord(window.localStorage, STORAGE_KEY);
  return moved;
}

/** @param {string} userId */
export function accountKeyFor(userId) {
  return accountStorageKey(userId);
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
function snapshotFromAccount(account) {
  if (!account) return null;
  const journey = normalizeJourney(account.journey);
  if (!isRestorableJourney(journey)) return null;
  return {
    version: VERSION,
    savedAt: Number(account.savedAt) || 0,
    sessionOwner: account.userId,
    journey,
    profile: normalizeUserProfile(account.profile),
    location: normalizeUserLocation(account.location),
    locationDraft: normalizeLocationDraft(account.locationDraft),
    graph: account.graph && typeof account.graph === "object" ? account.graph : { nodes: [], edges: [], selectedId: null }
  };
}

export function restoreGuestJourney() {
  const session = readSession();
  if (session?.mode === "account" && session.userId) {
    const account = snapshotFromAccount(loadAccountSnapshot(session.userId));
    if (account) {
      hydrateAppStore(account);
      return true;
    }
  }
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
