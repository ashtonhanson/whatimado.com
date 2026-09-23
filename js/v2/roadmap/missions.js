import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { buildIntakeContextBlock, shouldBlockJobBoards, writingVoice } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";
import { fallbackResources, mergeResources, normalizeResources, parseResourcesResponse, renderResourcesRail, resourcesForRail } from "./resources.js";
import { bindResourcesAccordions, renderResourcesAccordion, resourcePlaceLabel, resourcesForTask } from "./resources-accordion.js";
import { catalogForStages } from "./drafts.js";

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
      .slice(0, 3)
      .map((stage) => {
        const missions = Array.isArray(stage?.missions) ? stage.missions : stage?.tasks;
        return {
          label: String(stage?.label || "").trim(),
          desc: String(stage?.desc || "").trim(),
          missions: (Array.isArray(missions) ? missions : [])
            .slice(0, 3)
            .map((mission) => ({
              title: String(mission?.title || mission?.mission || "").trim(),
              text: String(mission?.text || "").trim(),
              resources: normalizeResources(mission?.resources)
            }))
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
    `{"stages":[{"label":"short stage name","desc":"one sentence","missions":[{"title":"6-14 word action","text":"2 concrete sentences","resources":[]}]}],"resources":[{"name":"organization","details":"one sentence of what to ask them in this situation","url":"https://official-site","phone":""}]}\n` +
    `Exactly 2 stages, 2 missions each.\n` +
    `The top-level "resources" array is the single list for the whole path: 2 to 4 real organizations in the user's city that someone at their level would actually contact. Each details sentence says what to ask them in this situation, not a brochure line about the organization. Use official sites you are sure about, and leave url empty if you are not sure. Do not invent phone numbers.\n` +
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
        <article class="v2-stage">
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
                return `
                  <li class="v2-mission">
                    <p class="v2-mission__title">${escapeHtml(mission.title)}</p>
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

  function statusEl() {
    return sectionEl?.querySelector("#missions-status") || null;
  }

  function show(stages) {
    if (!sectionEl) return;
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
    setStatusMessage(statusEl(), "");
    scrollFrameChildIntoView(sectionEl);
    layout();
  }

  function remember(stages, resources) {
    appStore.journey.missionsStages = stages;
    appStore.journey.missionResources = mergeResources(
      resources,
      fallbackResources(appStore.location, appStore.profile)
    );
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
    if (appStore.journey.missionsStages?.length && appStore.journey.selectedPathId === idea.id) {
      show(appStore.journey.missionsStages);
      return;
    }
    pending = true;
    sectionEl?.classList.remove("hidden");
    if (listEl) listEl.innerHTML = "";
    renderResourcesRail(appStore.journey.missionResources, appStore.location, appStore.profile);
    setStatusMessage(statusEl(), "Generating your missions");
    scrollFrameChildIntoView(sectionEl);
    layout();
    const fallback = fallbackStages(idea, appStore.profile);
    try {
      const raw = await callAdvisor(buildMissionsPrompt(idea, bullets), {
        maxTokens: 1200,
        feature: "v2_missions"
      });
      const stages = parseStagesResponse(raw, fallback);
      remember(stages, parseResourcesResponse(raw));
    } catch {
      remember(fallback, []);
    } finally {
      pending = false;
      setStatusMessage(statusEl(), "");
    }
  }

  function restore() {
    const stages = appStore.journey.missionsStages || [];
    if (!stages.length || !appStore.journey.planConfirmed) return;
    show(stages);
  }

  return { begin, restore };
}
