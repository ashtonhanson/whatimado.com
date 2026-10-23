import { callAdvisor } from "../advisor.js";
import { buildSharedPromptContext } from "../state/goal-brief.js";
import { graphStore } from "../graph-store.js";
import { appStore, touchJourney } from "../state/store.js";
import { appendMessage, escapeHtml } from "../ui.js";

/** @typedef {{ role: "user"|"assistant", content: string }} TaskMessage */
/** @typedef {{ messages: TaskMessage[], composerDraft?: string }} TaskChatThread */

/**
 * @param {string} roadmapPathId
 * @param {string} missionId
 */
export function taskChatStorageKey(roadmapPathId, missionId) {
  return `${String(roadmapPathId || "path").slice(0, 80)}:${String(missionId || "").slice(0, 80)}`;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, TaskChatThread>}
 */
export function normalizeTaskChats(raw) {
  if (!raw || typeof raw !== "object") return {};
  /** @type {Record<string, TaskChatThread>} */
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = /** @type {{ messages?: unknown, composerDraft?: unknown }} */ (value);
    const messages = normalizeTaskMessages(entry.messages);
    const composerDraft = String(entry.composerDraft || "").slice(0, 4000);
    if (messages.length || composerDraft) {
      out[String(key).slice(0, 120)] = { messages, composerDraft };
    }
  }
  return out;
}

/** @param {unknown} raw @returns {TaskMessage[]} */
function normalizeTaskMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const role = row.role === "user" ? "user" : "assistant";
      const content = String(row.content || "").trim();
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-80);
}

/**
 * @param {import("../state/journey.js").Journey} journey
 * @param {string} key
 * @returns {TaskChatThread}
 */
export function getTaskThread(journey, key) {
  if (!journey.taskChats) journey.taskChats = {};
  if (!journey.taskChats[key]) journey.taskChats[key] = { messages: [], composerDraft: "" };
  return journey.taskChats[key];
}

/**
 * @param {string} missionId
 * @returns {{ mission: { id?: string, title?: string, text?: string, done?: boolean }, stage: { label?: string, desc?: string } | null, pathTitle: string } | null}
 */
export function resolveMissionContext(missionId) {
  const stages = appStore.journey.missionsStages || [];
  for (const stage of stages) {
    const mission = (stage.missions || []).find((item) => item.id === missionId);
    if (mission) {
      const pathNode = graphStore.nodes.find((node) => node.id === appStore.journey.roadmapPathId);
      return {
        mission,
        stage,
        pathTitle: pathNode?.title || pathNode?.label || "Your roadmap"
      };
    }
  }
  const graphNode = graphStore.nodes.find((node) => node.id === missionId);
  if (graphNode && (graphNode.type === "mission" || graphNode.type === "task")) {
    const pathNode = graphStore.nodes.find((node) => node.id === appStore.journey.roadmapPathId);
    return {
      mission: {
        id: missionId,
        title: graphNode.title || graphNode.label,
        text: graphNode.description || "",
        done: Boolean(graphNode.done)
      },
      stage: null,
      pathTitle: pathNode?.title || pathNode?.label || "Your roadmap"
    };
  }
  return null;
}

/**
 * @param {{
 *   missionTitle: string,
 *   missionText: string,
 *   stageLabel?: string,
 *   stageDesc?: string,
 *   missionId?: string,
 *   missionDone?: boolean,
 *   pathTitle: string,
 *   question: string,
 *   thread: TaskChatThread,
 * }} ctx
 */
export function buildTaskCoachPrompt(ctx) {
  const threadHistory = (ctx.thread.messages || [])
    .map((message) => `${message.role === "user" ? "User" : "Advisor"}: ${message.content}`)
    .join("\n");
  const globalTail = (appStore.journey.messages || [])
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "Advisor"}: ${message.content}`)
    .join("\n");
  const context = buildSharedPromptContext({
    journey: appStore.journey,
    profile: appStore.profile,
    location: appStore.location
  });

  return (
    `You are whatimado, a practical task coach helping someone execute a roadmap step.\n\n` +
    `Roadmap path: ${ctx.pathTitle}\n` +
    `${ctx.stageLabel ? `Stage: ${ctx.stageLabel}\n` : ""}` +
    `${ctx.stageDesc ? `Stage goal: ${ctx.stageDesc}\n` : ""}` +
    `${ctx.missionId ? `Task id: ${ctx.missionId}\n` : ""}` +
    `Current task: ${ctx.missionTitle}\n` +
    `Task status: ${ctx.missionDone ? "done" : "not done yet"}\n` +
    `Task instructions: ${ctx.missionText}\n` +
    `Latest question: ${ctx.question}\n\n` +
    (threadHistory ? `Task chat so far:\n${threadHistory}\n\n` : "") +
    (globalTail ? `Broader journey context (recent):\n${globalTail}\n\n` : "") +
    `${context}\n\n` +
    `Answer helpfully in 2-5 sentences. Be specific to THIS task and THIS question.\n` +
    `When the user asks you to draft something, provide copy-paste ready text when appropriate.\n` +
    `Plain text only.`
  );
}

const CHAT_ICON =
  `<svg class="v2-mission-chat-open__icon" viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4.2 3.15a.75.75 0 0 1-1.2-.6V16H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
  `</svg>`;

/**
 * @param {{
 *   listRoot: HTMLElement | null,
 *   frameEl: import("../components/whatimado-frame.js").WhatimadoFrame | null,
 *   layout: () => void,
 *   flush: () => void,
 * }} ui
 */
export function createTaskChatController(ui) {
  const { listRoot, frameEl, layout, flush } = ui;
  /** @type {string | null} */
  let openMissionId = null;
  /** @type {Map<string, number>} */
  const contentScrollTops = new Map();
  /** @type {{ key: string | null, ticket: number }} */
  let inflight = { key: null, ticket: 0 };
  /** @type {HTMLElement | null} */
  let lastTrigger = null;
  /** @type {number} */
  let frameBodyScrollTop = 0;

  function missionItem(missionId) {
    return listRoot?.querySelector(`.v2-mission[data-mission-id="${CSS.escape(missionId)}"]`) ?? null;
  }

  function chatPanel(missionId) {
    return missionItem(missionId)?.querySelector(".v2-mission-chat") ?? null;
  }

  function contentPane(missionId) {
    return missionItem(missionId)?.querySelector(".v2-mission__content") ?? null;
  }

  function storageKey(missionId) {
    return taskChatStorageKey(appStore.journey.roadmapPathId, missionId);
  }

  function setPanelOpen(missionId, open) {
    const item = missionItem(missionId);
    const panel = chatPanel(missionId);
    if (!item || !panel) return;
    item.classList.toggle("is-chat-open", open);
    if (open) {
      panel.removeAttribute("inert");
      panel.setAttribute("aria-hidden", "false");
    } else {
      panel.setAttribute("inert", "");
      panel.setAttribute("aria-hidden", "true");
    }
  }

  function renderThread(missionId) {
    const panel = chatPanel(missionId);
    const threadEl = panel?.querySelector(".v2-mission-chat__thread");
    if (!threadEl) return;
    const ctx = resolveMissionContext(missionId);
    const heading = panel.querySelector(".v2-mission-chat__heading");
    const statusEl = panel.querySelector(".v2-mission-chat__status");
    if (ctx) {
      if (heading) heading.textContent = ctx.mission.title || "This task";
      if (statusEl) {
        statusEl.textContent = ctx.mission.done ? "Done" : "In progress";
      }
    }
    const key = storageKey(missionId);
    const thread = getTaskThread(appStore.journey, key);
    threadEl.innerHTML = "";
    if (!thread.messages.length) {
      const empty = document.createElement("p");
      empty.className = "v2-mission-chat__empty";
      empty.textContent = "Ask anything about this step — wording, order, or what to do first.";
      threadEl.appendChild(empty);
    } else {
      thread.messages.forEach((message) => {
        appendMessage(threadEl, message.role === "user" ? "user" : "advisor", message.content, {
          skipScroll: true
        });
      });
    }
    const input = panel.querySelector(".v2-mission-chat__input");
    if (input instanceof HTMLTextAreaElement) {
      input.value = thread.composerDraft || "";
    }
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function open(missionId, trigger) {
    if (!missionId) return;
    frameBodyScrollTop = frameEl?.bodyEl?.scrollTop ?? frameBodyScrollTop;
    if (openMissionId && openMissionId !== missionId) {
      close(openMissionId, { restoreFocus: false });
    }
    lastTrigger = trigger instanceof HTMLElement ? trigger : lastTrigger;
    openMissionId = missionId;
    setPanelOpen(missionId, true);
    renderThread(missionId);
    layout();
    const closeBtn = chatPanel(missionId)?.querySelector(".v2-mission-chat__close");
    closeBtn?.focus();
  }

  function close(missionId, { restoreFocus = true } = {}) {
    if (!missionId) return;
    const content = contentPane(missionId);
    if (content instanceof HTMLElement) {
      contentScrollTops.set(missionId, content.scrollTop);
    }
    frameBodyScrollTop = frameEl?.bodyEl?.scrollTop ?? frameBodyScrollTop;
    setPanelOpen(missionId, false);
    if (openMissionId === missionId) openMissionId = null;
    if (restoreFocus && lastTrigger instanceof HTMLElement) {
      lastTrigger.focus();
    }
  }

  function closeOpen({ restoreFocus = true } = {}) {
    if (openMissionId) close(openMissionId, { restoreFocus });
  }

  function isOpen() {
    return Boolean(openMissionId);
  }

  function handlesEscape() {
    if (!openMissionId) return false;
    close(openMissionId);
    return true;
  }

  async function submit(missionId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ctx = resolveMissionContext(missionId);
    if (!ctx) return;

    const key = storageKey(missionId);
    const thread = getTaskThread(appStore.journey, key);
    thread.composerDraft = "";
    thread.messages.push({ role: "user", content: trimmed });
    touchJourney();
    flush();

    renderThread(missionId);
    layout();

    const panel = chatPanel(missionId);
    const threadEl = panel?.querySelector(".v2-mission-chat__thread");
    const typingEl = threadEl ? appendMessage(threadEl, "advisor", "…", { typing: true }) : null;
    layout();

    const ticket = ++inflight.ticket;
    inflight.key = key;
    try {
      const reply = await callAdvisor(
        buildTaskCoachPrompt({
          missionId: ctx.mission.id || missionId,
          missionTitle: ctx.mission.title || "Task",
          missionText: ctx.mission.text || "",
          missionDone: Boolean(ctx.mission.done),
          stageLabel: ctx.stage?.label,
          stageDesc: ctx.stage?.desc,
          pathTitle: ctx.pathTitle,
          question: trimmed,
          thread
        }),
        { maxTokens: 700, feature: "v2_task_chat" }
      );
      if (inflight.key !== key || inflight.ticket !== ticket) return;
      const finalText = reply || "I'm here — ask a more specific question about this step.";
      thread.messages.push({ role: "assistant", content: finalText });
    } catch (error) {
      if (inflight.key !== key || inflight.ticket !== ticket) return;
      thread.messages.push({
        role: "assistant",
        content: `I couldn't reach the advisor right now (${error?.message || "unknown error"}). Try again in a moment.`
      });
    } finally {
      if (inflight.key === key && inflight.ticket === ticket) {
        inflight.key = null;
      }
    }

    touchJourney();
    flush();
    typingEl?.remove();
    renderThread(missionId);
    layout();
  }

  function bindRoot() {
    if (!listRoot || listRoot.dataset.taskChatBound === "1") return;
    listRoot.dataset.taskChatBound = "1";

    listRoot.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const openBtn = target?.closest("[data-mission-chat-open]");
      if (openBtn instanceof HTMLButtonElement) {
        const missionId = openBtn.getAttribute("data-mission-chat-open");
        if (missionId) {
          openBtn.dispatchEvent(new CustomEvent("mission-focus", { bubbles: true, detail: { id: missionId } }));
        }
        return;
      }
      if (target && !target.closest("button, a, input, textarea, select, label")) {
        const card = target.closest(".v2-mission[data-mission-id]");
        const missionId = card?.getAttribute("data-mission-id");
        if (missionId) {
          card.dispatchEvent(new CustomEvent("mission-focus", { bubbles: true, detail: { id: missionId } }));
        }
      }
      const closeBtn = target?.closest("[data-mission-chat-close]");
      if (closeBtn instanceof HTMLButtonElement) {
        const missionId = closeBtn.getAttribute("data-mission-chat-close");
        if (missionId) close(missionId);
      }
    });

    listRoot.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || !target.matches(".v2-mission-chat__input")) return;
      const missionId = target.getAttribute("data-mission-chat-input");
      if (!missionId) return;
      const key = storageKey(missionId);
      const thread = getTaskThread(appStore.journey, key);
      thread.composerDraft = target.value;
      touchJourney();
      flush();
    });

    listRoot.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches(".v2-mission-chat__composer")) return;
      event.preventDefault();
      event.stopPropagation();
      const missionId = form.getAttribute("data-mission-chat-form");
      const input = form.querySelector(".v2-mission-chat__input");
      if (!missionId || !(input instanceof HTMLTextAreaElement)) return;
      void submit(missionId, input.value);
      input.value = "";
    });
  }

  function afterMissionRender() {
    bindRoot();
    for (const [missionId, scrollTop] of contentScrollTops) {
      const content = contentPane(missionId);
      if (content) content.scrollTop = scrollTop;
    }
    if (openMissionId && missionItem(openMissionId)) {
      setPanelOpen(openMissionId, true);
      renderThread(openMissionId);
    } else if (openMissionId) {
      openMissionId = null;
    }
    if (openMissionId && frameEl?.bodyEl) {
      frameEl.bodyEl.scrollTop = frameBodyScrollTop;
    }
  }

  function focusMission(missionId) {
    if (!missionId) return;
    missionItem(missionId)?.scrollIntoView({ block: "nearest" });
  }

  return {
    open,
    close,
    closeOpen,
    isOpen,
    handlesEscape,
    afterMissionRender,
    focusMission,
    bindRoot,
    CHAT_ICON
  };
}

export function renderMissionChatOpenButton(missionId) {
  return `
    <button type="button" class="v2-mission-chat-open" data-mission-chat-open="${escapeHtml(missionId)}" aria-label="Chat about this task">
      ${CHAT_ICON}
      <span class="v2-mission-chat-open__label">Chat</span>
    </button>`;
}

/** @param {string} missionId @param {string} missionTitle */
export function renderMissionChatDrawer(missionId, missionTitle) {
  return `
        <aside
          class="v2-mission-chat"
          inert
          aria-hidden="true"
          aria-label="Task chat"
          data-mission-chat-panel="${escapeHtml(missionId)}"
        >
          <header class="v2-mission-chat__head">
            <div class="v2-mission-chat__titles">
              <p class="v2-mission-chat__kicker">Task chat</p>
              <h3 class="v2-mission-chat__heading">${escapeHtml(missionTitle)}</h3>
              <p class="v2-mission-chat__status" aria-live="polite"></p>
            </div>
            <button type="button" class="v2-mission-chat__close" data-mission-chat-close="${escapeHtml(missionId)}" aria-label="Close chat">
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div class="v2-mission-chat__thread" role="log" aria-live="polite"></div>
          <form class="v2-mission-chat__composer" data-mission-chat-form="${escapeHtml(missionId)}" novalidate>
            <label class="sr-only" for="mission-chat-input-${escapeHtml(missionId)}">Message about this task</label>
            <textarea
              id="mission-chat-input-${escapeHtml(missionId)}"
              class="v2-mission-chat__input"
              data-mission-chat-input="${escapeHtml(missionId)}"
              rows="2"
              placeholder="Ask about this step…"
              autocomplete="off"
            ></textarea>
            <button type="submit" class="v2-mission-chat__send">Send</button>
          </form>
        </aside>`;
}
