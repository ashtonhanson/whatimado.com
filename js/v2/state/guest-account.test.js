import assert from "node:assert/strict";
import test from "node:test";
import {
  addGuestRoadmapsToAccount,
  migrateGuestSnapshot,
  openAccountRoadmap,
  roadmapEntryFromSnapshot,
  startFreshAccountRoadmap,
  touchActiveRoadmapEntry,
  upsertRoadmapEntry
} from "./guest-account.js";
import { applyStructuredMissionUpdate, parseDifficultyUpdate } from "../roadmap/difficulty.js";

function guestSnapshot() {
  return {
    guestUserId: "guest_abc",
    journey: {
      id: "journey-1",
      roadmapPathId: "path-local",
      missionsStages: [
        {
          label: "First week",
          missions: [
            { id: "m1", title: "Email two studios", text: "Send a short note.", done: true, notes: "draft in notes" }
          ]
        }
      ],
      missionDrafts: [{ id: "d1", body: "keep this note" }],
      messages: [{ role: "user", content: "hello" }]
    },
    graph: {
      nodes: [{ id: "path-local", type: "path", title: "Local design" }],
      edges: [{ from: "start", to: "path-local" }],
      selectedId: "path-local"
    },
    profile: { direction: "work" },
    location: { city: "Austin" }
  };
}

test("a new account receives the guest roadmap with nodes, edges, completion, and notes", () => {
  const guest = guestSnapshot();
  const result = migrateGuestSnapshot(guest, null, "user_ada", new Date("2026-09-27T15:00:00Z"));
  assert.equal(result.imported, true);
  assert.equal(result.replacedLive, true);
  assert.equal(result.accountSnapshot.userId, "user_ada");
  assert.deepEqual(result.accountSnapshot.journey.missionsStages, guest.journey.missionsStages);
  assert.deepEqual(result.accountSnapshot.journey.missionDrafts, guest.journey.missionDrafts);
  assert.deepEqual(result.accountSnapshot.graph.nodes, guest.graph.nodes);
  assert.deepEqual(result.accountSnapshot.graph.edges, guest.graph.edges);
  assert.equal(result.accountSnapshot.importedRoadmaps.length, 0);
  assert.deepEqual(guest.journey.missionsStages[0].missions[0], {
    id: "m1",
    title: "Email two studios",
    text: "Send a short note.",
    done: true,
    notes: "draft in notes"
  });
});

test("an account that already has a roadmap keeps it and stores the guest map separately", () => {
  const guest = guestSnapshot();
  const existing = {
    userId: "user_ada",
    journey: { id: "account-live", roadmapPathId: "path-account", missionsStages: [{ label: "Already here", missions: [] }] },
    graph: { nodes: [{ id: "path-account", title: "Account map" }], edges: [] },
    importedRoadmaps: []
  };
  const result = migrateGuestSnapshot(guest, existing, "user_ada", new Date("2026-09-27T15:00:00Z"));
  assert.equal(result.replacedLive, false);
  assert.equal(result.accountSnapshot.journey.id, "account-live");
  assert.equal(result.accountSnapshot.importedRoadmaps.length, 1);
  const imported = result.accountSnapshot.importedRoadmaps[0];
  assert.equal(imported.title, "Local design · 2026-09-27");
  assert.equal(imported.journey.missionsStages[0].missions[0].done, true);
  assert.equal(imported.journey.missionDrafts[0].body, "keep this note");
  assert.deepEqual(imported.graph.edges, guest.graph.edges);
});

test("a new roadmap shelves the live one as its own entry and starts empty", () => {
  const live = migrateGuestSnapshot(guestSnapshot(), null, "user_ada").accountSnapshot;
  const now = new Date("2026-09-28T15:00:00Z");
  const next = startFreshAccountRoadmap(live, "user_ada", now, "roadmap_new");
  assert.equal(next.activeRoadmapId, "roadmap_new");
  assert.equal(next.journey, null);
  assert.deepEqual(next.graph, { nodes: [], edges: [], selectedId: null });
  assert.equal(next.profile, null);
  assert.equal(next.location, null);
  assert.equal(next.roadmaps.length, 2);
  const shelved = next.roadmaps.find((entry) => entry.id === "journey-1");
  assert.equal(shelved.title, "Local design");
  assert.deepEqual(shelved.snapshot.graph.edges, [{ from: "start", to: "path-local" }]);
  assert.equal(shelved.snapshot.journey.missionDrafts[0].body, "keep this note");
  assert.deepEqual(next.roadmaps.find((entry) => entry.id === "roadmap_new"), {
    id: "roadmap_new",
    title: "New roadmap",
    createdAt: now.getTime(),
    savedAt: now.getTime(),
    snapshot: null
  });
});

test("pressing New roadmap twice does not stack empty roadmaps", () => {
  const once = startFreshAccountRoadmap(null, "user_ada", new Date(), "roadmap_a");
  const twice = startFreshAccountRoadmap(once, "user_ada", new Date(), "roadmap_b");
  assert.deepEqual(twice.roadmaps.map((entry) => entry.id), ["roadmap_b"]);
});

test("saving the live map titles the active entry without copying it", () => {
  const fresh = startFreshAccountRoadmap(null, "user_ada", new Date(), "roadmap_a");
  const live = { ...guestSnapshot(), savedAt: 5 };
  const touched = touchActiveRoadmapEntry(fresh, live);
  assert.equal(touched.activeRoadmapId, "roadmap_a");
  assert.equal(touched.roadmaps[0].title, "Local design");
  assert.equal(touched.roadmaps[0].snapshot, null);
});

test("a guest map signing into an account with an empty active roadmap becomes that roadmap", () => {
  const fresh = startFreshAccountRoadmap(null, "user_ada", new Date(), "roadmap_a");
  const result = migrateGuestSnapshot(guestSnapshot(), fresh, "user_ada");
  assert.equal(result.replacedLive, true);
  assert.equal(result.accountSnapshot.journey.id, "journey-1");
  assert.equal(result.accountSnapshot.activeRoadmapId, "roadmap_a");
  assert.equal(result.accountSnapshot.roadmaps.length, 1);
});

test("editing a guest mission is still there after the move", () => {
  const guest = guestSnapshot();
  guest.journey.missionsStages[0].missions[0].text = "Send the note before lunch.";
  guest.journey.missionsStages[0].missions[0].done = false;
  const result = migrateGuestSnapshot(guest, null, "user_ada");
  const mission = result.accountSnapshot.journey.missionsStages[0].missions[0];
  assert.equal(mission.text, "Send the note before lunch.");
  assert.equal(mission.done, false);
});

test("applying a chat rewrite stores structured fields and leaves other missions alone", () => {
  const stages = [
    {
      label: "First week",
      missions: [
        { id: "m1", title: "Email two studios", text: "Send a short note.", done: false },
        { id: "m2", title: "Save the list", text: "Keep three names.", done: true }
      ]
    }
  ];
  const update = parseDifficultyUpdate(
    'Here you go {"title":"Email one studio","description":"Send one short note today.","suggested_steps":["Pick the studio","Send the note"],"timeline_adjustments":"Today, 20 minutes"} thanks'
  );
  const next = applyStructuredMissionUpdate(stages, "m1", update);
  assert.equal(next[0].missions[0].title, "Email one studio");
  assert.equal(next[0].missions[0].text, "Send one short note today.");
  assert.deepEqual(next[0].missions[0].suggestedSteps, ["Pick the studio", "Send the note"]);
  assert.equal(next[0].missions[0].timelineNote, "Today, 20 minutes");
  assert.equal(next[0].missions[0].transcript, undefined);
  assert.equal(next[0].missions[1].title, "Save the list");
  assert.equal(stages[0].missions[0].title, "Email two studios");
});

test("opening a saved account roadmap shelves the live one and keeps both", () => {
  const live = {
    userId: "u1",
    activeRoadmapId: "live",
    journey: { id: "journey-live", roadmapPathId: "p1" },
    graph: { nodes: [{ id: "p1", title: "Live path" }], edges: [] },
    roadmaps: [
      { id: "live", title: "Live path", createdAt: 1, savedAt: 1, snapshot: null },
      { id: "old", title: "Old", createdAt: 1, savedAt: 1, snapshot: { journey: { id: "journey-old", roadmapPathId: "p2" }, graph: { nodes: [{ id: "p2", title: "Old path" }], edges: [] } } }
    ],
    importedRoadmaps: []
  };
  const next = openAccountRoadmap(live, "old", new Date(5));
  assert.equal(next.activeRoadmapId, "old");
  assert.equal(next.journey.id, "journey-old");
  const shelved = next.roadmaps.find((entry) => entry.id === "live");
  assert.equal(shelved.snapshot.journey.id, "journey-live");
  assert.equal(next.roadmaps.find((entry) => entry.id === "old").snapshot, null);
  assert.equal(next.roadmaps.length, 2);
  assert.equal(openAccountRoadmap(live, "live"), null);
  assert.equal(openAccountRoadmap(live, "missing"), null);
});

test("opening an imported roadmap moves it into the account roadmaps", () => {
  const account = {
    userId: "u1",
    activeRoadmapId: "live",
    journey: { id: "journey-live" },
    roadmaps: [{ id: "live", title: "Live", createdAt: 1, savedAt: 1, snapshot: null }],
    importedRoadmaps: [{ id: "import_x", title: "Guest · 2026", savedAt: 2, journey: { id: "journey-g" }, graph: { nodes: [], edges: [] } }]
  };
  const next = openAccountRoadmap(account, "import_x", new Date(9));
  assert.equal(next.importedRoadmaps.length, 0);
  assert.equal(next.journey.id, "journey-g");
  assert.deepEqual(next.roadmaps.map((entry) => entry.id).sort(), ["import_x", "live"]);
});

test("guest saved roadmaps carry onto an account without duplicates", () => {
  const entry = roadmapEntryFromSnapshot({ journey: { id: "j2", roadmapPathId: "p" }, graph: { nodes: [{ id: "p", title: "Path" }], edges: [] } }, "j2", 7);
  assert.equal(entry.title, "Path");
  const account = addGuestRoadmapsToAccount({ userId: "u1", journey: { id: "j1" }, roadmaps: [] }, [entry, entry], "u1");
  assert.equal(account.roadmaps.length, 1);
  const fresh = addGuestRoadmapsToAccount(null, [entry], "u1");
  assert.equal(fresh.userId, "u1");
  assert.equal(fresh.roadmaps[0].snapshot.journey.id, "j2");
  assert.deepEqual(upsertRoadmapEntry([entry], { ...entry, title: "New" }).map((item) => item.title), ["New"]);
});
