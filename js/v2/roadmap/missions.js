import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { buildIntakeContextBlock, shouldBlockJobBoards } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";

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
          title: `Take the first practical step on ${title}`,
          text: "Pick the smallest action you can finish in the next few days — a message, a call, or a short piece of proof. Do that before you add more training or applications."
        },
        {
          title: "Write down what happened and the next move",
          text: "Note who you reached, what they said, and the single next action. That record is what the following stage builds on."
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
              text: String(mission?.text || "").trim()
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
    `{"stages":[{"label":"short stage name","desc":"one sentence","missions":[{"title":"6-14 word action","text":"2 concrete sentences"}]}]}\n` +
    `Exactly 2 stages, 2 missions each. Middle-school reading level. No job-board filler.\n` +
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
 */
export function renderMissionStages(root, stages) {
  if (!root) return;
  root.innerHTML = stages
    .map(
      (stage, index) => `
        <article class="v2-stage">
          <h3 class="v2-stage__label">${index + 1}. ${escapeHtml(stage.label)}</h3>
          ${stage.desc ? `<p class="v2-stage__desc">${escapeHtml(stage.desc)}</p>` : ""}
          <ol class="v2-mission-list">
            ${stage.missions
              .map(
                (mission) => `
                  <li class="v2-mission">
                    <p class="v2-mission__title">${escapeHtml(mission.title)}</p>
                    <p class="v2-mission__text">${escapeHtml(mission.text)}</p>
                  </li>`
              )
              .join("")}
          </ol>
        </article>`
    )
    .join("");
}

/**
 * @param {{
 *   sectionEl: HTMLElement | null,
 *   listEl: HTMLElement | null,
 *   layout: () => void,
 *   flush: () => void
 * }} ui
 */
export function createMissionsController(ui) {
  const { sectionEl, listEl, layout, flush } = ui;
  let pending = false;

  function statusEl() {
    return sectionEl?.querySelector("#missions-status") || null;
  }

  function show(stages) {
    if (!sectionEl) return;
    sectionEl.classList.remove("hidden");
    renderMissionStages(listEl, stages);
    setStatusMessage(statusEl(), "");
    scrollFrameChildIntoView(sectionEl);
    layout();
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
    setStatusMessage(statusEl(), "Generating your missions");
    scrollFrameChildIntoView(sectionEl);
    layout();
    const fallback = fallbackStages(idea, appStore.profile);
    try {
      const raw = await callAdvisor(buildMissionsPrompt(idea, bullets), {
        maxTokens: 900,
        feature: "v2_missions"
      });
      const stages = parseStagesResponse(raw, fallback);
      appStore.journey.missionsStages = stages;
      touchJourney();
      flush();
      show(stages);
    } catch {
      appStore.journey.missionsStages = fallback;
      touchJourney();
      flush();
      show(fallback);
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
