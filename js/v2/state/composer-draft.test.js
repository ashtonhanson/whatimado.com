import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyJourney } from "./journey.js";
import { appStore } from "./store.js";
import { writeSession } from "./guest-account.js";
import {
  cancelPendingComposerDraftSave,
  clearComposerDraft,
  flushComposerDraftSave,
  getComposerDraftScopeKey,
  readComposerDraftForCurrentScope,
  scheduleComposerDraftSave
} from "./composer-draft.js";

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };
  appStore.journey = createEmptyJourney();
  appStore.journey.id = "jrn_test";
  writeSession({ mode: "guest" });
  clearComposerDraft();
});

test("draft restores only for the matching session and journey scope", async () => {
  scheduleComposerDraftSave("hello draft");
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(readComposerDraftForCurrentScope(), "hello draft");

  appStore.journey.id = "jrn_other";
  assert.equal(readComposerDraftForCurrentScope(), "");
});

test("account scope does not inherit a guest journey draft", async () => {
  flushComposerDraftSave("guest typing");
  writeSession({ mode: "account", userId: "user-abc", email: "a@example.com" });
  assert.notEqual(getComposerDraftScopeKey(), "guest:");
  assert.equal(readComposerDraftForCurrentScope(), "");
});

test("clearing cancels pending debounced writes", async () => {
  scheduleComposerDraftSave("should not persist");
  clearComposerDraft();
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(readComposerDraftForCurrentScope(), "");
});

test("flush writes immediately for page hide semantics", () => {
  flushComposerDraftSave("saved now");
  assert.equal(readComposerDraftForCurrentScope(), "saved now");
  cancelPendingComposerDraftSave();
});
