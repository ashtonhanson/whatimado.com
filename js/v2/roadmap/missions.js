import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { buildIntakeContextBlock, shouldBlockJobBoards, writingVoice } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";
import { normalizeResources, parseResourcesResponse, renderResourcesRail, resourcesForRail, resourcesMatchingFirstMissions } from "./resources.js";
import { bindResourcesAccordions, renderResourcesAccordion, resourcePlaceLabel, resourcesForTask } from "./resources-accordion.js";
import { catalogForStages } from "./drafts.js";
import { graphStore } from "../graph-store.js";
import { toggleSavedPath } from "../state/journey.js";

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
              const title = String(mission?.title || mission?.mission || "").trim();
              return {
                id: missionId(title, missionIndex),
                title,
                text: String(mission?.text || "").trim(),
                done: Boolean(mission?.done),
                resources: normalizeResources(mission?.resources)
              };
            })
            .filter((mission) => mission.title && mission.text)
        };
      })
      .filter((stage) => stage.label && stage.missions.length);
    return stages.length ? stages : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {import("../graph-store.js").GraphNode} idea
 * @param {string[]} bullets
 */
function buildMissionsPrompt(idea, bullets) {
  const context = buildIntakeContextBlock(
    appStore.profile,
    formatUserLocation(appStore.location),
    appStore.journey.pathMode
  );
  const stability = shouldBlockJobBoards(appStore.profile)
    ? "STABILITY FIRST: ID or housing is not confirmed. Do not assign job boards, Indeed, or a contact-tracking spreadsheet. Open with shelter, documents, or ID steps that match the profile."
    : "Do not insert ID, shelter, or basic-needs steps unless the profile says they are needed.";
  const plan = (bullets || []).map((bullet) => `- ${bullet}`).join("\n");
  return (
    `You are whatimado. Write the FIRST roadmap for "${idea.title || idea.label}".\n` +
    `Return ONLY JSON:\n` +
    `{"stages":[{"label":"mission name","desc":"one sentence","missions":[{"title":"task the person does","text":"2 concrete sentences","resources":[]}]}],"resources":[{"name":"","kind":"organization|platform|person|event","place":"city or online","why":"why this fits THIS path","offers":"the specific program or service","nextStep":"one action to take","url":"https://official-site","email":"","phone":"","address":"","contact":"department or role"}]}\n` +
    `Exactly 2 stages. Each stage is one mission with 2 tasks.\n` +
    `Resources are ways to reach people on THIS path. Return at least 3 and at most 4 organizations that the first tasks actually name. Every place named in a task must appear in resources with its official URL. Do not name Austin Design Week; that festival has ended. If the path is in Austin and the tasks mention meetups or agencies, include AIGA Austin events (https://austin.aiga.org/upcoming-events/) and LinkedIn (https://www.linkedin.com/). Include email or phone only when you know that exact current address or number. If you do not, leave it empty and put the official contact-page URL in url. Never invent an email or phone number.\n` +
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
 * Planned missions stay visible and grey. The first unfinished one is current.
 * The plus opens the next mission at the end of this line.
 * @param {Array<{ missions?: { id?: string, title?: string, done?: boolean }[] }>} stages
 */
function renderMissionTimeline(stages) {
  const missions = stages.flatMap((stage) => stage.missions || []);
  if (!missions.length) return "";
  let seenCurrent = false;
  const items = missions
    .map((mission) => {
      const done = Boolean(mission.done);
      const current = !done && !seenCurrent;
      if (current) seenCurrent = true;
      const state = done ? "is-done" : current ? "is-current" : "is-planned";
      const label = done ? "Done" : current ? "Now" : "Planned";
      return `<button type="button" class="v2-timeline__item ${state}" data-timeline-id="${escapeHtml(mission.id || "")}"><span>${escapeHtml(label)}</span>${escapeHtml(mission.title || "Mission")}</button>`;
    })
    .join("");
  return `
    <div class="v2-timeline" aria-label="Mission timeline">
      ${items}
      <button type="button" class="v2-timeline__add" data-timeline-add="1" aria-label="Add a mission here">+</button>
    </div>`;
}

/** @param {HTMLElement | null} root @param {string} missionId */
export function highlightTimelineMission(root, missionId) {
  if (!root) return;
  root.querySelectorAll("[data-timeline-id]").forEach((item) => {
    item.classList.toggle("is-current", item.getAttribute("data-timeline-id") === missionId);
    if (item.getAttribute("data-timeline-id") === missionId && item.classList.contains("is-planned")) {
      item.classList.remove("is-planned");
    }
  });
}

/**
 * @param {HTMLElement | null} root
 * @param {{ label: string, desc: string, missions: { title: string, text: string }[] }[]} stages
 * @param {{ id: string, label: string, missionTitle: string }[]} [catalog]
 * @param {import("./resources.js").LocalResource[]} [sharedResources]
 * @param {string} [place]
 */
export function renderMissionStages(root, stages, catalog = [], sharedResources = [], place = "") {
  if (!root) return;
  const byTitle = new Map(catalog.map((item) => [item.missionTitle, item]));
  const master = sharedResources.length
    ? `<div class="v2-resources-master">${renderResourcesAccordion({
        id: "path-resources",
        resources: sharedResources,
        place
      })}</div>`
    : "";
  root.innerHTML = master + renderMissionTimeline(stages) + stages
    .map(
      (stage, index) => `
        <article class="v2-stage" id="stage-${index}">
          <label class="v2-check v2-stage__label">
            <input type="checkbox" data-stage-index="${index}" ${stage.missions.every((mission) => mission.done) ? "checked" : ""} />
            <span>${index + 1}. ${escapeHtml(stage.label)}</span>
          </label>
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
                return `
                  <li class="v2-mission${mission.done ? " is-done" : ""}" id="mission-${escapeHtml(id)}">
                    <label class="v2-check v2-mission__title">
                      <input type="checkbox" data-mission-id="${escapeHtml(id)}" ${mission.done ? "checked" : ""} />
                      <span>${escapeHtml(mission.title)}</span>
                    </label>
                    <p class="v2-mission__text">${escapeHtml(mission.text)}</p>
                    ${steps}
                    ${timing}
                    ${resources}
                    ${action}
                    <button type="button" class="v2-difficulty" data-difficulty="${escapeHtml(id)}">Having difficulties</button>
                  </li>`;
              })
              .join("")}
          </ol>
        </article>`
    )
    .join("");
  const first = stages[0];
  const firstDone = Boolean(first?.missions?.length && first.missions.every((mission) => mission.done));
  root.innerHTML += firstDone ? renderNextPathOptions() : "";
  bindResourcesAccordions(root);
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
 *   onShown?: (stages: { label: string, desc: string, missions: { title: string, text: string }[] }[]) => void
 * }} ui
 */
export function createMissionsController(ui) {
  const { sectionEl, listEl, layout, flush, onShown } = ui;
  let pending = false;
  let serial = 0;

  function statusEl() {
    return sectionEl?.querySelector("#missions-status") || null;
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
    if (listEl) listEl.innerHTML = "";
    sectionEl?.classList.add("hidden");
    renderResourcesRail([], appStore.location, appStore.profile);
    onShown?.([]);
    touchJourney();
    flush();
  }

  function show(stages, { scroll = true } = {}) {
    if (!sectionEl) return;
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
    renderMissionStages(listEl, stages, catalog, sharedResources, resourcePlaceLabel(appStore.location));
    onShown?.(stages);
    renderResourcesRail(appStore.journey.missionResources, appStore.location, appStore.profile);
    bindProgress(listEl);
    setStatusMessage(statusEl(), "");
    if (scroll) scrollFrameChildIntoView(sectionEl);
    layout();
  }

  function refresh() {
    const stages = appStore.journey.missionsStages || [];
    if (stages.length && appStore.journey.planConfirmed) show(stages, { scroll: false });
  }

  function remember(stages, resources, pathId) {
    appStore.journey.missionsStages = stages;
    appStore.journey.missionResources = normalizeResources(resources);
    if (pathId) appStore.journey.roadmapPathId = pathId;
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

  function bindProgress(root) {
    if (!root || root.dataset.progressBound === "1") return;
    root.dataset.progressBound = "1";
    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const stages = appStore.journey.missionsStages || [];
      if (target.dataset.missionId) {
        for (const stage of stages) {
          const mission = stage.missions.find((item) => item.id === target.dataset.missionId);
          if (mission) mission.done = target.checked;
        }
      } else if (target.dataset.stageIndex != null) {
        const stage = stages[Number(target.dataset.stageIndex)];
        stage?.missions.forEach((mission) => {
          mission.done = target.checked;
        });
      } else if (target.dataset.savePath) {
        toggleSavedPath(appStore.journey, target.dataset.savePath);
      } else return;
      touchJourney();
      flush();
      show(stages);
    });
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const open = target?.closest("[data-open-path]");
      const openId = open?.getAttribute("data-open-path");
      if (openId) {
        root.dispatchEvent(new CustomEvent("mission-open-path", { bubbles: true, detail: { id: openId } }));
        return;
      }
      const timeline = target?.closest("[data-timeline-id]");
      const timelineId = timeline?.getAttribute("data-timeline-id");
      if (timelineId) {
        highlightTimelineMission(root, timelineId);
        root.dispatchEvent(new CustomEvent("mission-focus", { bubbles: true, detail: { id: timelineId } }));
        return;
      }
      if (target?.closest("[data-timeline-add]")) {
        root.dispatchEvent(new CustomEvent("mission-add", { bubbles: true }));
        return;
      }
      const difficulty = target?.closest("[data-difficulty]");
      const difficultyId = difficulty?.getAttribute("data-difficulty");
      if (difficultyId) {
        root.dispatchEvent(new CustomEvent("mission-difficulty", { bubbles: true, detail: { id: difficultyId } }));
      }
    });
  }

  async function extend() {
    const pathNode = graphStore.nodes.find((node) => node.id === appStore.journey.roadmapPathId);
    if (!pathNode || pending) return;
    const ticket = ++serial;
    pending = true;
    setStatusMessage(statusEl(), "Adding the next missions");
    const existing = flatMissions().map((mission) => mission.title);
    const prompt =
      `You are whatimado. Add the NEXT batch of missions for "${pathNode.title || pathNode.label}". Do not repeat: ${existing.join("; ") || "none"}.\n` +
      `Return ONLY JSON: {"stages":[{"label":"short stage name","desc":"one sentence","missions":[{"title":"6-14 word action","text":"2 concrete sentences","resources":[]}]}]}\n` +
      `Exactly 1 stage, 2 missions. ${writingVoice(appStore.profile)}`;
    try {
      const raw = await callAdvisor(prompt, { maxTokens: 700, feature: "v2_missions_more" });
      if (ticket !== serial) return;
      const added = parseStagesResponse(raw, []);
      if (!added.length) return;
      appStore.journey.missionsStages = [...(appStore.journey.missionsStages || []), ...added].slice(0, 8);
      touchJourney();
      flush();
      show(appStore.journey.missionsStages);
    } catch {
      if (ticket !== serial) return;
    } finally {
      if (ticket !== serial) return;
      pending = false;
      setStatusMessage(statusEl(), "");
    }
  }

  function restore() {
    const stages = appStore.journey.missionsStages || [];
    if (!stages.length || !appStore.journey.planConfirmed) return;
    show(stages);
  }

  return { begin, restore, clear, extend, refresh };
}
