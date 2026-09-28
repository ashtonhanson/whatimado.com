/**
 * Account roadmaps <-> public.user_roadmaps (one row per roadmap).
 *
 * Rows carry structure only: nodes, edges, missions, completion, notes,
 * profile enums and location. Chat messages, free-text profile fields and
 * the path direction note stay on the device (see PRIVACY-NOTES.md).
 *
 * A journey restored from the cloud has no messages, so it gets one short
 * assistant line; restore needs at least one message to reopen a journey.
 */
import { roadmapName } from "./guest-account.js";

const TABLE = "user_roadmaps";
const EMPTY_GRAPH = { nodes: [], edges: [], selectedId: null };
const FREE_TEXT_PROFILE_FIELDS = ["skills", "constraints", "goals", "summary"];

export const RESTORED_NOTE =
  "This roadmap was restored from your account. The chat that built it stays on the device where it happened.";

/** @param {unknown} value */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** @param {number} ms */
function iso(ms) {
  const n = Number(ms);
  return new Date(Number.isFinite(n) && n > 0 ? n : Date.now()).toISOString();
}

/** @param {string} value @param {number} max */
function clip(value, max) {
  return String(value || "").slice(0, max);
}

/** @param {object | null | undefined} profile */
export function cloudProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const copy = { ...profile };
  for (const field of FREE_TEXT_PROFILE_FIELDS) {
    if (field in copy) copy[field] = "";
  }
  return copy;
}

/**
 * @param {{ journey?: any, graph?: any, profile?: any, location?: any, locationDraft?: any }} part
 */
export function cloudPayload(part) {
  const journey = part?.journey?.id ? { ...clone(part.journey), messages: [], pathDirectionNote: "" } : null;
  return {
    journey,
    graph: clone(part?.graph) || { ...EMPTY_GRAPH },
    profile: cloudProfile(part?.profile),
    location: clone(part?.location) || null,
    locationDraft: clone(part?.locationDraft) || null
  };
}

/**
 * @param {object | null} account
 * @param {string} userId
 */
export function accountRowsFromSnapshot(account, userId) {
  if (!account || !userId) return [];
  const rows = [];
  const roadmaps = account.roadmaps || [];
  const liveId = account.activeRoadmapId || account.journey?.id || null;

  if (liveId && account.journey?.id) {
    const entry = roadmaps.find((item) => item?.id === liveId);
    const savedAt = Number(account.savedAt) || Date.now();
    rows.push({
      user_id: userId,
      roadmap_key: clip(liveId, 120),
      kind: "roadmap",
      title: clip(roadmapName(account) || entry?.title || "Roadmap", 200),
      is_active: true,
      payload: cloudPayload(account),
      created_at: iso(entry?.createdAt || account.journey.createdAt || savedAt),
      updated_at: iso(savedAt)
    });
  }

  for (const entry of roadmaps) {
    if (!entry?.id || entry.id === liveId || !entry.snapshot?.journey?.id) continue;
    rows.push({
      user_id: userId,
      roadmap_key: clip(entry.id, 120),
      kind: "roadmap",
      title: clip(entry.title || "Roadmap", 200),
      is_active: false,
      payload: cloudPayload(entry.snapshot),
      created_at: iso(entry.createdAt || entry.savedAt),
      updated_at: iso(entry.savedAt)
    });
  }

  for (const item of account.importedRoadmaps || []) {
    if (!item?.id || !item.journey?.id) continue;
    rows.push({
      user_id: userId,
      roadmap_key: clip(item.id, 120),
      kind: "imported",
      title: clip(item.title || "Guest roadmap", 200),
      is_active: false,
      payload: { ...cloudPayload(item), guestUserId: item.guestUserId || null },
      created_at: iso(item.savedAt),
      updated_at: iso(item.savedAt)
    });
  }

  return rows;
}

/**
 * @param {any} journey
 * @param {Array<{ role: string, content: string }> | null | undefined} localMessages
 */
function withMessages(journey, localMessages) {
  const copy = clone(journey);
  if (localMessages?.length) copy.messages = clone(localMessages);
  else if (!copy.messages?.length) copy.messages = [{ role: "assistant", content: RESTORED_NOTE }];
  return copy;
}

/**
 * @param {any} payload
 * @param {any} previous local copy of the same roadmap, if any
 */
function partFromPayload(payload, previous) {
  const sameJourney = previous?.journey?.id && previous.journey.id === payload.journey.id;
  return {
    journey: withMessages(payload.journey, sameJourney ? previous.journey.messages : null),
    graph: clone(payload.graph) || { ...EMPTY_GRAPH },
    profile: clone(payload.profile) || null,
    location: clone(payload.location) || null,
    locationDraft: clone(payload.locationDraft) || null
  };
}

/** @param {string} userId */
function emptyAccount(userId) {
  return {
    version: 1,
    userId,
    savedAt: 0,
    sessionOwner: userId,
    guestUserId: null,
    activeRoadmapId: null,
    journey: null,
    graph: { ...EMPTY_GRAPH },
    profile: null,
    location: null,
    locationDraft: null,
    roadmaps: [],
    importedRoadmaps: []
  };
}

/**
 * Fold cloud rows into the account snapshot kept on this device.
 * Newer wins per roadmap. Local chat messages are kept when the same journey
 * comes back from the cloud. If this device has no live roadmap, the cloud's
 * active one becomes live.
 *
 * @param {object | null} account
 * @param {Array<any>} rows
 * @param {string} userId
 * @returns {{ account: object, changedLive: boolean }}
 */
export function mergeCloudRows(account, rows, userId) {
  const base = account ? { ...emptyAccount(userId), ...clone(account), userId, sessionOwner: userId } : emptyAccount(userId);
  let roadmaps = [...(base.roadmaps || [])];
  const imported = [...(base.importedRoadmaps || [])];
  let changedLive = false;

  const ordered = [...(rows || [])].sort((a, b) => Number(Boolean(b?.is_active)) - Number(Boolean(a?.is_active)));

  /** @param {any} part @param {number} at */
  const applyLive = (part, at) => {
    base.journey = part.journey;
    base.graph = part.graph;
    base.profile = part.profile;
    base.location = part.location;
    base.locationDraft = part.locationDraft;
    base.savedAt = at;
    changedLive = true;
  };

  for (const row of ordered) {
    const id = String(row?.roadmap_key || "");
    const payload = row?.payload || {};
    const at = Date.parse(row?.updated_at) || 0;
    if (!id || !payload.journey?.id) continue;

    if (row.kind === "imported") {
      if (imported.some((item) => item?.id === id)) continue;
      imported.push({
        id,
        title: row.title || "Guest roadmap",
        savedAt: at,
        guestUserId: payload.guestUserId || null,
        ...partFromPayload(payload, null)
      });
      continue;
    }

    const liveId = base.activeRoadmapId || base.journey?.id || null;
    if (base.journey?.id && id === liveId) {
      if (at > (Number(base.savedAt) || 0)) applyLive(partFromPayload(payload, base), at);
      continue;
    }

    const index = roadmaps.findIndex((entry) => entry?.id === id);
    if (index >= 0 && roadmaps[index].snapshot) {
      const entry = roadmaps[index];
      if (at > (Number(entry.savedAt) || 0)) {
        roadmaps[index] = { ...entry, title: row.title || entry.title, savedAt: at, snapshot: partFromPayload(payload, entry.snapshot) };
      }
      continue;
    }

    if (!base.journey?.id && row.is_active && (!base.activeRoadmapId || at > (Number(base.savedAt) || 0))) {
      roadmaps = roadmaps.filter((entry) => entry?.id !== base.activeRoadmapId && entry?.id !== id);
      base.activeRoadmapId = id;
      applyLive(partFromPayload(payload, null), at);
      roadmaps.push({ id, title: row.title || "Roadmap", createdAt: Date.parse(row.created_at) || at, savedAt: at, snapshot: null });
      continue;
    }

    if (index >= 0) continue;
    roadmaps.push({
      id,
      title: row.title || "Roadmap",
      createdAt: Date.parse(row.created_at) || at,
      savedAt: at,
      snapshot: partFromPayload(payload, null)
    });
  }

  base.roadmaps = roadmaps;
  base.importedRoadmaps = imported;
  return { account: base, changedLive };
}

/** @param {any} client */
export async function pullRoadmaps(client) {
  const { data, error } = await client
    .from(TABLE)
    .select("roadmap_key, kind, title, is_active, payload, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** @param {any} client @param {Array<any>} rows */
export async function pushRoadmaps(client, rows) {
  if (!rows.length) return;
  const { error } = await client.from(TABLE).upsert(rows, { onConflict: "user_id,roadmap_key" });
  if (error) throw error;
}

/** @param {any} client @param {string} userId */
export async function deleteRoadmaps(client, userId) {
  const { error } = await client.from(TABLE).delete().eq("user_id", userId);
  if (error) throw error;
}
