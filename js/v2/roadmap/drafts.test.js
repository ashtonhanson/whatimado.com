import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resourceDraftContextStamp,
  sanitizeDraftBody,
  validateDraftForCopy
} from "./drafts.js";
import { stripEphemeralResourceDrafts } from "./resources.js";
import { missionDraftContextStamp, normalizeMissionFields } from "./mission-model.js";

describe("draft hygiene", () => {
  it("strips internal mission slugs from copy", () => {
    const cleaned = sanitizeDraftBody("Follow up on m-email-studio-lead tomorrow.");
    assert.equal(cleaned.includes("m-email"), false);
  });

  it("blocks copy while placeholders remain", () => {
    const check = validateDraftForCopy("Hi [your name], free [two times].");
    assert.equal(check.ok, false);
  });

  it("allows ordinary bracketed prose", () => {
    const check = validateDraftForCopy("Ask whether they [still] take walk-ins.");
    assert.equal(check.ok, true);
  });
});

describe("resource draft lifecycle", () => {
  it("strips generated drafts on journey load but keeps notes", () => {
    const stripped = stripEphemeralResourceDrafts([
      {
        name: "City desk",
        notes: "Called Tuesday",
        phoneDraft: "old script",
        draft: "old form",
        emailDraft: "old email",
        phoneDraftStamp: "rv1:phone:abc"
      }
    ]);
    assert.equal(stripped[0].notes, "Called Tuesday");
    assert.equal(stripped[0].phoneDraft, "");
    assert.equal(stripped[0].draft, "");
  });

  it("changes resource stamp when task context changes", () => {
    const mission = normalizeMissionFields({ title: "Call shelter", whom: "Front desk", askDo: "Ask about intake" }, 0);
    const first = resourceDraftContextStamp(mission, "phone");
    mission.askDo = "Ask about beds tonight";
    const second = resourceDraftContextStamp(mission, "phone");
    assert.notEqual(first, second);
    assert.match(first, /^rv1:phone:v1:/);
    assert.equal(missionDraftContextStamp(mission).startsWith("v1:"), true);
  });
});
