import assert from "node:assert/strict";
import test from "node:test";
import { migrateGuestSnapshot } from "./guest-account.js";
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
