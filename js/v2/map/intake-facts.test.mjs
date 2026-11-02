import assert from "node:assert/strict";
import { deriveIntakeFactNodes, isIntakeFactId, normalizeMapTopics } from "./intake-facts.js";
import { emptyUserProfile } from "../state/user-profile.js";
import { createEmptyJourney } from "../state/journey.js";

const profile = emptyUserProfile();
profile.skills = "hands-on work, fixing things";
profile.transportStatus = "has";
profile.idStatus = "has";

const location = { city: "Austin", region: "Texas", country: "USA", postal: "", raw: "" };
const journey = createEmptyJourney();
journey.completedIntakeSteps = ["transport_status", "id_status", "skills", "location_city"];
journey.pathsGenerated = true;

const nodes = deriveIntakeFactNodes(profile, location, journey);
assert.ok(nodes.some((node) => node.id === "convo-fact-location" && /Austin/.test(node.title)));
assert.ok(nodes.some((node) => node.id === "convo-fact-skills" && node.editable));
assert.ok(nodes.some((node) => node.id === "convo-phase-paths" && !node.editable));
assert.equal(isIntakeFactId("convo-fact-location"), true);
assert.equal(isIntakeFactId("convo-prompt"), false);

const normalized = normalizeMapTopics([{ id: "convo-fact-skills", label: "Skills", title: "Writing", value: "Writing", editable: true }]);
assert.equal(normalized[0].id, "convo-fact-skills");

console.log("intake-facts.test.mjs: all assertions passed");
