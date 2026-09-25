import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { buildIntakeContextBlock, shouldBlockJobBoards, writingVoice } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";
import { normalizeResources, parseResourcesResponse, renderResourcesRail, resourcesForRail } from "./resources.js";
import { bindResourcesAccordions, renderResourcesAccordion, resourcePlaceLabel, resourcesForTask } from "./resources-accordion.js";
import { catalogForStages } from "./drafts.js";
import { graphStore } from "../graph-store.js";

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
    `Resources are for THIS path only. Use official sites you trust. Include email or phone only when you know that exact current address or number. If you do not, leave it empty and say to use the official contact form in nextStep. Never invent an email or phone number.\n` +
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
  root.innerHTML = master + stages
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
                return `
                  <li class="v2-mission${mission.done ? " is-done" : ""}" id="mission-${escapeHtml(id)}">
                    <label class="v2-check v2-mission__title">
                      <input type="checkbox" data-mission-id="${escapeHtml(id)}" ${mission.done ? "checked" : ""} />
                      <span>${escapeHtml(mission.title)}</span>
                    </label>
                    <p class="v2-mission__text">${escapeHtml(mission.text)}</p>
                    ${resources}
                    ${action}
                  </li>`;
              })
              .join("")}
          </ol>
        </article>`
    )
    .join("");
  bindResourcesAccordions(root);
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

  function show(stages) {
    if (!sectionEl) return;
    stages.forEach((stage) => {
      stage.missions.forEach((mission, index) => {
        if (!mission.id) mission.id = missionId(mission.title, index);
      });
    });
    sectionEl.classList.remove("hidden");
    const catalog = catalogForStages(stages, appStore.profile);
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
    scrollFrameChildIntoView(sectionEl);
    layout();
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
      } else return;
      touchJourney();
      flush();
      show(stages);
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

  return { begin, restore, clear, extend };
}
