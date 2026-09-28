import assert from "node:assert/strict";
import test from "node:test";
import { migrateGuestSnapshot, startFreshAccountRoadmap, touchActiveRoadmapEntry } from "./guest-account.js";
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
