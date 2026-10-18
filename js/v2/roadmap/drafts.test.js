import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeDraftBody, validateDraftForCopy } from "./drafts.js";

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
