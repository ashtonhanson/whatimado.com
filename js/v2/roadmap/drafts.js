import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml } from "../ui.js";
import { formatUserLocation } from "../state/location.js";
import { buildIntakeContextBlock, shouldBlockJobBoards } from "../intake/stability-gates.js";

/** @typedef {"phone_script"|"outreach_email"|"notes"} DraftKind */
/** @typedef {{ id: string, kind: DraftKind, label: string, missionTitle: string, missionText: string }} DraftCatalogItem */
/** @typedef {DraftCatalogItem & { body: string }} MissionDraft */

const LABELS = {
  phone_script: "Phone script",
  outreach_email: "Outreach email",
  notes: "Notes sheet"
};

/**
 * @param {string} title
 * @param {DraftKind} kind
 */
function draftId(title, kind) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${kind}:${slug || "mission"}`;
}

/**
 * @param {{ title?: string, text?: string }} mission
 * @param {boolean} stabilityFirst
 * @returns {DraftKind}
 */
function pickKind(mission, stabilityFirst) {
  const blob = `${mission.title || ""} ${mission.text || ""}`.toLowerCase();
  if (stabilityFirst) {
    return /\b(call|phone|shelter|navigator)\b/.test(blob) ? "phone_script" : "notes";
  }
  if (/\b(email|e-mail|linkedin|message)\b/.test(blob)) return "outreach_email";
  if (/\b(call|phone)\b/.test(blob)) return "phone_script";
  return "notes";
}

/**
 * One draft per mission. Stability-first paths never get an outreach email.
 * @param {{ label: string, missions: { title: string, text: string }[] }[]} stages
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 * @returns {DraftCatalogItem[]}
 */
export function catalogForStages(stages, profile) {
  const stabilityFirst = shouldBlockJobBoards(profile);
  /** @type {DraftCatalogItem[]} */
  const items = [];
  for (const stage of stages || []) {
    for (const mission of stage.missions || []) {
      if (!mission?.title) continue;
      const kind = pickKind(mission, stabilityFirst);
      items.push({
        id: draftId(mission.title, kind),
        kind,
        label: LABELS[kind],
        missionTitle: mission.title,
        missionText: mission.text || ""
      });
      if (items.length >= 6) return items;
    }
  }
  return items;
}

/**
 * @param {DraftCatalogItem} item
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 */
export function fallbackDraft(item, location) {
  const place = formatUserLocation(location) || "[your city]";
  if (item.kind === "phone_script") {
    return [
      `Hi, my name is [your name]. I'm calling from ${place}.`,
      "",
      `I'm working on this: ${item.missionTitle}.`,
      "",
      "Can you tell me:",
      "- what I should bring",
      "- what it costs",
      "- the next time I can come in or call back",
      "",
      "I'll write down your name and the next step before I hang up."
    ].join("\n");
  }
  if (item.kind === "outreach_email") {
    return [
      "Subject: [one line about why you're writing]",
      "",
      "Hello [name],",
      "",
      `I'm in ${place}. ${item.missionText || item.missionTitle}`,
      "",
      "Could we talk for a few minutes this week? I'm free [two times].",
      "",
      "Thank you,",
      "[your name]"
    ].join("\n");
  }
  return [
    item.missionTitle,
    "",
    "Who I reached:",
    "[name and place]",
    "",
    "What they said:",
    "[one or two sentences]",
    "",
    "Next step:",
    "[the single thing I'll do next, and when]"
  ].join("\n");
}

/**
 * @param {DraftCatalogItem} item
 */
function buildDraftPrompt(item) {
  const place = formatUserLocation(appStore.location);
  const stability = shouldBlockJobBoards(appStore.profile)
    ? "STABILITY FIRST. This is a call or a note about shelter, ID, or documents. Do not write a job application, a job-board email, or a spreadsheet of employers."
    : "Do not add shelter or ID steps unless the profile needs them.";
  const shape =
    item.kind === "phone_script"
      ? "Write a short phone script they can read out loud. Include what to ask and a line for writing down the answer."
      : item.kind === "outreach_email"
        ? "Write a short email with a subject line. Put details they must personalize in [brackets]."
        : "Write a notes sheet with blank lines for who they reached, what was said, and the next step.";
  return (
    `You are whatimado. Write one draft the user can copy and edit.\n` +
    `Return only the draft. No title, no JSON, no advice before it.\n` +
    `${shape}\n` +
    `Middle-school reading level. Under 160 words.\n` +
    `${stability}\n\n` +
    `Mission: ${item.missionTitle}\n` +
    `Details: ${item.missionText}\n` +
    `Place: ${place || "not given"}\n\n` +
    buildIntakeContextBlock(appStore.profile, place, appStore.journey.pathMode)
  );
}

/**
 * @param {HTMLElement} drawer
 * @param {DraftCatalogItem[]} catalog
 * @param {MissionDraft[]} saved
 */
function renderCatalog(drawer, catalog, saved) {
  const body = drawer.querySelector("#drafts-body");
  const title = drawer.querySelector("#drafts-title");
  const back = drawer.querySelector("#drafts-back");
  if (!body || !title || !back) return;
  title.textContent = "Drafts";
  back.classList.add("hidden");
  const savedIds = new Set(saved.map((draft) => draft.id));
  body.innerHTML = catalog.length
    ? `<ul class="v2-drafts__list">${catalog
        .map(
          (item) => `<li>
            <button type="button" class="v2-drafts__item" data-draft-open="${escapeHtml(item.id)}">
              <span class="v2-drafts__kind">${escapeHtml(item.label)}</span>
              <span class="v2-drafts__mission">${escapeHtml(item.missionTitle)}</span>
              <span class="v2-drafts__state">${savedIds.has(item.id) ? "Ready" : "Write"}</span>
            </button>
          </li>`
        )
        .join("")}</ul>`
    : `<p class="v2-drafts__empty">Drafts show up with your missions.</p>`;
}

/**
 * @param {HTMLElement} drawer
 * @param {MissionDraft | null} draft
 * @param {string} status
 */
function renderReader(drawer, draft, status) {
  const body = drawer.querySelector("#drafts-body");
  const title = drawer.querySelector("#drafts-title");
  const back = drawer.querySelector("#drafts-back");
  if (!body || !title || !back) return;
  title.textContent = draft?.label || "Draft";
  back.classList.remove("hidden");
  body.innerHTML = "";
  if (status) {
    const note = document.createElement("p");
    note.className = "v2-drafts__status";
    note.textContent = status;
    body.appendChild(note);
  }
  if (!draft?.body) return;
  const mission = document.createElement("p");
  mission.className = "v2-drafts__mission-line";
  mission.textContent = draft.missionTitle;
  const text = document.createElement("pre");
  text.className = "v2-drafts__text";
  text.textContent = draft.body;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "v2-drafts__copy";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(draft.body);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Select the draft to copy";
    }
  });
  body.append(mission, text, copy);
}

/**
 * @param {{
 *   frameEl: HTMLElement | null,
 *   openBtn: HTMLButtonElement | null,
 *   flush: () => void
 * }} ui
 */
export function createDraftsController(ui) {
  const { frameEl, openBtn, flush } = ui;
  /** @type {DraftCatalogItem[]} */
  let catalog = [];
  let writing = false;

  function drawer() {
    let el = document.getElementById("drafts-drawer");
    if (el || !frameEl) return el;
    el = document.createElement("div");
    el.id = "drafts-drawer";
    el.className = "v2-drafts hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "drafts-title");
    el.innerHTML = `
      <div class="v2-drafts__bar">
        <button type="button" class="v2-drafts__back hidden" id="drafts-back">Back</button>
        <h2 class="v2-drafts__title" id="drafts-title">Drafts</h2>
        <button type="button" class="v2-drafts__close" id="drafts-close">Close</button>
      </div>
      <div class="v2-drafts__body" id="drafts-body"></div>`;
    frameEl.appendChild(el);
    el.querySelector("#drafts-close")?.addEventListener("click", close);
    el.querySelector("#drafts-back")?.addEventListener("click", () => showCatalog());
    return el;
  }

  function showCatalog() {
    const el = drawer();
    if (!el) return;
    el.classList.remove("hidden");
    renderCatalog(el, catalog, appStore.journey.missionDrafts || []);
  }

  function close() {
    drawer()?.classList.add("hidden");
  }

  /**
   * @param {MissionDraft} draft
   */
  function remember(draft) {
    const next = (appStore.journey.missionDrafts || []).filter((entry) => entry.id !== draft.id);
    next.push({
      id: draft.id,
      kind: draft.kind,
      label: draft.label,
      missionTitle: draft.missionTitle,
      body: draft.body
    });
    appStore.journey.missionDrafts = next.slice(-8);
    touchJourney();
    flush();
  }

  /**
   * @param {string} id
   */
  async function open(id) {
    const item = catalog.find((entry) => entry.id === id);
    const el = drawer();
    if (!item || !el || writing) return;
    el.classList.remove("hidden");
    const saved = (appStore.journey.missionDrafts || []).find((entry) => entry.id === id && entry.body);
    if (saved) {
      renderReader(el, { ...item, body: saved.body }, "");
      return;
    }
    writing = true;
    renderReader(el, { ...item, body: "" }, "Writing your draft");
    try {
      const raw = await callAdvisor(buildDraftPrompt(item), { maxTokens: 500, feature: "v2_draft" });
      const body = String(raw || "").trim().slice(0, 2500) || fallbackDraft(item, appStore.location);
      const draft = { ...item, body };
      remember(draft);
      renderReader(el, draft, "");
    } catch {
      const draft = { ...item, body: fallbackDraft(item, appStore.location) };
      remember(draft);
      renderReader(el, draft, "");
    } finally {
      writing = false;
    }
  }

  /**
   * @param {{ label: string, missions: { title: string, text: string }[] }[]} stages
   */
  function sync(stages) {
    catalog = catalogForStages(stages, appStore.profile);
    const ids = new Set(catalog.map((item) => item.id));
    const kept = (appStore.journey.missionDrafts || []).filter((draft) => ids.has(draft.id));
    if (kept.length !== (appStore.journey.missionDrafts || []).length) {
      appStore.journey.missionDrafts = kept;
      touchJourney();
      flush();
    }
    if (openBtn) openBtn.classList.toggle("hidden", catalog.length === 0);
    const el = document.getElementById("drafts-drawer");
    if (el && !el.classList.contains("hidden")) showCatalog();
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#drafts-open")) {
      showCatalog();
      return;
    }
    const button = target.closest("[data-draft-id]");
    if (button instanceof HTMLElement && button.dataset.draftId) {
      void open(button.dataset.draftId);
      return;
    }
    const catalogButton = target.closest("[data-draft-open]");
    if (catalogButton instanceof HTMLElement && catalogButton.dataset.draftOpen) {
      void open(catalogButton.dataset.draftOpen);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return { sync, open, close };
}
