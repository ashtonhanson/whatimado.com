/**
 * Guest identity and the handoff onto an account.
 *
 * A guest gets one stable guest_user_id. The roadmap snapshot (nodes, edges,
 * mission completion, notes, timestamps) is stored under that id in
 * localStorage. Creating an account runs migrateGuestSnapshot:
 *
 * - No account roadmap yet: the guest snapshot becomes the account snapshot.
 *   Nothing is dropped. The guest key is deleted so the same map is not
 *   stored twice.
 * - The account already has a roadmap: the live account map stays as it is.
 *   The guest map is appended as its own imported roadmap, titled with
 *   today's date. The guest key is still deleted.
 *
 * Accounts are Supabase users; the account snapshot is keyed by the Supabase
 * user id and mirrored to public.user_roadmaps (see cloud-roadmaps.js).
 * Passwords only ever go to Supabase Auth.
 */

const GUEST_ID_KEY = "whatimado_v2_guest_user_id";
const SESSION_KEY = "whatimado_v2_session";
const ACCOUNT_PREFIX = "whatimado_v2_account_";

/** @returns {Storage | null} */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @param {number} [now] */
export function createGuestUserId(now = Date.now()) {
  const stamp = now.toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `guest_${stamp}_${salt}`;
}

/** @param {Storage | null} [storage] */
export function ensureGuestUserId(storage = browserStorage()) {
  if (!storage) return createGuestUserId();
  const existing = storage.getItem(GUEST_ID_KEY);
  if (existing && existing.startsWith("guest_")) return existing;
  const id = createGuestUserId();
  storage.setItem(GUEST_ID_KEY, id);
  return id;
}

/** @param {string} email */
export function accountUserIdFromEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33 + normalized.charCodeAt(i)) >>> 0;
  }
  const local = normalized.split("@")[0].replace(/[^a-z0-9]/g, "").slice(0, 12) || "member";
  return `user_${local}_${hash.toString(36)}`;
}

/** @param {string} email */
export function isPlausibleEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

/** @param {Storage | null} [storage] */
export function readSession(storage = browserStorage()) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_KEY) || "null");
    if (!parsed || (parsed.mode !== "guest" && parsed.mode !== "account")) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {{ mode: "guest" | "account", userId: string, email?: string }} session
 * @param {Storage | null} [storage]
 */
export function writeSession(session, storage = browserStorage()) {
  storage?.setItem(SESSION_KEY, JSON.stringify(session));
}

/** @param {string} userId */
export function accountStorageKey(userId) {
  return `${ACCOUNT_PREFIX}${userId}`;
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function loadAccountSnapshot(userId, storage = browserStorage()) {
  if (!storage || !userId) return null;
  try {
    const parsed = JSON.parse(storage.getItem(accountStorageKey(userId)) || "null");
    if (!parsed || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {object} snapshot
 * @param {Storage | null} [storage]
 */
export function saveAccountSnapshot(snapshot, storage = browserStorage()) {
  if (!storage || !snapshot?.userId) return false;
  storage.setItem(accountStorageKey(snapshot.userId), JSON.stringify(snapshot));
  return true;
}

/**
 * Accounts made before Supabase sign-in were keyed by a hash of the email.
 * The first Supabase sign-in with that email moves the snapshot onto the
 * Supabase user id, unless that id already has one.
 * @param {string} email
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function adoptLegacyAccount(email, userId, storage = browserStorage()) {
  if (!storage || !userId) return false;
  const legacyId = accountUserIdFromEmail(email);
  if (legacyId === userId || loadAccountSnapshot(userId, storage)) return false;
  const legacy = loadAccountSnapshot(legacyId, storage);
  if (!legacy) return false;
  saveAccountSnapshot({ ...legacy, userId, sessionOwner: userId }, storage);
  storage.removeItem(accountStorageKey(legacyId));
  return true;
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function removeAccountSnapshot(userId, storage = browserStorage()) {
  if (storage && userId) storage.removeItem(accountStorageKey(userId));
}

/** @param {object | null | undefined} snapshot */
export function roadmapName(snapshot) {
  const nodes = snapshot?.graph?.nodes || [];
  const pathId = snapshot?.journey?.roadmapPathId || snapshot?.journey?.selectedPathId;
  const selected = nodes.find((node) => node.id === pathId);
  return selected?.title || selected?.label || "";
}

/**
 * @param {object | null | undefined} snapshot
 * @param {string} stamp
 */
function guestRoadmapTitle(snapshot, stamp) {
  return `${roadmapName(snapshot) || "Guest roadmap"} · ${stamp}`;
}

/** @param {object | null | undefined} snapshot */
function hasLiveRoadmap(snapshot) {
  return Boolean(snapshot?.journey?.id);
}

/** @param {number} [now] */
export function createRoadmapId(now = Date.now()) {
  return `roadmap_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Every roadmap on an account has an entry in `roadmaps`. The live fields
 * (journey, graph, profile, location) belong to `activeRoadmapId`, so its
 * entry keeps `snapshot: null`; shelved entries carry their own copy.
 *
 * @param {object | null} accountSnapshot
 * @param {string} accountUserId
 * @param {Date} [now]
 * @param {string} [roadmapId]
 */
export function startFreshAccountRoadmap(accountSnapshot, accountUserId, now = new Date(), roadmapId = createRoadmapId(now.getTime())) {
  const base = accountSnapshot || {};
  const stamp = now.getTime();
  const liveId = base.activeRoadmapId || base.journey?.id || null;
  let roadmaps = (base.roadmaps || []).filter((entry) => entry?.id && entry.id !== liveId);
  if (hasLiveRoadmap(base)) {
    const previous = (base.roadmaps || []).find((entry) => entry?.id === liveId);
    roadmaps.push({
      id: liveId,
      title: roadmapName(base) || previous?.title || "Roadmap",
      createdAt: previous?.createdAt || Number(base.journey.createdAt) || stamp,
      savedAt: stamp,
      snapshot: {
        journey: base.journey,
        graph: base.graph || { nodes: [], edges: [], selectedId: null },
        profile: base.profile || null,
        location: base.location || null,
        locationDraft: base.locationDraft || null
      }
    });
  }
  roadmaps = [...roadmaps, { id: roadmapId, title: "New roadmap", createdAt: stamp, savedAt: stamp, snapshot: null }];
  return {
    ...base,
    version: 1,
    userId: accountUserId,
    savedAt: stamp,
    sessionOwner: accountUserId,
    guestUserId: null,
    activeRoadmapId: roadmapId,
    journey: null,
    graph: { nodes: [], edges: [], selectedId: null },
    profile: null,
    location: null,
    locationDraft: null,
    roadmaps,
    importedRoadmaps: base.importedRoadmaps || []
  };
}

/**
 * Keep the active roadmap's entry titled and dated as the live map is saved.
 * @param {object | null} accountSnapshot
 * @param {object} liveSnapshot
 */
export function touchActiveRoadmapEntry(accountSnapshot, liveSnapshot) {
  const roadmaps = [...(accountSnapshot?.roadmaps || [])];
  const id = accountSnapshot?.activeRoadmapId || liveSnapshot?.journey?.id;
  if (!id) return { activeRoadmapId: null, roadmaps };
  const savedAt = Number(liveSnapshot?.savedAt) || Date.now();
  const at = roadmaps.findIndex((entry) => entry?.id === id);
  const previous = at >= 0 ? roadmaps[at] : null;
  const entry = {
    id,
    title: roadmapName(liveSnapshot) || previous?.title || "Roadmap",
    createdAt: previous?.createdAt || Number(liveSnapshot?.journey?.createdAt) || savedAt,
    savedAt,
    snapshot: null
  };
  if (at >= 0) roadmaps[at] = entry;
  else roadmaps.push(entry);
  return { activeRoadmapId: id, roadmaps };
}

/**
 * Move a guest snapshot onto an account without dropping nodes, edges,
 * completion, notes, or timestamps.
 *
 * If accountSnapshot is null, the guest map becomes the account's live map.
 * If the account already has a live map, that map stays put and the guest
 * map is stored as a separate imported roadmap dated today.
 *
 * @param {object | null} guestSnapshot
 * @param {object | null} accountSnapshot
 * @param {string} accountUserId
 * @param {Date} [now]
 */
export function migrateGuestSnapshot(guestSnapshot, accountSnapshot, accountUserId, now = new Date()) {
  const journey = guestSnapshot?.journey;
  if (!journey || !accountUserId) {
    return { accountSnapshot: accountSnapshot || null, imported: false, replacedLive: false };
  }

  const stamp = now.toISOString().slice(0, 10);
  const guestCopy = JSON.parse(JSON.stringify(guestSnapshot));
  const importedRoadmap = {
    id: `import_${stamp}_${guestCopy.guestUserId || "guest"}`,
    title: guestRoadmapTitle(guestCopy, stamp),
    savedAt: now.getTime(),
    guestUserId: guestCopy.guestUserId || null,
    journey: guestCopy.journey,
    graph: guestCopy.graph || { nodes: [], edges: [], selectedId: null },
    profile: guestCopy.profile || null,
    location: guestCopy.location || null,
    locationDraft: guestCopy.locationDraft || null
  };

  if (!hasLiveRoadmap(accountSnapshot)) {
    return {
      imported: true,
      replacedLive: true,
      accountSnapshot: {
        ...(accountSnapshot || {}),
        version: 1,
        userId: accountUserId,
        savedAt: now.getTime(),
        sessionOwner: accountUserId,
        guestUserId: null,
        journey: guestCopy.journey,
        graph: guestCopy.graph || { nodes: [], edges: [], selectedId: null },
        profile: guestCopy.profile || null,
        location: guestCopy.location || null,
        locationDraft: guestCopy.locationDraft || null,
        importedRoadmaps: accountSnapshot?.importedRoadmaps || []
      }
    };
  }

  const importedRoadmaps = [...(accountSnapshot.importedRoadmaps || []), importedRoadmap];
  return {
    imported: true,
    replacedLive: false,
    accountSnapshot: {
      ...accountSnapshot,
      userId: accountUserId,
      savedAt: now.getTime(),
      importedRoadmaps
    }
  };
}

/**
 * Forget the temporary guest id and guest snapshot after a successful move.
 * @param {Storage} storage
 * @param {string} guestSnapshotKey
 */
export function clearGuestRecord(storage, guestSnapshotKey) {
  storage.removeItem(GUEST_ID_KEY);
  storage.removeItem(guestSnapshotKey);
}
