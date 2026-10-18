import { appStore, touchJourney } from "../state/store.js";
import { resourcesForRail } from "./resources.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml } from "../ui.js";
import { formatUserLocation } from "../state/location.js";
import { shouldBlockJobBoards, writingVoice } from "../intake/stability-gates.js";
import { buildSharedPromptContext } from "../state/goal-brief.js";
import { missionActionLines, missionContextStamp } from "./mission-model.js";
import { taskChatStorageKey, getTaskThread } from "./task-chat.js";

/** @typedef {"phone_script"|"outreach_email"|"notes"} DraftKind */
/** @typedef {{ id: string, kind: DraftKind, label: string, missionTitle: string, missionText: string }} DraftCatalogItem */
/** @typedef {DraftCatalogItem & { body: string, contextStamp?: string }} MissionDraft */

const SLUG_IN_BODY = /\bm-[a-z0-9-]{4,}\b/i;
const PROVIDER_PASTE = /\b(offers|provides|services include|our mission is)\b.{40,}/i;

/**
 * @param {string} body
 */
export function sanitizeDraftBody(body) {
  let text = String(body || "").trim();
  text = text.replace(SLUG_IN_BODY, "[task]");
  if (PROVIDER_PASTE.test(text)) {
    text = text.replace(PROVIDER_PASTE, "[confirm details on the official site]");
  }
  return text.slice(0, 2500);
}

/**
 * @param {string} body
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateDraftForCopy(body) {
  const text = String(body || "").trim();
  if (!text) return { ok: false, reason: "Draft is empty." };
  if (/\[(?:your name|two times|name|email)\]/i.test(text)) {
    return { ok: false, reason: "Replace placeholders in brackets before copying." };
  }
  if (SLUG_IN_BODY.test(text)) return { ok: false, reason: "Draft still contains internal task ids." };
  return { ok: true };
}

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
  const path = appStore.journey.roadmapPathId || "path";
  return `${path}:${kind}:${slug || "mission"}`;
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
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} [profile]
 */
export function fallbackDraft(item, location, profile) {
  const place = formatUserLocation(location) || "[your city]";
  const stability = shouldBlockJobBoards(profile);
  if (item.kind === "phone_script") {
    if (stability) {
      const lines = [
        `Hi, this is [your name]. I'm in ${place}, and I'll keep this short.`,
        "",
        `I'm calling about ${item.missionTitle.toLowerCase()}.`
      ];
      if (item.missionText) lines.push(item.missionText);
      lines.push(
        "",
        "What I need from you:",
        "- whether you can help with this, or who can",
        "- what I should bring or have ready",
        "- the next time I can come in or call back",
        "",
        "Before I hang up I'll repeat your name and the next step."
      );
      return lines.join("\n");
    }
    return [
      `Hi [name], this is [your name] in ${place}. I'll be brief.`,
      "",
      `I'm calling about ${item.missionTitle}. ${item.missionText || ""}`.trim(),
      "",
      "If you have a minute, two things:",
      "- the decision or introduction I actually need",
      "- who I should talk to if you're not the right person",
      "",
      "I'll repeat the next step back to you before we hang up."
    ].join("\n");
  }
  if (item.kind === "outreach_email") {
    return [
      `Subject: ${item.missionTitle}`,
      "",
      "[Name] —",
      "",
      `I'm [your name], in ${place}. ${item.missionText || item.missionTitle}`,
      "",
      "If you have twenty minutes in the next couple of weeks, I'd like to compare notes on that specifically — not a general catch-up. I'm free [two times].",
      "",
      "[your name]"
    ].join("\n");
  }
  if (stability) {
    return [
      item.missionTitle,
      "",
      "Who I talked to",
      "[name, and where they work]",
      "",
      "What they told me to do",
      "[the concrete instruction, including what to bring]",
      "",
      "Next step",
      "[the one thing I'll do, and when]"
    ].join("\n");
  }
  return [
    item.missionTitle,
    "",
    "Who I spoke with",
    "[name, role, organization]",
    "",
    "What actually changed the plan",
    "[the specific thing they said — not a recap of the whole call]",
    "",
    "What I brought or offered",
    "[the question, intro, or proof I showed up with]",
    "",
    "Next step",
    "[the one action, who owns it, and the date]"
  ].join("\n");
}

/**
 * @param {DraftCatalogItem} item
 */
function missionForCatalogItem(item) {
  for (const stage of appStore.journey.missionsStages || []) {
    const hit = stage.missions?.find((mission) => mission.title === item.missionTitle);
    if (hit) return hit;
  }
  return null;
}

function latestTaskNotes(mission) {
  if (!mission?.id) return "";
  const pathId = appStore.journey.roadmapPathId || "";
  const key = taskChatStorageKey(pathId, mission.id);
  const thread = getTaskThread(appStore.journey, key);
  const tail = (thread.messages || []).slice(-4).map((m) => `${m.role}: ${m.content}`).join("\n");
  return tail.slice(0, 1200);
}

function buildDraftPrompt(item) {
  const place = formatUserLocation(appStore.location);
  const mission = missionForCatalogItem(item);
  const actionLines = mission ? missionActionLines(mission).join("\n") : item.missionText;
  const notes = mission ? latestTaskNotes(mission) : "";
  const waiting = mission?.circleBack?.active
    ? `Waiting notes: ${mission.circleBack.reason || ""}\n${mission.circleBack.instructions || ""}`
    : "";
  const stability = shouldBlockJobBoards(appStore.profile)
    ? "STABILITY FIRST. This is a call or a note about shelter, ID, or documents. Do not write a job application, a job-board email, or a spreadsheet of employers."
    : "Do not add shelter or ID steps unless the profile needs them.";
  const shape =
    item.kind === "phone_script"
      ? "Write a phone script they can read out loud. Use the stated recipient role only. Include the exact ask and expected outcome from the task. No unrelated career pitch."
      : item.kind === "outreach_email"
        ? "Write an email tied to this task's recipient, ask, and outcome. Subject line first. No generic job search or unrelated industry pivot."
        : "Write a notes sheet for after a real conversation. Leave blanks for facts the user must supply. Do not invent outcomes or contacts.";
  return (
    `You are whatimado. Write one draft the user can copy and edit.\n` +
    `Return only the draft. No title, no JSON, no advice before it.\n` +
    `Never invent people, emails, phone numbers, or program facts. Never paste provider marketing copy or internal ids.\n` +
    `${shape}\n` +
    `${writingVoice(appStore.profile)}\n` +
    `Under 180 words.\n` +
    `${stability}\n\n` +
    `Task: ${item.missionTitle}\n` +
    `${actionLines}\n` +
    `${waiting ? `${waiting}\n` : ""}` +
    `${notes ? `Recent task notes:\n${notes}\n` : ""}` +
    `Place: ${place || "not given"}\n\n` +
    buildSharedPromptContext({
      journey: appStore.journey,
      profile: appStore.profile,
      location: appStore.location
    })
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
  const pathId = appStore.journey.roadmapPathId;
  const current = (saved || []).filter((draft) => !pathId || draft.pathId === pathId || draft.id.startsWith(`${pathId}:`));
  const newest = [...current].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const savedIds = new Set(newest.map((draft) => draft.id));
  const pending = catalog.filter((item) => !savedIds.has(item.id));
  const rows = [
    ...newest.map((draft) => ({ ...draft, ready: true })),
    ...pending.map((item) => ({ ...item, ready: false }))
  ];
  body.innerHTML = rows.length
    ? `<ul class="v2-drafts__list">${rows
        .map(
          (item) => `<li>
            <button type="button" class="v2-drafts__item" data-draft-open="${escapeHtml(item.id)}">
              <span class="v2-drafts__kind">${escapeHtml(item.label)}</span>
              <span class="v2-drafts__mission">${escapeHtml(item.missionTitle)}</span>
              <span class="v2-drafts__state">${item.ready ? "Ready" : "Write"}</span>
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
    const check = validateDraftForCopy(draft.body);
    if (!check.ok) {
      copy.textContent = check.reason || "Fix draft first";
      return;
    }
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
    const mission = missionForCatalogItem(draft);
    next.push({
      id: draft.id,
      kind: draft.kind,
      label: draft.label,
      missionTitle: draft.missionTitle,
      body: sanitizeDraftBody(draft.body),
      pathId: appStore.journey.roadmapPathId || "",
      contextStamp: mission ? missionContextStamp(mission) : draft.contextStamp || "",
      createdAt: Date.now()
    });
    appStore.journey.missionDrafts = next.slice(-24);
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
    const mission = missionForCatalogItem(item);
    const stamp = mission ? missionContextStamp(mission) : "";
    const saved = (appStore.journey.missionDrafts || []).find((entry) => entry.id === id && entry.body);
    if (saved && (!stamp || saved.contextStamp === stamp)) {
      renderReader(el, { ...item, body: saved.body }, "");
      return;
    }
    if (saved && stamp && saved.contextStamp !== stamp) {
      appStore.journey.missionDrafts = (appStore.journey.missionDrafts || []).filter((entry) => entry.id !== id);
    }
    writing = true;
    renderReader(el, { ...item, body: "" }, "Writing your draft");
    try {
      const raw = await callAdvisor(buildDraftPrompt(item), { maxTokens: 500, feature: "v2_draft" });
      const body = sanitizeDraftBody(String(raw || "").trim() || fallbackDraft(item, appStore.location, appStore.profile));
      const draft = { ...item, body };
      remember(draft);
      renderReader(el, draft, "");
    } catch {
      const draft = { ...item, body: fallbackDraft(item, appStore.location, appStore.profile) };
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
    const pathId = appStore.journey.roadmapPathId;
    const ids = new Set(catalog.map((item) => item.id));
    const kept = (appStore.journey.missionDrafts || []).filter(
      (draft) => ids.has(draft.id) && (!pathId || draft.pathId === pathId || draft.id.startsWith(`${pathId}:`))
    );
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
      return;
    }
    const resourceAction = target.closest("[data-resource-action]");
    if (resourceAction instanceof HTMLButtonElement && resourceAction.dataset.resourceName) {
      void toggleResourceAction(resourceAction, resourceAction.dataset.resourceAction || "notes", resourceAction.dataset.resourceName);
      return;
    }
    const copyBtn = target.closest("[data-resource-copy]");
    if (copyBtn instanceof HTMLElement && copyBtn.dataset.resourceCopy) {
      const item = resourceByName(copyBtn.dataset.resourceCopy);
      const text = copyBtn.dataset.resourceKind === "phone"
        ? item?.phoneDraft
        : copyBtn.dataset.resourceKind === "message"
          ? item?.draft
          : item?.emailDraft;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "Copied";
        }).catch(() => {
          copyBtn.textContent = "Select the draft to copy";
        });
      }
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || !target.dataset.resourceNotes) return;
    const item = resourceByName(target.dataset.resourceNotes);
    if (!item) return;
    item.notes = target.value.slice(0, 2000);
    touchJourney();
    flush();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  /**
   * @param {HTMLButtonElement} button
   * @param {string} kind
   * @param {string} name
   */
  async function toggleResourceAction(button, kind, name) {
    const card = button.closest(".v2-resource-item");
    const panel = card?.querySelector("[data-resource-panel]");
    if (!(panel instanceof HTMLElement)) return;
    const open = button.classList.contains("is-open");
    card?.querySelectorAll(".v2-resource-action").forEach((el) => {
      el.classList.remove("is-open");
      el.setAttribute("aria-expanded", "false");
    });
    if (open) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }
    button.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    panel.classList.remove("hidden");
    const item = resourceByName(name);
    if (!item) return;
    if (kind === "notes") {
      panel.innerHTML = `<textarea class="v2-resource-notes-box" rows="5" data-resource-notes="${escapeHtml(name)}" placeholder="What happened when you reached out, and what you will do next.">${escapeHtml(item.notes || "")}</textarea>`;
      return;
    }
    const saved = kind === "phone" ? item.phoneDraft : kind === "message" ? item.draft : item.emailDraft;
    if (saved) {
      panel.innerHTML = draftBox(saved, name, kind);
      return;
    }
    panel.innerHTML = `<p class="v2-wave" role="status">Writing<span></span><span></span><span></span></p>`;
    if (writing) return;
    writing = true;
    const path = graphPathTitle();
    const shape = kind === "phone"
      ? "Write a phone script."
      : kind === "message"
        ? `Write a message to paste into the official contact form${item.url ? ` at ${item.url}` : ""}. Do not invent an email address or phone number.`
        : `Write an email to ${item.email}.`;
    const prompt =
      `You are whatimado. ${shape}\n` +
      `${writingVoice(appStore.profile)}\n` +
      `Return only the draft. Under 160 words.\n\n` +
      `${buildSharedPromptContext({
        journey: appStore.journey,
        profile: appStore.profile,
        location: appStore.location
      })}\n\n` +
      `Path: ${path}\nResource: ${item.name}\nWhy it fits: ${item.why || item.details}\nNext step: ${item.nextStep || ""}\n`;
    try {
      const raw = await callAdvisor(prompt, { maxTokens: 450, feature: "v2_resource_draft" });
      const body = String(raw || "").trim().slice(0, 2500) || fallbackResourceDraft(item, path, kind);
      if (kind === "phone") item.phoneDraft = body;
      else if (kind === "message") item.draft = body;
      else item.emailDraft = body;
    } catch {
      const body = fallbackResourceDraft(item, path, kind);
      if (kind === "phone") item.phoneDraft = body;
      else if (kind === "message") item.draft = body;
      else item.emailDraft = body;
    } finally {
      writing = false;
    }
    touchJourney();
    flush();
    const body = kind === "phone" ? item.phoneDraft : kind === "message" ? item.draft : item.emailDraft;
    if (button.classList.contains("is-open")) panel.innerHTML = draftBox(body, name, kind);
  }

  return { sync, open, close };
}

/**
 * The card on screen, including a city communication fallback that is not stored yet.
 * @param {string} name
 */
function resourceByName(name) {
  const stored = (appStore.journey.missionResources || []).find((entry) => entry.name === name);
  if (stored) return stored;
  const fallback = resourcesForRail([], appStore.location, appStore.profile).find((entry) => entry.name === name);
  if (!fallback) return null;
  appStore.journey.missionResources = [...(appStore.journey.missionResources || []), { ...fallback }];
  touchJourney();
  return appStore.journey.missionResources.find((entry) => entry.name === name) || null;
}

function graphPathTitle() {
  return appStore.journey.roadmapPathId || "this path";
}

/**
 * @param {{ name: string, details?: string, phone?: string }} item
 * @param {string} path
 */
/**
 * @param {string} body
 * @param {string} name
 * @param {string} kind
 */
function draftBox(body, name, kind) {
  return `<pre class="v2-resource-draft">${escapeHtml(body)}</pre><button type="button" class="v2-resource-copy" data-resource-copy="${escapeHtml(name)}" data-resource-kind="${escapeHtml(kind)}">Copy</button>`;
}

/**
 * @param {{ name: string, why?: string, details?: string, email?: string }} item
 * @param {string} path
 * @param {string} kind
 */
function fallbackResourceDraft(item, path, kind) {
  const why = item.why || item.details || path;
  const contact = item.contact || "the right person";
  if (kind === "phone") {
    return `Hi, this is [your name]. I'm calling about ${path}.\n\n${why}\n\nCould I speak with ${contact} about the one next step listed on your site? I'll repeat the next step back before we hang up.`;
  }
  if (kind === "message") {
    return `Hello —\n\nI'm [your name]. I'm writing through your contact form because ${why}\n\nCould someone point me to the right contact for this specific request? I'm free [two times].\n\n[your name]`;
  }
  return `Subject: ${path}\n\nHello —\n\nI'm [your name]. I'm writing because ${why}\n\nIf you have twenty minutes, I'd like to talk through the specific next step on your site. I'm free [two times].\n\n[your name]`;
}
