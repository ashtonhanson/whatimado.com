import assert from "node:assert/strict";
import test from "node:test";
import { RESTORED_NOTE, accountRowsFromSnapshot, cloudPayload, mergeCloudRows } from "./cloud-roadmaps.js";
import {
  accountStorageKey,
  accountUserIdFromEmail,
  adoptLegacyAccount,
  loadAccountSnapshot,
  migrateGuestSnapshot,
  startFreshAccountRoadmap
} from "./guest-account.js";

const UID = "5b1c0f5e-0000-4000-8000-000000000001";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    keys: () => [...data.keys()]
  };
}

function guest(id = "journey-1") {
  return {
    guestUserId: "guest_abc",
    journey: {
      id,
      createdAt: 1000,
      roadmapPathId: "path-local",
      pathDirectionNote: "something the user typed",
      missionsStages: [{ label: "First week", missions: [{ id: "m1", title: "Email two studios", text: "Send a note.", done: true }] }],
      missionDrafts: [{ id: "d1", kind: "notes", body: "keep this note" }],
      messages: [{ role: "user", content: "private chat" }]
    },
    graph: { nodes: [{ id: "path-local", type: "path", title: "Local design" }], edges: [{ from: "start", to: "path-local" }], selectedId: null },
    profile: { name: "Ada", workMode: "remote", skills: "free text", goals: "free text" },
    location: { city: "Austin" }
  };
}

test("cloud payload keeps structure and drops chat, free-text profile, and the direction note", () => {
  const payload = cloudPayload(guest());
  assert.deepEqual(payload.journey.messages, []);
  assert.equal(payload.journey.pathDirectionNote, "");
  assert.equal(payload.journey.missionsStages[0].missions[0].done, true);
  assert.equal(payload.journey.missionDrafts[0].body, "keep this note");
  assert.deepEqual(payload.graph.edges, [{ from: "start", to: "path-local" }]);
  assert.equal(payload.profile.workMode, "remote");
  assert.equal(payload.profile.skills, "");
  assert.equal(payload.profile.goals, "");
});

test("an account becomes one row per roadmap: live, shelved, and imported", () => {
  const live = migrateGuestSnapshot(guest(), null, UID, new Date("2026-09-28T12:00:00Z")).accountSnapshot;
  const fresh = startFreshAccountRoadmap(live, UID, new Date("2026-09-28T13:00:00Z"), "roadmap_b");
  const withSecond = { ...fresh, journey: { ...guest("journey-2").journey }, graph: guest().graph, savedAt: Date.parse("2026-09-28T14:00:00Z") };
  const both = migrateGuestSnapshot(guest("journey-3"), withSecond, UID, new Date("2026-09-28T15:00:00Z")).accountSnapshot;
  const rows = accountRowsFromSnapshot(both, UID);
  assert.deepEqual(
    rows.map((row) => [row.roadmap_key, row.kind, row.is_active]),
    [
      ["roadmap_b", "roadmap", true],
      ["journey-1", "roadmap", false],
      ["import_2026-09-28_guest_abc", "imported", false]
    ]
  );
  assert.ok(rows.every((row) => row.user_id === UID));
  assert.ok(rows.every((row) => row.payload.journey.messages.length === 0));
});

test("an empty new roadmap is not uploaded", () => {
  const fresh = startFreshAccountRoadmap(null, UID, new Date(), "roadmap_a");
  assert.deepEqual(accountRowsFromSnapshot(fresh, UID), []);
});

test("a device with no roadmap adopts the cloud's active roadmap and can reopen it", () => {
  const source = migrateGuestSnapshot(guest(), null, UID, new Date("2026-09-28T12:00:00Z")).accountSnapshot;
  const rows = accountRowsFromSnapshot({ ...source, savedAt: 5000 }, UID);
  const { account, changedLive } = mergeCloudRows(null, rows, UID);
  assert.equal(changedLive, true);
  assert.equal(account.userId, UID);
  assert.equal(account.activeRoadmapId, "journey-1");
  assert.equal(account.journey.id, "journey-1");
  assert.deepEqual(account.journey.messages, [{ role: "assistant", content: RESTORED_NOTE }]);
  assert.equal(account.journey.missionsStages[0].missions[0].done, true);
  assert.deepEqual(account.graph.edges, [{ from: "start", to: "path-local" }]);
});

test("a newer cloud copy of the live roadmap wins but keeps this device's chat", () => {
  const local = { ...migrateGuestSnapshot(guest(), null, UID).accountSnapshot, savedAt: 1000 };
  const cloud = JSON.parse(JSON.stringify(local));
  cloud.journey.missionsStages[0].missions[0].done = false;
  const rows = accountRowsFromSnapshot({ ...cloud, savedAt: 9000 }, UID);
  const { account, changedLive } = mergeCloudRows(local, rows, UID);
  assert.equal(changedLive, true);
  assert.equal(account.journey.missionsStages[0].missions[0].done, false);
  assert.deepEqual(account.journey.messages, [{ role: "user", content: "private chat" }]);
});

test("an older cloud copy does not overwrite newer work on this device", () => {
  const local = { ...migrateGuestSnapshot(guest(), null, UID).accountSnapshot, savedAt: 9000 };
  const stale = JSON.parse(JSON.stringify(local));
  stale.journey.missionsStages[0].missions[0].done = false;
  const { account, changedLive } = mergeCloudRows(local, accountRowsFromSnapshot({ ...stale, savedAt: 1000 }, UID), UID);
  assert.equal(changedLive, false);
  assert.equal(account.journey.missionsStages[0].missions[0].done, true);
});

test("cloud roadmaps this device has never seen are shelved beside the live one", () => {
  const local = { ...migrateGuestSnapshot(guest(), null, UID).accountSnapshot, savedAt: 1000 };
  const other = migrateGuestSnapshot(guest("journey-9"), null, UID).accountSnapshot;
  const { account, changedLive } = mergeCloudRows(local, accountRowsFromSnapshot({ ...other, savedAt: 2000 }, UID), UID);
  assert.equal(changedLive, false);
  assert.equal(account.journey.id, "journey-1");
  const shelved = account.roadmaps.find((entry) => entry.id === "journey-9");
  assert.equal(shelved.snapshot.journey.id, "journey-9");
  assert.equal(shelved.snapshot.journey.messages[0].content, RESTORED_NOTE);
});

test("an account made on this device before Supabase moves onto the Supabase user id", () => {
  const storage = memoryStorage();
  const legacyId = accountUserIdFromEmail("Ada@Example.com");
  const legacy = migrateGuestSnapshot(guest(), null, legacyId).accountSnapshot;
  storage.setItem(accountStorageKey(legacyId), JSON.stringify(legacy));
  assert.equal(adoptLegacyAccount("ada@example.com", UID, storage), true);
  assert.equal(storage.getItem(accountStorageKey(legacyId)), null);
  const moved = loadAccountSnapshot(UID, storage);
  assert.equal(moved.userId, UID);
  assert.equal(moved.journey.id, "journey-1");
  assert.equal(adoptLegacyAccount("ada@example.com", UID, storage), false);
});
