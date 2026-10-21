import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { shouldBlockJobBoards, writingVoice } from "../intake/stability-gates.js";
import { buildSharedPromptContext, markMissionsAcceptedForGoal } from "../state/goal-brief.js";
import { formatUserLocation } from "../state/location.js";
import { normalizeResources, parseResourcesResponse, renderResourcesRail, resourcesForRail, resourcesMatchingFirstMissions } from "./resources.js";
import { countryKey, countryName } from "./country-resources.js";
import { bindResourcesAccordions, renderResourcesAccordion, resourcePlaceLabel, resourcesForTask } from "./resources-accordion.js";
import { catalogForStages } from "./drafts.js";
import { graphStore, shortenMapLabel } from "../graph-store.js";
import { saveContinuation, toggleSavedPath } from "../state/journey.js";
import { renderMissionChatDrawer, renderMissionChatOpenButton } from "./task-chat.js";
import {
  applyCircleBack,
  clearCircleBack,
  flattenMissions,
  missionActionLines,
  normalizeMissionFields,
  setMissionDone
} from "./mission-model.js";
import { rippleCircleBackNotes } from "./circle-back.js";
import {
  continueRoadmap,
  deleteMissionFromStages,
  dependentsOf,
  effectiveFocusMissionId,
  missionStatusLabel
} from "./mission-navigation.js";
import { canRoadmapUndo, popRoadmapUndo, pushRoadmapUndo } from "./roadmap-undo.js";

/** @type {Set<string>} */
const circleBackEditorOpen = new Set();
/** @type {Map<string, { reason: string, instructions: string, returnDate: string }>} */
const circleBackUnsaved = new Map();

/**
 * @param {import("../graph-store.js").GraphNode | { title?: string, label?: string }} idea
 * @param {import("../state/user-profile.js").UserProfile} profile
 */
export function fallbackStages(idea, profile) {
  const title = idea?.title || idea?.label || "this path";
  if (shouldBlockJobBoards(profile)) {
    return [
      {
        label: "Get the basics in place",
        desc: "A safe place to stay and the documents you need come before any job board.",
        missions: [
          {
            title: "Confirm a safe place to stay this week",
            text: "Call a local shelter or housing navigator and ask about beds tonight, waitlists, and what to bring. Write down the name, the earliest opening, and the documents they require."
          },
          {
            title: "Replace missing ID and essential papers",
            text: "Ask which ID or mail address you can get first, what it costs, and who can help you apply. Do not start job-board applications until this step has a real next appointment."
          }
        ]
      }
    ];
  }
  return [
    {
      label: "Start this week",
      desc: `The first concrete moves on “${title}”.`,
      missions: [
        {
          title: `Open one real conversation about ${title}`,
          text: "Write to someone who already does this work and name the specific overlap with what you do. Ask for a short conversation, not a favor or a job. Send it before you collect more research."
        },
        {
          title: "Keep what changes the plan",
          text: "After you talk, write down the one thing that changes how you'll proceed, and the next move with a date. Set aside advice that doesn't fit how you already work."
        }
      ]
    }
  ];
}

/** @param {string} title @param {number} index */
export function missionId(title, index) {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `m-${slug || index}`;
}

/**
 * @param {string} raw
 * @param {{ label: string, desc: string, missions: { title: string, text: string }[] }[]} fallback
 */
export function parseStagesResponse(raw, fallback) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const match = body.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[0]);
    const list = Array.isArray(parsed) ? parsed : parsed.stages || parsed.roadmap;
    if (!Array.isArray(list)) return fallback;
    const stages = list
      .slice(0, 8)
      .map((stage) => {
        const missions = Array.isArray(stage?.missions) ? stage.missions : stage?.tasks;
        return {
          label: String(stage?.label || "").trim(),
          desc: String(stage?.desc || "").trim(),
          missions: (Array.isArray(missions) ? missions : [])
            .slice(0, 3)
            .map((mission, missionIndex) => {
              const normalized = normalizeMissionFields(
                {
                  ...mission,
                  id: mission?.id || missionId(String(mission?.title || mission?.mission || ""), missionIndex)
                },
                missionIndex
              );
              const dependsOn = Array.isArray(mission?.dependsOn)
                ? mission.dependsOn.map((dep) => String(dep || "").trim()).filter(Boolean)
                : normalized.dependsOn;
              return {
                ...normalized,
                dependsOn,
                resources: normalizeResources(mission?.resources)
              };
            })
            .filter((mission) => mission.title && (mission.text || mission.askDo || mission.whom))
        };
      })
      .filter((stage) => stage.label && stage.missions.length);
    return stages.length ? stages : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resources must be reachable from where the person lives, in that country's own terms.
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 */
function localResourceRule(location) {
  const city = String(location?.city || "").trim();
  const region = String(location?.region || "").trim();
  const country = countryName(location);
  if (!city && !country) {
    return "Location is unknown: prefer online and nationally available services, and say so in place.";
  }
  const near = [city, region].filter(Boolean).join(", ") || country;
  return (
    `LOCAL FIT: the person lives in ${formatUserLocation(location)}. Every resource must be real and usable from there: ` +
    `offices, organizations, and events in or near ${near}, or national services of ${country || "their country"}. ` +
    `Use ${country || "that country"}'s own agencies, programs, currency, and terms${country && countryKey(location) !== "us" ? "; never suggest US-only services" : ""}. ` +
    `Put the real town and country in place, or "Online".`
  );
}

/**
 * @param {import("../graph-store.js").GraphNode} idea
 * @param {string[]} bullets
 */
function buildMissionsPrompt(idea, bullets) {
  const context = buildSharedPromptContext({
    journey: appStore.journey,
    profile: appStore.profile,
    location: appStore.location
  });
  const stability = shouldBlockJobBoards(appStore.profile)
    ? "STABILITY FIRST: ID or housing is not confirmed. Do not assign job boards, Indeed, or a contact-tracking spreadsheet. Open with shelter, documents, or ID steps that match the profile."
    : "Do not insert ID, shelter, or basic-needs steps unless the profile says they are needed.";
  const plan = (bullets || []).map((bullet) => `- ${bullet}`).join("\n");
  const austin = /^austin$/i.test(String(appStore.location?.city || "").trim());
  const austinNote = austin
    ? " Do not name Austin Design Week; that festival has ended. If the tasks mention meetups or agencies, include AIGA Austin events (https://austin.aiga.org/upcoming-events/) and LinkedIn (https://www.linkedin.com/)."
    : "";
  return (
    `You are whatimado. Write the FIRST roadmap for "${idea.title || idea.label}".\n` +
    `Return ONLY JSON:\n` +
    `{"stages":[{"label":"mission name","desc":"one sentence","missions":[{"title":"task the person does","whom":"role or org type to contact — no invented names","askDo":"exact ask or action","outcome":"concrete result they should have","text":"optional summary","resources":[]}]}],"resources":[{"name":"","kind":"organization|platform|person|event","place":"city, country — or online","why":"why this fits THIS path","offers":"the specific program or service","nextStep":"one action to take","url":"https://official-site","email":"","phone":"","address":"","contact":"department or role"}]}\n` +
    `Exactly 1 stage. That stage is one mission with 2 tasks. The user chooses the mission after this one from separate options.\n` +
    `Every task MUST include whom, askDo, and outcome. Name a role or organization type, never a fabricated person, email, or phone number.\n` +
    `Resources are ways to reach people on THIS path. Return at least 3 and at most 4 organizations that the first tasks actually name. Every place named in a task must appear in resources with its official URL.${austinNote} Include email or phone only when you know that exact current address or number. If you do not, leave it empty and put the official contact-page URL in url. Never invent an email or phone number.\n` +
    `${localResourceRule(appStore.location)}\n` +
    `A mission "resources" array is only for an organization this mission needs that is not already in the path list. If it would repeat the path list, use "resources":[].\n` +
    `${writingVoice(appStore.profile)} No job-board filler.\n` +
    `${stability}\n\n` +
    `Path: ${idea.title || idea.label}\n` +
    `Why: ${idea.why || idea.tagline || idea.description || ""}\n` +
    `Agreed plan:\n${plan || "- Use the path itself"}\n\n` +
    `${context}`
  );
}

/**
 * Compact glance above the map: a dot and one or two words per mission.
 * Done, current, and later stay distinguishable. The full title is on the button.
 * @param {Array<{ missions?: { id?: string, title?: string, done?: boolean }[] }>} stages
 */
function renderMissionTimeline(stages, focusId) {
  const missions = stages.flatMap((stage) => stage.missions || []);
  if (!missions.length) return "";
  const items = missions
    .map((mission, index) => {
      const status = missionStatusLabel(mission, focusId);
      const state =
        status === "Completed"
          ? "is-done"
          : status === "Waiting"
            ? "is-waiting"
            : status === "Now"
              ? "is-current"
              : status === "Not completed"
                ? "is-bypassed"
                : "is-planned";
      const full = mission.title || "Mission";
      const short = shortenMapLabel(full) || `Step ${index + 1}`;
      return `<button type="button" class="v2-timeline__stop ${state}" data-timeline-id="${escapeHtml(mission.id || "")}" aria-label="${escapeHtml(status)}: ${escapeHtml(full)}" title="${escapeHtml(full)}"><span class="v2-timeline__dot" aria-hidden="true"></span><span class="v2-timeline__name">${escapeHtml(short)}</span></button>`;
    });
  const steps = items
    .flatMap((button, index) => (index === 0 ? [button] : [`<span class="v2-timeline__link" aria-hidden="true"></span>`, button]))
    .join("");
  return `
    <div class="v2-timeline">
      <span class="v2-timeline__label">Timeline</span>
      <div class="v2-timeline__rail"><span class="v2-timeline__cutoff" aria-hidden="true"></span>${steps}</div>
      <button type="button" class="v2-timeline__add" data-timeline-add="1" aria-label="Add more missions to this roadmap">+</button>
    </div>`;
}

function timelineHost() {
  return document.getElementById("map-timeline");
}

/** Native horizontal scroll. The left cue appears only once earlier steps have moved off. */
function bindTimelineScroll(host) {
  const rail = host.querySelector(".v2-timeline__rail");
  if (!(rail instanceof HTMLElement) || rail.dataset.scrollBound === "1") return;
  rail.dataset.scrollBound = "1";
  const mark = () => rail.classList.toggle("is-scrolled", rail.scrollLeft > 4);
  rail.addEventListener("scroll", mark, { passive: true });
  mark();

  let drag = null;
  rail.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    drag = { id: event.pointerId, x: event.clientX, left: rail.scrollLeft };
    rail.classList.add("is-dragging");
    rail.setPointerCapture?.(event.pointerId);
  });
  rail.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    rail.scrollLeft = drag.left - (event.clientX - drag.x);
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    rail.classList.remove("is-dragging");
  };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);
}

/** Pin the abbreviated timeline on the New roadmap row. */
function mountMapTimeline(stages) {
  const host = timelineHost();
  const missions = (stages || []).flatMap((stage) => stage.missions || []);
  const show = missions.length > 0;
  document.body.classList.remove("has-map-timeline");
  if (host) {
    host.hidden = !show;
    const focusId = effectiveFocusMissionId(appStore.journey, stages);
    host.innerHTML = show ? renderMissionTimeline(stages, focusId) : "";
    if (show) bindTimelineScroll(host);
  }
  document.getElementById("dynamic-frame")?.applyTimelineInset?.();
}

/** @param {HTMLElement | null} _root @param {string} missionId */
export function highlightTimelineMission(_root, missionId) {
  const root = timelineHost();
  if (!root) return;
  const stages = appStore.journey.missionsStages || [];
  const focusId = effectiveFocusMissionId(appStore.journey, stages);
  const byId = new Map(flattenMissions(stages).map((mission) => [mission.id, mission]));
  root.querySelectorAll("[data-timeline-id]").forEach((item) => {
    const id = item.getAttribute("data-timeline-id") || "";
    const mission = byId.get(id);
    const status = mission ? missionStatusLabel(mission, focusId) : "Later";
    item.classList.toggle("is-done", status === "Completed");
    item.classList.toggle("is-waiting", status === "Waiting");
    item.classList.toggle("is-bypassed", status === "Not completed");
    item.classList.toggle("is-current", status === "Now");
    item.classList.toggle("is-planned", status === "Later");
  });
}

/**
 * @param {HTMLElement | null} root
 * @param {{ label: string, desc: string, missions: { title: string, text: string }[] }[]} stages
 * @param {{ id: string, label: string, missionTitle: string }[]} [catalog]
 * @param {import("./resources.js").LocalResource[]} [sharedResources]
 * @param {string} [place]
 */
export function renderMissionStages(root, stages, catalog = [], sharedResources = [], place = "", focusId = null) {
  if (!root) return;
  const focus = focusId || effectiveFocusMissionId(appStore.journey, stages);
  const byTitle = new Map(catalog.map((item) => [item.missionTitle, item]));
  const master = sharedResources.length
    ? `<div class="v2-resources-master">${renderResourcesAccordion({
        id: "path-resources",
        resources: sharedResources,
        place
      })}</div>`
    : "";
  root.innerHTML = master + stages
    .map(
      (stage, index) => `
        <article class="v2-stage" id="stage-${index}">
          <h3 class="v2-stage__label">${index + 1}. ${escapeHtml(stage.label)}</h3>
          ${stage.desc ? `<p class="v2-stage__desc">${escapeHtml(stage.desc)}</p>` : ""}
          <ol class="v2-mission-list">
            ${stage.missions
              .map((mission, missionIndex) => {
                const draft = byTitle.get(mission.title);
                const action = draft
                  ? `<button type="button" class="v2-draft-open" data-draft-id="${escapeHtml(draft.id)}">${escapeHtml(draft.label)}</button>`
                  : "";
                const resources = renderResourcesAccordion({
                  id: `task-resources-${index}-${missionIndex}`,
                  resources: resourcesForTask(mission.resources, sharedResources),
                  place
                });
                const id = mission.id || missionId(mission.title, missionIndex);
                const steps = Array.isArray(mission.suggestedSteps) && mission.suggestedSteps.length
                  ? `<ol class="v2-mission__steps">${mission.suggestedSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
                  : "";
                const timing = mission.timelineNote
                  ? `<p class="v2-mission__when">${escapeHtml(mission.timelineNote)}</p>`
                  : "";
                const waiting = Boolean(mission.waiting || mission.circleBack?.active);
                const bypassed = Boolean(mission.bypassed && !mission.done);
                const status = missionStatusLabel(mission, focus);
                const actionLines = missionActionLines(mission);
                const detail = actionLines.length
                  ? `<ul class="v2-mission__actions">${actionLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
                  : "";
                const cb = mission.circleBack || {};
                const editorOpen = circleBackEditorOpen.has(id);
                const showCirclePanel = waiting || editorOpen;
                const circleDraft = circleBackUnsaved.get(id);
                const reasonVal = waiting ? cb.reason || "" : circleDraft?.reason ?? "";
                const instructionsVal = waiting ? cb.instructions || "" : circleDraft?.instructions ?? "";
                const returnVal = waiting ? cb.returnDate || "" : circleDraft?.returnDate ?? "";
                const circlePanel = showCirclePanel
                  ? `<div class="v2-circle-back" data-circle-back-panel="${escapeHtml(id)}">
                      <button type="button" class="v2-circle-back__close v2-mission-action" data-circle-close="${escapeHtml(id)}" aria-label="Close"><span aria-hidden="true">×</span></button>
                      ${waiting ? `<p class="v2-circle-back__badge"><span class="v2-circle-back__clock" aria-hidden="true">◷</span> Waiting — circle back</p>` : `<p class="v2-circle-back__badge">Circle back notes</p>`}
                      <label class="v2-circle-back__field">Reason
                        <textarea data-circle-reason="${escapeHtml(id)}" rows="2" placeholder="Why you are pausing">${escapeHtml(reasonVal)}</textarea>
                      </label>
                      <label class="v2-circle-back__field">Instructions for next time
                        <textarea data-circle-instructions="${escapeHtml(id)}" rows="3" placeholder="What to do when you return">${escapeHtml(instructionsVal)}</textarea>
                      </label>
                      <label class="v2-circle-back__field">Return date (optional)
                        <input type="date" data-circle-return="${escapeHtml(id)}" value="${escapeHtml(returnVal)}" />
                      </label>
                      <div class="v2-circle-back__actions">
                        <button type="button" class="v2-mission-action" data-circle-save="${escapeHtml(id)}">Save waiting notes</button>
                        ${waiting ? `<button type="button" class="v2-mission-action" data-circle-reopen="${escapeHtml(id)}">Reopen task</button>` : ""}
                      </div>
                    </div>`
                  : "";
                const deleteLabel = `Delete task: ${mission.title || "Task"}`;
                return `
                  <li class="v2-mission${mission.done ? " is-done" : ""}${waiting ? " is-waiting" : ""}${bypassed ? " is-bypassed" : ""}${mission.id === focus ? " is-focused" : ""}" id="mission-${escapeHtml(id)}" data-mission-id="${escapeHtml(id)}">
                    <button type="button" class="v2-mission__delete" data-mission-delete="${escapeHtml(id)}" aria-label="${escapeHtml(deleteLabel)}"><span aria-hidden="true">×</span></button>
                    <div class="v2-mission__panel">
                      <div class="v2-mission__content">
                        <div class="v2-mission__head">
                          <div class="v2-mission__head-main">
                            <label class="v2-mission__done-toggle">
                              <input
                                type="checkbox"
                                class="v2-mission__done-check"
                                data-mission-complete="${escapeHtml(id)}"
                                ${mission.done ? "checked" : ""}
                                ${waiting ? "disabled" : ""}
                                aria-label="${mission.done ? "Task completed" : "Mark task complete"}"
                              />
                            </label>
                            <h4 class="v2-mission__title" tabindex="-1">${escapeHtml(mission.title)}</h4>
                          </div>
                          ${waiting ? `<span class="v2-mission__badge">Waiting</span>` : ""}
                          ${bypassed ? `<span class="v2-mission__badge v2-mission__badge--bypassed">Not completed</span>` : ""}
                          ${status === "Now" && !waiting ? `<span class="v2-mission__badge v2-mission__badge--now">Now</span>` : ""}
                        </div>
                        ${detail}
                        ${mission.text && actionLines.length > 1 ? `<p class="v2-mission__text">${escapeHtml(mission.text)}</p>` : ""}
                        ${steps}
                        ${timing}
                        ${resources}
                        ${action}
                        <div class="v2-mission__foot">
                          <div class="v2-mission__controls">
                            <button type="button" class="v2-mission-action v2-circle-back-toggle" data-circle-back="${escapeHtml(id)}">${waiting ? "Edit waiting" : "Circle back"}</button>
                            <button type="button" class="v2-mission-action v2-difficulty" data-difficulty="${escapeHtml(id)}">Having difficulties</button>
                            <button type="button" class="v2-mission-action v2-mission__return${bypassed ? "" : " hidden"}" data-mission-return="${escapeHtml(id)}">Return to this task</button>
                            ${renderMissionChatOpenButton(id)}
                          </div>
                          ${renderMissionChatDrawer(id, mission.title)}
                          ${circlePanel}
                        </div>
                      </div>
                    </div>
                  </li>`;
              })
              .join("")}
          </ol>
        </article>`
    )
    .join("");
  root.innerHTML += stages.length ? renderMissionNavBar() : "";
  const allDone = stages.length > 0 && stages.every((stage) => stage.missions.every((mission) => mission.done));
  root.innerHTML += allDone ? renderNextPathOptions() : "";
  bindResourcesAccordions(root);
}

function renderMissionNavBar() {
  return `
    <div class="v2-mission-nav" role="group" aria-label="Roadmap task navigation">
      <button type="button" class="v2-mission-action" data-mission-continue="1">Continue</button>
      <p class="v2-mission-nav__feedback" id="mission-nav-feedback" role="status" aria-live="polite"></p>
    </div>`;
}

/** Other roadmaps, with the original save-or-open choice, once the first missions are done. */
function renderNextPathOptions() {
  const activeId = appStore.journey.roadmapPathId;
  const paths = graphStore.nodes.filter((node) => node.type === "path" && node.id !== activeId);
  if (!paths.length) return "";
  const saved = new Set(appStore.journey.savedPathIds || []);
  return `
    <section class="v2-next-paths" aria-label="Other roadmaps">
      <h3 class="v2-next-paths__title">What's next for you</h3>
      <p class="v2-next-paths__copy">You finished the first missions. Open another roadmap, or save it for later.</p>
      <div class="v2-next-paths__grid">
        ${paths
          .map((path) => {
            const title = path.title || path.label || "Roadmap";
            const isSaved = saved.has(path.id);
            return `
              <article class="v2-next-path${isSaved ? " is-saved" : ""}">
                <label class="v2-next-path__save">
                  <input type="checkbox" data-save-path="${escapeHtml(path.id)}" ${isSaved ? "checked" : ""} />
                  Save map for later.
                </label>
                <button type="button" class="v2-next-path__open" data-open-path="${escapeHtml(path.id)}">
                  <span class="v2-next-path__name">${escapeHtml(title)}</span>
                  ${path.tagline || path.why ? `<span class="v2-next-path__why">${escapeHtml(path.tagline || path.why || "")}</span>` : ""}
                </button>
              </article>`;
          })
          .join("")}
      </div>
    </section>`;
}

/**
 * @param {{
 *   sectionEl: HTMLElement | null,
 *   listEl: HTMLElement | null,
 *   layout: () => void,
 *   flush: () => void,
 *   messagesEl?: HTMLElement | null,
 *   onShown?: (stages: { label: string, desc: string, missions: { title: string, text: string }[] }[]) => void
 *   onRendered?: () => void
 * }} ui
 */
export function createMissionsController(ui) {
  const { sectionEl, listEl, layout, flush, onShown, onRendered, messagesEl = null } = ui;
  let pending = false;
  let serial = 0;
  /** @type {{ id: string, label: string, desc: string, missions: { title: string, text: string }[] }[]} */
  let continuationOffer = [];

  function statusEl() {
    return sectionEl?.querySelector("#missions-status") || null;
  }

  function navFeedbackEl() {
    return listEl?.querySelector("#mission-nav-feedback") || sectionEl?.querySelector("#mission-nav-feedback") || null;
  }

  function syncUndoButtons() {
    const enabled = canRoadmapUndo(appStore.journey);
    document.querySelectorAll("[data-mission-undo]").forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", enabled ? "false" : "true");
      button.classList.toggle("is-ready", enabled);
    });
  }

  function setNavFeedback(message = "") {
    const el = navFeedbackEl();
    if (el) el.textContent = message;
    if (!message) setStatusMessage(statusEl(), "");
  }

  /** @param {string} missionId */
  function focus(missionId) {
    focusMissionInUi(missionId);
  }

  /** @param {string} missionId */
  function focusMissionInUi(missionId) {
    if (!missionId) return;
    appStore.journey.focusMissionId = missionId;
    highlightTimelineMission(timelineHost(), missionId);
    listEl?.dispatchEvent(new CustomEvent("mission-focus", { bubbles: true, detail: { id: missionId } }));
    const target = document.getElementById(`mission-${missionId}`);
    if (target) {
      scrollFrameChildIntoView(target);
      target.querySelector(".v2-mission__title")?.focus?.();
    }
  }

  function rerender({ scroll = false, feedback = "" } = {}) {
    const stages = appStore.journey.missionsStages || [];
    show(stages, { scroll });
    setNavFeedback(feedback);
    syncUndoButtons();
  }

  function clear() {
    serial += 1;
    pending = false;
    appStore.journey.missionsStages = [];
    appStore.journey.missionResources = [];
    appStore.journey.missionDrafts = [];
    appStore.journey.planBullets = [];
    appStore.journey.roadmapPathId = null;
    appStore.journey.planConfirmed = false;
    appStore.journey.focusMissionId = null;
    appStore.journey.roadmapUndoStack = [];
    if (listEl) listEl.innerHTML = "";
    sectionEl?.classList.add("hidden");
    mountMapTimeline([]);
    renderResourcesRail([], appStore.location, appStore.profile);
    onShown?.([]);
    touchJourney();
    flush();
  }

  function show(stages, { scroll = true } = {}) {
    if (!sectionEl) return;
    const frameBody = document.querySelector(".whatimado-frame__body");
    const savedBodyScroll = frameBody?.scrollTop ?? 0;
    const restoreBodyScroll = () => {
      if (frameBody) frameBody.scrollTop = savedBodyScroll;
    };
    stages.forEach((stage) => {
      stage.missions.forEach((mission, index) => {
        if (!mission.id) mission.id = missionId(mission.title, index);
      });
    });
    sectionEl.classList.remove("hidden");
    const catalog = catalogForStages(stages, appStore.profile);
    const matched = resourcesMatchingFirstMissions(
      stages,
      appStore.journey.missionResources,
      appStore.location,
      appStore.profile
    );
    const before = (appStore.journey.missionResources || []).map((item) => item.name).join("|");
    if (matched.map((item) => item.name).join("|") !== before) {
      appStore.journey.missionResources = matched;
      touchJourney();
      flush();
    }
    const sharedResources = resourcesForRail(
      appStore.journey.missionResources,
      appStore.location,
      appStore.profile
    );
    const focusId = effectiveFocusMissionId(appStore.journey, stages);
    renderMissionStages(listEl, stages, catalog, sharedResources, resourcePlaceLabel(appStore.location), focusId);
    onRendered?.();
    restoreBodyScroll();
    mountMapTimeline(stages);
    onShown?.(stages);
    renderResourcesRail(appStore.journey.missionResources, appStore.location, appStore.profile);
    bindMissionActions();
    syncUndoButtons();
    setStatusMessage(statusEl(), "");
    if (scroll) scrollFrameChildIntoView(sectionEl);
    layout();
    restoreBodyScroll();
    requestAnimationFrame(restoreBodyScroll);
  }

  function refresh() {
    const stages = appStore.journey.missionsStages || [];
    if (stages.length && appStore.journey.planConfirmed) show(stages, { scroll: false });
  }

  function remember(stages, resources, pathId) {
    appStore.journey.missionsStages = stages;
    appStore.journey.missionResources = normalizeResources(resources);
    if (pathId) appStore.journey.roadmapPathId = pathId;
    appStore.journey.roadmapUndoStack = [];
    appStore.journey.focusMissionId = stages.flatMap((stage) => stage.missions || [])[0]?.id || null;
    markMissionsAcceptedForGoal(appStore.journey);
    touchJourney();
    flush();
    show(stages);
  }

  /**
   * @param {import("../graph-store.js").GraphNode | null} idea
   * @param {string[]} [bullets]
   */
  async function begin(idea, bullets = []) {
    if (!idea || pending) return;
    const samePath = appStore.journey.roadmapPathId === idea.id;
    if (samePath && appStore.journey.missionsStages?.length) {
      show(appStore.journey.missionsStages);
      return;
    }
    const ticket = ++serial;
    pending = true;
    appStore.journey.missionsStages = [];
    appStore.journey.missionResources = [];
    appStore.journey.missionDrafts = [];
    sectionEl?.classList.remove("hidden");
    if (listEl) listEl.innerHTML = "";
    renderResourcesRail([], appStore.location, appStore.profile);
    onShown?.([]);
    setStatusMessage(statusEl(), "Generating your missions");
    scrollFrameChildIntoView(sectionEl);
    layout();
    const fallback = fallbackStages(idea, appStore.profile);
    try {
      const raw = await callAdvisor(buildMissionsPrompt(idea, bullets), {
        maxTokens: 1200,
        feature: "v2_missions"
      });
      if (ticket !== serial) return;
      const stages = parseStagesResponse(raw, fallback);
      remember(stages, parseResourcesResponse(raw), idea.id);
    } catch {
      if (ticket !== serial) return;
      remember(fallback, [], idea.id);
    } finally {
      if (ticket !== serial) return;
      pending = false;
      setStatusMessage(statusEl(), "");
    }
  }

  function flatMissions() {
    return (appStore.journey.missionsStages || []).flatMap((stage) => stage.missions || []);
  }

  function bindTimeline() {
    const host = timelineHost();
    if (!host || host.dataset.bound === "1") return;
    host.dataset.bound = "1";
    host.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const timeline = target?.closest("[data-timeline-id]");
      const timelineId = timeline?.getAttribute("data-timeline-id");
      if (timelineId) {
        appStore.journey.focusMissionId = timelineId;
        highlightTimelineMission(host, timelineId);
        host.dispatchEvent(new CustomEvent("mission-focus", { bubbles: true, detail: { id: timelineId } }));
        return;
      }
      if (target?.closest("[data-timeline-add]")) {
        host.dispatchEvent(new CustomEvent("mission-add", { bubbles: true }));
      }
    });
  }

  bindTimeline();

  /** @param {string} completeId @param {boolean} done */
  function applyMissionComplete(completeId, done) {
    pushRoadmapUndo(appStore.journey);
    const stages = appStore.journey.missionsStages || [];
    for (const stage of stages) {
      const mission = stage.missions.find((item) => item.id === completeId);
      if (mission) {
        setMissionDone(mission, done);
        if (mission.done) mission.bypassed = false;
      }
    }
    touchJourney();
    flush();
    rerender();
  }

  function bindMissionActions() {
    if (!sectionEl || sectionEl.dataset.progressBound === "1") return;
    sectionEl.dataset.progressBound = "1";
    if (sectionEl.dataset.circleEscBound !== "1") {
      sectionEl.dataset.circleEscBound = "1";
      sectionEl.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || circleBackEditorOpen.size === 0) return;
        const id = circleBackEditorOpen.values().next().value;
        if (!id) return;
        circleBackEditorOpen.delete(id);
        circleBackUnsaved.delete(id);
        rerender({ scroll: false });
        sectionEl.querySelector(`[data-circle-back="${CSS.escape(id)}"]`)?.focus();
        event.stopPropagation();
      });
    }
    sectionEl.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return;
      const reasonEl = target.matches("[data-circle-reason]") ? target : null;
      const instrEl = target.matches("[data-circle-instructions]") ? target : null;
      const dateEl = target.matches("[data-circle-return]") ? target : null;
      const fieldEl = reasonEl || instrEl || dateEl;
      if (!fieldEl) return;
      const missionId = fieldEl.getAttribute(reasonEl ? "data-circle-reason" : instrEl ? "data-circle-instructions" : "data-circle-return");
      if (!missionId || !circleBackEditorOpen.has(missionId)) return;
      const prev = circleBackUnsaved.get(missionId) || { reason: "", instructions: "", returnDate: "" };
      if (reasonEl) prev.reason = reasonEl.value.slice(0, 400);
      if (instrEl) prev.instructions = instrEl.value.slice(0, 1200);
      if (dateEl) prev.returnDate = dateEl.value.slice(0, 32);
      circleBackUnsaved.set(missionId, prev);
    });
    sectionEl.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.missionComplete) {
        applyMissionComplete(target.dataset.missionComplete, target.checked);
        return;
      }
      if (target.dataset.savePath) {
        toggleSavedPath(appStore.journey, target.dataset.savePath);
        touchJourney();
        flush();
        show(appStore.journey.missionsStages || []);
      }
    });
    sectionEl.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const open = target?.closest("[data-open-path]");
      const openId = open?.getAttribute("data-open-path");
      if (openId) {
        listEl?.dispatchEvent(new CustomEvent("mission-open-path", { bubbles: true, detail: { id: openId } }));
        return;
      }
      const difficulty = target?.closest("[data-difficulty]");
      const difficultyId = difficulty?.getAttribute("data-difficulty");
      if (difficultyId) {
        listEl?.dispatchEvent(new CustomEvent("mission-difficulty", { bubbles: true, detail: { id: difficultyId } }));
        return;
      }
      const circleToggle = target?.closest("[data-circle-back]");
      const circleId = circleToggle?.getAttribute("data-circle-back");
      if (circleId) {
        const stages = appStore.journey.missionsStages || [];
        let found = null;
        for (const stage of stages) {
          found = stage.missions.find((item) => item.id === circleId) || found;
        }
        if (found) {
          circleBackEditorOpen.add(circleId);
          if (!found.waiting && !circleBackUnsaved.has(circleId)) {
            circleBackUnsaved.set(circleId, { reason: "", instructions: "", returnDate: "" });
          }
          rerender({ scroll: false });
        }
        return;
      }
      const closeCircle = target?.closest("[data-circle-close]");
      const closeId = closeCircle?.getAttribute("data-circle-close");
      if (closeId) {
        circleBackEditorOpen.delete(closeId);
        circleBackUnsaved.delete(closeId);
        rerender({ scroll: false });
        sectionEl.querySelector(`[data-circle-back="${CSS.escape(closeId)}"]`)?.focus();
        return;
      }
      const reopenBtn = target?.closest("[data-circle-reopen]");
      const reopenId = reopenBtn?.getAttribute("data-circle-reopen");
      if (reopenId) {
        pushRoadmapUndo(appStore.journey);
        const stages = appStore.journey.missionsStages || [];
        for (const stage of stages) {
          const mission = stage.missions.find((item) => item.id === reopenId);
          if (mission) clearCircleBack(mission);
        }
        circleBackEditorOpen.delete(reopenId);
        circleBackUnsaved.delete(reopenId);
        focusMissionInUi(reopenId);
        touchJourney();
        flush();
        rerender();
        return;
      }
      const saveCircle = target?.closest("[data-circle-save]");
      const saveId = saveCircle?.getAttribute("data-circle-save");
      if (saveId) {
        const panel = sectionEl.querySelector(`[data-circle-back-panel="${CSS.escape(saveId)}"]`);
        const reason = panel?.querySelector(`[data-circle-reason="${saveId}"]`)?.value || "";
        const instructions = panel?.querySelector(`[data-circle-instructions="${saveId}"]`)?.value || "";
        const returnDate = panel?.querySelector(`[data-circle-return="${saveId}"]`)?.value || "";
        const stages = appStore.journey.missionsStages || [];
        let stageLabel = "";
        let mission = null;
        for (const stage of stages) {
          const hit = stage.missions.find((item) => item.id === saveId);
          if (hit) {
            mission = hit;
            stageLabel = stage.label || "";
          }
        }
        if (mission) {
          pushRoadmapUndo(appStore.journey);
          applyCircleBack(mission, { reason, instructions, returnDate });
          circleBackEditorOpen.delete(saveId);
          circleBackUnsaved.delete(saveId);
          touchJourney();
          flush();
          rerender();
          void (async () => {
            pushRoadmapUndo(appStore.journey);
            appStore.journey.missionsStages = await rippleCircleBackNotes(appStore.journey, mission, stageLabel);
            touchJourney();
            flush();
            rerender();
          })();
        }
        return;
      }
      const continueBtn = target?.closest("[data-mission-continue]");
      if (continueBtn) {
        const probe = continueRoadmap(structuredClone(appStore.journey));
        if (!probe.ok && probe.end) {
          if (!confirmExtend()) setNavFeedback(probe.reason);
          return;
        }
        pushRoadmapUndo(appStore.journey);
        const result = continueRoadmap(appStore.journey);
        touchJourney();
        flush();
        if (result.ok) {
          focusMissionInUi(result.focusId);
          rerender({ feedback: "" });
        } else {
          rerender({ feedback: result.reason });
        }
        return;
      }
      const undoBtn = target?.closest("[data-mission-undo]");
      if (undoBtn) {
        const restored = popRoadmapUndo(appStore.journey);
        if (!restored.ok) {
          setNavFeedback(restored.reason);
          syncUndoButtons();
          return;
        }
        touchJourney();
        flush();
        const focus = appStore.journey.focusMissionId;
        rerender({ scroll: false });
        if (focus) focusMissionInUi(focus);
        setNavFeedback("Restored the previous roadmap state.");
        return;
      }
      const returnBtn = target?.closest("[data-mission-return]");
      const returnId = returnBtn?.getAttribute("data-mission-return");
      if (returnId) {
        pushRoadmapUndo(appStore.journey);
        const stages = appStore.journey.missionsStages || [];
        for (const stage of stages) {
          const mission = stage.missions.find((item) => item.id === returnId);
          if (mission) mission.bypassed = false;
        }
        focusMissionInUi(returnId);
        touchJourney();
        flush();
        rerender();
        return;
      }
      const deleteBtn = target?.closest("[data-mission-delete]");
      const deleteId = deleteBtn?.getAttribute("data-mission-delete");
      if (deleteId) {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        const stages = appStore.journey.missionsStages || [];
        pushRoadmapUndo(appStore.journey);
        appStore.journey.missionsStages = deleteMissionFromStages(stages, deleteId);
        const nextFocus = pickNextFocusAfterDelete(appStore.journey.missionsStages, deleteId);
        appStore.journey.focusMissionId = nextFocus;
        touchJourney();
        flush();
        rerender();
        if (nextFocus) focusMissionInUi(nextFocus);
        return;
      }
    });
  }

  /** @param {Array<{ missions?: { id?: string }[] }>} stages @param {string} removedId */
  function pickNextFocusAfterDelete(stages, removedId) {
    const missions = (stages || []).flatMap((stage) => stage.missions || []);
    if (!missions.length) return null;
    if (appStore.journey.focusMissionId && appStore.journey.focusMissionId !== removedId) {
      return appStore.journey.focusMissionId;
    }
    return missions[0]?.id || null;
  }

  function continuationHost() {
    const parent = messagesEl || sectionEl;
    if (!parent) return null;
    let host = document.getElementById("mission-continuations");
    if (!host) {
      host = document.createElement("section");
      host.id = "mission-continuations";
      host.className = "v2-continuations v2-text-box v2-text-box--chrome";
      host.setAttribute("aria-label", "Next mission choices");
      parent.appendChild(host);
      host.addEventListener("click", onContinuationClick);
    }
    return host;
  }

  function renderContinuations() {
    const host = continuationHost();
    if (!host) return;
    const saved = appStore.journey.savedContinuations || [];
    const savedIds = new Set(saved.map((item) => item.id));
    const choices = continuationOffer
      .map((stage, index) => {
        const tasks = (stage.missions || []).map((mission) => mission.title).filter(Boolean).join(" · ");
        const kept = savedIds.has(stage.id);
        return `<article class="v2-continuations__choice">
          <h3>${escapeHtml(stage.label)}</h3>
          ${stage.desc ? `<p>${escapeHtml(stage.desc)}</p>` : ""}
          ${tasks ? `<p class="v2-continuations__tasks">${escapeHtml(tasks)}</p>` : ""}
          <div class="v2-continuations__actions">
            <button type="button" data-continuation-choose="${index}">Choose this mission</button>
            <button type="button" data-continuation-save="${index}" ${kept ? "disabled" : ""}>${kept ? "Saved" : "Save for later"}</button>
          </div>
        </article>`;
      })
      .join("");
    const kept = saved
      .map(
        (stage) => `<article class="v2-continuations__choice is-saved">
          <h3>${escapeHtml(stage.label)}</h3>
          ${stage.desc ? `<p>${escapeHtml(stage.desc)}</p>` : ""}
          <div class="v2-continuations__actions">
            <button type="button" data-continuation-use="${escapeHtml(stage.id)}">Use this saved mission</button>
          </div>
        </article>`
      )
      .join("");
    host.innerHTML = `
      <p class="v2-continuations__kicker">Next mission</p>
      ${choices ? `<p>Three ways this roadmap could continue. Pick one. Save any you are not ready to use.</p>${choices}` : ""}
      ${kept ? `<p class="v2-continuations__kicker">Saved continuations</p>${kept}` : ""}
      <button type="button" data-continuation-dismiss="1">Not now</button>`;
    layout();
    scrollFrameChildIntoView(host);
  }

  /** @param {MouseEvent} event */
  function onContinuationClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-continuation-dismiss]")) {
      continuationOffer = [];
      document.getElementById("mission-continuations")?.remove();
      return;
    }
    const choose = target.closest("[data-continuation-choose]");
    if (choose) {
      const index = Number(choose.getAttribute("data-continuation-choose"));
      const stage = continuationOffer[index];
      if (!stage) return;
      adoptContinuation(stage);
      continuationOffer = continuationOffer.filter((item) => item.id !== stage.id);
      renderContinuations();
      return;
    }
    const save = target.closest("[data-continuation-save]");
    if (save) {
      const index = Number(save.getAttribute("data-continuation-save"));
      const stage = continuationOffer[index];
      if (!stage) return;
      saveContinuation(appStore.journey, stage);
      touchJourney();
      flush();
      renderContinuations();
      return;
    }
    const use = target.closest("[data-continuation-use]");
    const useId = use?.getAttribute("data-continuation-use");
    if (useId) {
      const stage = (appStore.journey.savedContinuations || []).find((item) => item.id === useId);
      if (stage) adoptContinuation(stage);
    }
  }

  /** @param {{ id?: string, label: string, desc?: string, missions: { title: string, text?: string }[] }} stage */
  function adoptContinuation(stage) {
    const stages = appStore.journey.missionsStages || [];
    if (stages.some((item) => item.label === stage.label)) {
      setNavFeedback(`“${stage.label}” is already on this roadmap.`);
      return;
    }
    if (stages.length >= 8) {
      setNavFeedback("This roadmap already has as many missions as it can hold.");
      return;
    }
    pushRoadmapUndo(appStore.journey);
    appStore.journey.missionsStages = [...stages, { label: stage.label, desc: stage.desc || "", missions: stage.missions }].slice(0, 8);
    touchJourney();
    flush();
    show(appStore.journey.missionsStages);
  }

  function continuationId(stage, index) {
    const base = String(stage.label || "next")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36);
    return `${base || "next"}-${index + 1}`;
  }

  async function offerContinuations() {
    const pathNode = graphStore.nodes.find((node) => node.id === appStore.journey.roadmapPathId);
    if (!pathNode || pending) return;
    const ticket = ++serial;
    pending = true;
    setStatusMessage(statusEl(), "Finding three ways the next mission could go");
    const existing = flatMissions().map((mission) => mission.title);
    const stageNames = (appStore.journey.missionsStages || []).map((stage) => stage.label).filter(Boolean);
    const prompt =
      `You are whatimado. Offer THREE different possible NEXT missions for "${pathNode.title || pathNode.label}". ` +
      `They are alternatives, not a sequence. Do not repeat these missions: ${stageNames.join("; ") || "none"}. ` +
      `Do not repeat these tasks: ${existing.join("; ") || "none"}.\n` +
      `Return ONLY JSON: {"stages":[{"label":"short mission name","desc":"one sentence","missions":[{"title":"6-14 word action","text":"2 concrete sentences","resources":[]}]}]}\n` +
      `Exactly 3 stages. Each stage is one mission with 2 tasks. ${writingVoice(appStore.profile)}`;
    try {
      const raw = await callAdvisor(prompt, { maxTokens: 1100, feature: "v2_missions_more" });
      if (ticket !== serial) return;
      const added = parseStagesResponse(raw, []).slice(0, 3);
      if (added.length < 1) {
        setNavFeedback("I couldn't draft the next mission options. Try again in a moment.");
        return;
      }
      continuationOffer = added.map((stage, index) => ({ ...stage, id: continuationId(stage, index) }));
      renderContinuations();
    } catch {
      if (ticket !== serial) return;
      setNavFeedback("I couldn't draft the next mission options. Try again in a moment.");
    } finally {
      if (ticket !== serial) return;
      pending = false;
      setStatusMessage(statusEl(), "");
    }
  }

  async function extend() {
    await offerContinuations();
  }

  /** Map + and Continue at the last task open the same three-way choice. Cancel leaves the roadmap as it is. */
  function confirmExtend() {
    if (pending) return false;
    void offerContinuations();
    return true;
  }

  function restore() {
    const stages = appStore.journey.missionsStages || [];
    if (!stages.length || !appStore.journey.planConfirmed) return;
    show(stages);
  }

  return { begin, restore, clear, extend, confirmExtend, focus, refresh };
}
