import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value))
  },
  location: { pathname: "/app.html", search: "" },
  crypto: { randomUUID: () => "session-1" }
};
globalThis.document = { querySelector: () => null };

const { ADMIN_USER_ID, isAdminUser } = await import("./cloud-config.js");
const { analyticsIsAdmin, buildEventRow, setAnalyticsUser } = await import("./analytics.js");

test("isAdminUser matches the admin id only", () => {
  assert.equal(isAdminUser({ id: ADMIN_USER_ID }), true);
  assert.equal(isAdminUser({ id: "someone-else", email: "ashtonsemailis@gmail.com" }), false);
  assert.equal(isAdminUser(null), false);
});

test("guests and other accounts send is_admin: false", () => {
  setAnalyticsUser(null);
  assert.equal(buildEventRow("app_loaded").is_admin, false);
  setAnalyticsUser({ id: "11111111-1111-1111-1111-111111111111" });
  const row = buildEventRow("prompt_submitted");
  assert.equal(row.is_admin, false);
  assert.equal(row.user_id, "11111111-1111-1111-1111-111111111111");
});

test("the admin account sends is_admin: true for the rest of the session", () => {
  setAnalyticsUser({ id: ADMIN_USER_ID });
  const row = buildEventRow("map_generated", { paths: 3 });
  assert.equal(row.is_admin, true);
  assert.equal(row.user_id, ADMIN_USER_ID);
  assert.equal(row.metadata.paths, 3);

  setAnalyticsUser(null);
  const after = buildEventRow("roadmap_opened");
  assert.equal(after.user_id, null);
  assert.equal(after.is_admin, true);
  assert.equal(analyticsIsAdmin(), true);
  assert.equal(store.get("whatimado_v2_analytics_admin"), "1");
});
