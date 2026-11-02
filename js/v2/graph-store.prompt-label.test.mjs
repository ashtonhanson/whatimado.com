import assert from "node:assert/strict";
import { promptMapLabel, shortenMapLabel } from "./graph-store.js";

assert.equal(promptMapLabel("I want to start a mobile pet grooming business"), "mobile pet grooming");
assert.equal(promptMapLabel("Graphic Design"), "Graphic Design");
assert.ok(shortenMapLabel("Possibility Maps").length > 0);
assert.equal(promptMapLabel(""), "Goal");

console.log("graph-store.prompt-label.test.mjs: all assertions passed");
