/**
 * Sidebar pages that cover the map column: Analytics (founder only) and Settings.
 * Home (or Back to map / Escape) closes the page without starting a new map.
 */
import { appStore } from "../state/store.js";
import { locationFromDraft } from "../state/location.js";
import { readPrefs } from "../state/prefs.js";
import { schedulePersist } from "../state/persistence.js";
import { authState, deleteAllData, loadLaunchStats, onAuthChange, reloadApp, saveProfile, submitSuggestion } from "../state/auth.js";

const PAGES = /** @type {const} */ (["analytics", "settings"]);

/** @param {string} id */
const $ = (id) => document.getElementById(id);

/** @param {string} id @param {string} text */
function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

/** @param {string} id */
function inputValue(id) {
  return String(/** @type {HTMLInputElement | null} */ ($(id))?.value || "").trim();
}

/** @param {string} id @param {string} value */
function setInput(id, value) {
  const el = /** @type {HTMLInputElement | null} */ ($(id));
  if (el) el.value = value || "";
}

/* ---------- Analytics ---------- */

const CLEAN_VIEW_KEY = "whatimado_v2_stats_clean_view";
const CLEAN_VIEW_SUB = "Real visitors only. Any session where you signed in is excluded, even the parts before login.";

let statsPeriod = /** @type {"post" | "week" | "all"} */ ("post");
let dayOrder = "newest";
/** @type {any} */
let lastStats = null;
let cleanView = readCleanView();

/** Defaults to on; only an explicit "0" turns it off. */
export function readCleanView() {
  try {
    return window.localStorage.getItem(CLEAN_VIEW_KEY) !== "0";
  } catch {
    return true;
  }
}

/** @param {boolean} on */
function writeCleanView(on) {
  try {
    window.localStorage.setItem(CLEAN_VIEW_KEY, on ? "1" : "0");
  } catch {
    /* the choice still holds until reload */
  }
}

/** @param {any} [data] */
function renderCleanView(data) {
  const toggle = $("stats-clean-view");
  toggle?.setAttribute("aria-checked", cleanView ? "true" : "false");
  const badge = $("stats-admin-badge");
  if (badge) badge.hidden = cleanView;
  $("page-analytics")?.classList.toggle("is-admin-included", !cleanView);
  const adminSessions = Number(data?.admin_sessions);
  setText(
    "stats-sub",
    cleanView
      ? CLEAN_VIEW_SUB
      : Number.isFinite(adminSessions)
        ? `Full dataset: real visitors plus ${adminSessions} admin session${adminSessions === 1 ? "" : "s"} from your own account.`
        : "Full dataset: real visitors plus sessions from your own admin account."
  );
}

/** @param {any} row */
function dayKey(row) {
  const parsed = Date.parse(row?.day_iso || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @param {string} label
 * @param {number} value
 * @param {number} max
 * @param {string} tone
 */
function metricRow(label, value, max, tone) {
  const row = document.createElement("div");
  row.className = "v2-stats__metric";
  const name = document.createElement("span");
  name.textContent = label;
  const track = document.createElement("span");
  track.className = "v2-stats__track";
  const bar = document.createElement("i");
  bar.className = `v2-stats__bar v2-stats__bar--${tone}`;
  bar.style.width = `${max > 0 && value > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0}%`;
  track.append(bar);
  const num = document.createElement("strong");
  num.textContent = String(value);
  row.append(name, track, num);
  return row;
}

/** @param {any} data */
export function renderLaunchStats(data) {
  lastStats = data;
  renderCleanView(data);
  const visits = Number(data?.visits) || 0;
  const started = Number(data?.started) || 0;
  const maps = Number(data?.got_map) || 0;
  const roadmaps = Number(data?.roadmaps) || 0;
  setText("stats-visits", String(visits));
  setText("stats-started", String(started));
  setText("stats-maps", String(maps));
  setText("stats-roadmaps", String(roadmaps));

  const funnel = $("stats-funnel");
  if (funnel) {
    funnel.replaceChildren();
    const steps = [
      ["Visits", visits, "visits"],
      ["Started", started, "started"],
      ["Got map", maps, "maps"],
      ["Roadmap", roadmaps, "roadmaps"]
    ];
    steps.forEach(([label, value, tone], index) => {
      if (index > 0) {
        const prev = Number(steps[index - 1][1]);
        const link = document.createElement("span");
        link.className = "v2-stats__link";
        link.setAttribute("aria-hidden", "true");
        link.textContent = `→ ${prev ? Math.round((Number(value) / prev) * 100) : 0}%`;
        funnel.append(link);
      }
      const step = document.createElement("div");
      step.className = `v2-stats__step v2-stats__step--${tone}`;
      const num = document.createElement("strong");
      num.textContent = String(value);
      const name = document.createElement("span");
      name.textContent = String(label);
      step.append(num, name);
      funnel.append(step);
    });
  }
  setText(
    "stats-funnel-caption",
    visits
      ? `${maps} of ${visits} visits reached a map (${Math.round((maps / visits) * 100)}%). The arrows show how many move on to the next step.`
      : "No guest visits in this period yet."
  );

  const days = $("stats-days");
  if (days) {
    days.replaceChildren();
    const rows = [...(Array.isArray(data?.daily) ? data.daily : [])].sort((a, b) =>
      dayOrder === "newest" ? dayKey(b) - dayKey(a) : dayKey(a) - dayKey(b)
    );
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "v2-page__caption";
      empty.textContent = "No daily activity in this period.";
      days.append(empty);
    }
    const max = Math.max(1, ...rows.map((row) => Number(row.visits) || 0));
    for (const row of rows) {
      const card = document.createElement("div");
      card.className = "v2-stats__day";
      const head = document.createElement("p");
      head.className = "v2-stats__day-head";
      head.textContent = String(row.day || "");
      card.append(
        head,
        metricRow("Visits", Number(row.visits) || 0, max, "visits"),
        metricRow("Started", Number(row.started) || 0, max, "started"),
        metricRow("Got map", Number(row.maps) || 0, max, "maps")
      );
      days.append(card);
    }
  }

  let updated = "";
  if (data?.generated_at) {
    try {
      updated = `Updated ${new Date(data.generated_at).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })} Central`;
    } catch {
      updated = "";
    }
  }
  setText("stats-updated", updated);
}

/** @param {string} message @param {"loading" | "error" | ""} tone */
function statsStatus(message, tone) {
  const el = $("stats-status");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message;
  el.dataset.tone = tone;
}

let statsRequest = 0;

async function refreshStats() {
  const request = ++statsRequest;
  statsStatus("Loading stats…", "loading");
  const result = await loadLaunchStats(statsPeriod, { includeAdmin: !cleanView });
  if (request !== statsRequest) return;
  if (!result.ok) {
    statsStatus(result.message || "Could not load stats.", "error");
    setText("stats-funnel-caption", "");
    return;
  }
  statsStatus("", "");
  renderLaunchStats(result.data);
}

function initAnalytics() {
  document.querySelectorAll("[data-stats-period]").forEach((button) => {
    button.addEventListener("click", () => {
      statsPeriod = /** @type {any} */ (button.getAttribute("data-stats-period"));
      document.querySelectorAll("[data-stats-period]").forEach((other) => other.classList.toggle("is-active", other === button));
      void refreshStats();
    });
  });
  document.querySelectorAll("[data-stats-day-order]").forEach((button) => {
    button.addEventListener("click", () => {
      dayOrder = button.getAttribute("data-stats-day-order") || "newest";
      document.querySelectorAll("[data-stats-day-order]").forEach((other) => other.classList.toggle("is-active", other === button));
      if (lastStats) renderLaunchStats(lastStats);
    });
  });
  $("stats-refresh")?.addEventListener("click", () => void refreshStats());
  $("stats-clean-view")?.addEventListener("click", () => {
    cleanView = !cleanView;
    writeCleanView(cleanView);
    renderCleanView();
    void refreshStats();
  });
  renderCleanView();
}

/* ---------- Settings ---------- */

function fillSettings() {
  const prefs = readPrefs();
  const loc = appStore.location?.city || appStore.location?.region ? appStore.location : prefs.location;
  setInput("settings-name", prefs.name || appStore.profile?.name || "");
  setInput("settings-country", loc.country);
  setInput("settings-region", loc.region);
  setInput("settings-city", loc.city);
  setInput("settings-postal", loc.postal);
  if (!inputValue("settings-suggest-name")) setInput("settings-suggest-name", prefs.name);
}

/** @param {import("../state/auth.js").AuthState} state */
function renderSettingsAccount(state) {
  const primary = $("settings-account-primary");
  const secondary = $("settings-account-secondary");
  if (state.user) {
    setText("settings-account-line", `Signed in as ${state.user.email || "your account"}.`);
    setText(
      "settings-account-sync",
      state.sync === "error" ? `Not synced yet: ${state.syncError}` : state.sync === "syncing" ? "Syncing…" : "Roadmaps back up to this account."
    );
    if (primary) primary.textContent = "Account and sync";
    if (secondary) secondary.hidden = true;
    return;
  }
  setText("settings-account-line", "You're using whatimado as a guest. Maps save in this browser.");
  setText("settings-account-sync", "Create an account to back roadmaps up and open them on other devices.");
  if (primary) primary.textContent = "Create account";
  if (secondary) secondary.hidden = false;
}

function initSettings() {
  $("settings-account-primary")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("v2-open-account", { detail: { mode: "create" } }));
  });
  $("settings-account-secondary")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("v2-open-account", { detail: { mode: "signin" } }));
  });

  $("settings-profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = inputValue("settings-name");
    const draft = {
      country: inputValue("settings-country"),
      region: inputValue("settings-region"),
      city: inputValue("settings-city"),
      postal: inputValue("settings-postal")
    };
    setText("settings-profile-status", "Saving…");
    const result = await saveProfile({ name, location: draft });
    if (appStore.journey?.id) {
      appStore.profile.name = name;
      if (draft.city || draft.region || draft.country) appStore.location = locationFromDraft(draft);
      schedulePersist();
    }
    setText(
      "settings-profile-status",
      result.synced ? "Saved to your account." : authState().user ? "Saved on this device. Account sync didn't go through." : "Saved on this device."
    );
  });

  $("settings-suggest-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = inputValue("settings-suggest-text");
    if (text.length < 4) {
      setText("settings-suggest-status", "Write a few words about the change you'd like.");
      return;
    }
    setText("settings-suggest-status", "Sending…");
    const result = await submitSuggestion(inputValue("settings-suggest-name"), text);
    if (!result.ok) {
      setText("settings-suggest-status", result.message || "Could not send the suggestion.");
      return;
    }
    setInput("settings-suggest-text", "");
    setText("settings-suggest-status", "Thanks. Your suggestion was sent.");
  });

  $("settings-delete")?.addEventListener("click", async () => {
    const signedIn = Boolean(authState().user);
    const ok = window.confirm(
      signedIn
        ? "Delete every roadmap and note from this browser and from your account? This can't be undone."
        : "Delete every roadmap and note from this browser? This can't be undone."
    );
    if (!ok) return;
    setText("settings-delete-status", "Deleting…");
    const result = await deleteAllData();
    if (!result.ok) {
      setText("settings-delete-status", result.message || "Could not delete the account copy. Nothing was removed.");
      return;
    }
    setText("settings-delete-status", "Deleted. Starting fresh…");
    reloadApp();
  });
}

/* ---------- Page switching ---------- */

export function initPages() {
  /** @type {string | null} */
  let current = null;
  const home = $("nav-home");

  /** @param {string | null} name */
  const show = (name) => {
    current = name;
    for (const page of PAGES) {
      const el = $(`page-${page}`);
      const nav = $(`nav-${page}`);
      const on = page === name;
      el?.classList.toggle("hidden", !on);
      el?.setAttribute("aria-hidden", on ? "false" : "true");
      nav?.classList.toggle("is-active", on);
      if (on) nav?.setAttribute("aria-current", "page");
      else nav?.removeAttribute("aria-current");
    }
    home?.classList.toggle("is-active", !name);
    if (document.body.classList.contains("v2-mobile-menu-open")) $("mobile-menu-backdrop")?.click();
    if (name) document.body.dataset.page = name;
    else delete document.body.dataset.page;
    if (name) $(`page-${name}`)?.focus({ preventScroll: true });
  };

  $("nav-analytics")?.addEventListener("click", () => {
    show("analytics");
    void refreshStats();
  });
  $("nav-settings")?.addEventListener("click", () => {
    fillSettings();
    show("settings");
  });
  document.querySelectorAll("[data-page-close]").forEach((button) => button.addEventListener("click", () => show(null)));

  document.addEventListener(
    "click",
    (event) => {
      if (!current) return;
      const target = /** @type {HTMLElement} */ (event.target);
      if (!target?.closest?.("#nav-home")) return;
      event.stopPropagation();
      event.preventDefault();
      show(null);
    },
    true
  );
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !current) return;
    if (document.querySelector("dialog[open]")) return;
    show(null);
  });

  initAnalytics();
  initSettings();

  onAuthChange((state) => {
    const item = $("nav-analytics-item");
    if (item) item.hidden = !state.founder;
    if (!state.founder && current === "analytics") show(null);
    renderSettingsAccount(state);
  });
}
