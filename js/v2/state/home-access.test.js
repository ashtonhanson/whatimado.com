import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_USER_ID } from "./cloud-config.js";
import {
  canAccessLaunchStats,
  entryPathAfterInAppReload,
  shouldAutoOpenAccountSheetOnAuthReady,
  shouldAutoOpenGuestAccountSheet,
  shouldForceAuthRedirectForBoot
} from "./home-access.js";

test("first-time visitor with no session does not auto-open guest account sheet", () => {
  assert.equal(
    shouldAutoOpenGuestAccountSheet({
      acknowledged: false,
      hasActiveJourney: false,
      sessionMode: undefined
    }),
    false
  );
});

test("logged-out guest with local guest session does not auto-open account sheet", () => {
  assert.equal(
    shouldAutoOpenGuestAccountSheet({
      acknowledged: false,
      hasActiveJourney: false,
      sessionMode: "guest"
    }),
    false
  );
});

test("visitor who previously dismissed ack still does not auto-open account sheet", () => {
  assert.equal(
    shouldAutoOpenGuestAccountSheet({
      acknowledged: true,
      hasActiveJourney: false,
      sessionMode: "guest"
    }),
    false
  );
});

test("signed-out account session on device does not auto-open account sheet on refresh", () => {
  assert.equal(
    shouldAutoOpenGuestAccountSheet({
      acknowledged: false,
      hasActiveJourney: true,
      sessionMode: "account"
    }),
    false
  );
});

test("expired or missing supabase user does not force auth redirect on boot", () => {
  assert.equal(shouldForceAuthRedirectForBoot({ supabaseUser: null, pathname: "/app.html" }), false);
  assert.equal(
    shouldForceAuthRedirectForBoot({ supabaseUser: null, pathname: "/app.html" }),
    false
  );
});

test("session initialization for signed-in user does not force external auth redirect", () => {
  assert.equal(
    shouldForceAuthRedirectForBoot({
      supabaseUser: { id: "user-1", email: "a@example.com" },
      pathname: "/app.html"
    }),
    false
  );
});

test("in-app reload keeps the public entry path", () => {
  assert.equal(entryPathAfterInAppReload("/app.html"), "/app.html");
});

test("password recovery may auto-open account sheet when auth reports recovering", () => {
  assert.equal(shouldAutoOpenAccountSheetOnAuthReady({ recovering: true, user: null }), true);
  assert.equal(
    shouldAutoOpenAccountSheetOnAuthReady({ recovering: false, user: { id: "x" } }),
    false
  );
});

test("launch stats stay founder-only", () => {
  assert.equal(canAccessLaunchStats(null), false);
  assert.equal(canAccessLaunchStats({ id: "11111111-1111-1111-1111-111111111111" }), false);
  assert.equal(canAccessLaunchStats({ id: ADMIN_USER_ID, email: "a@example.com" }), true);
});

test("protected launch stats API helper rejects logged-out callers", async () => {
  const { loadLaunchStats } = await import("./auth.js");
  const result = await loadLaunchStats("post");
  assert.equal(result.ok, false);
  assert.match(String(result.message || ""), /founder|sign in/i);
});

test("reloadApp keeps visitors on app.html without auth query params", async () => {
  let assigned = "";
  globalThis.window = {
    location: {
      href: "https://dev.whatimado.com/app.html?demo=1#access_token=fake",
      pathname: "/app.html",
      search: "?demo=1",
      hash: "#access_token=fake",
      assign(url) {
        assigned = url;
      }
    }
  };
  const { reloadApp } = await import("./auth.js");
  reloadApp();
  assert.equal(assigned, "/app.html");
});
