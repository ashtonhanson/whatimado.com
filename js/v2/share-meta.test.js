import assert from "node:assert/strict";
import test from "node:test";
import { SHARE_IMAGE_BLANK, SHARE_IMAGE_MAP, SHARE_IMAGE_VERSION, shareImageForPhase } from "./share-meta.js";

const ORIGIN = "https://dev.whatimado.com";

test("users without a map get the blank-slate share card", () => {
  for (const phase of ["open", "exploring", "coaching", undefined, "unknown"]) {
    assert.equal(shareImageForPhase(phase, ORIGIN), `${ORIGIN}${SHARE_IMAGE_BLANK}?v=${SHARE_IMAGE_VERSION}`);
  }
});

test("users with a map get the map share card", () => {
  for (const phase of ["possibilities", "path_selected", "missions"]) {
    assert.equal(shareImageForPhase(phase, ORIGIN), `${ORIGIN}${SHARE_IMAGE_MAP}?v=${SHARE_IMAGE_VERSION}`);
  }
});
