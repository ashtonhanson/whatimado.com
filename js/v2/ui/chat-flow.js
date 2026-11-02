import { PHASE, applyPhaseToDom } from "../phases.js";
import {
  CONVO_PROMPT_ID,
  graphStore,
  listedPathNodes,
  promptMapLabel,
  restorePossibilityMap,
  selectGraphNode,
  setExtraExploreOptions,
  setSpineAlternatePaths,
  showConversationSpine,
  showRoadmapBranch
} from "../graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "../advisor.js";
import { appendMessage, continuationThread, escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { notifyFrameLayout } from "../layout/notify-frame-layout.js";
import { MOBILE_GLIDE_EASE_MS, MOBILE_MQ, SNAP } from "../dock/constants.js";
import { appStore, resetAppStore, touchJourney } from "../state/store.js";
import { buildSharedPromptContext, invalidateDownstreamWork, refreshGoalBrief } from "../state/goal-brief.js";
import { ensureJourneyStarted, toggleSavedPath } from "../state/journey.js";
import { formatUserLocation, parseLocationAnswer } from "../state/location.js";
import { setUserProfileField } from "../state/user-profile.js";
import { applyPrefsToStore } from "../state/prefs.js";
import { trackEvent } from "../state/analytics.js";
import { hideIntakeChips, renderIntakeChips } from "../components/profile-chips.js";
import {
  deriveIntakeFactNodes,
  intakeFactDefForId,
  isIntakeFactId
} from "../map/intake-facts.js";
import { getChipStep, INTAKE_STEP } from "../intake/profile-chips.js";
import { isFounderOrProjectPrompt } from "../intake/clarifying.js";
import {
  activeAccountRoadmap,
  bindPersistLifecycle,
  clearGuestJourney,
  flushPersist,
  openFreshAccountRoadmap,
  openSavedRoadmap,
  restoreGuestJourney,
  saveRoadmapCopy,
  schedulePersist,
  setPersistEnabled,
  shelveGuestMap
} from "../state/persistence.js";
import { bindRoadmapsNav, bindSaveMapButton } from "./roadmaps-nav.js";
import {
  bindComposerDraftLifecycle,
  cancelPendingComposerDraftSave,
  clearComposerDraft
} from "../state/composer-draft.js";
import { authState, onAuthChange } from "../state/auth.js";
import { analyticsPageAllowed } from "../state/home-access.js";
import { readSession } from "../state/guest-account.js";
import { closeActivePageIfOpen } from "./pages.js";
import { journeyHasActiveWork, newMapConfirmMessage } from "./journey-work.js";
import { confirmStartNewMap } from "./new-map-dialog.js";
import { createIntakeController } from "../intake/session.js";
import { createPathMapController } from "../map/session.js";
import { createConfirmGateController } from "../roadmap/session.js";
import { createMissionsController } from "../roadmap/missions.js";
import { applyStructuredMissionUpdate, buildDifficultyPrompt, fallbackDifficultyUpdate, parseDifficultyUpdate } from "../roadmap/difficulty.js";
import { pushRoadmapUndo } from "../roadmap/roadmap-undo.js";
import { createDraftsController } from "../roadmap/drafts.js";
import { createTaskChatController } from "../roadmap/task-chat.js";
import { highlightIdsForChatFocus, hoverChatTargetId, resolveMapNodeActivation } from "../roadmap/map-chat-focus.js";

const PATHS_READY_TURN = 3;

/** Hypothetical transcript for v2 layout preview (matches layout SVG) */
const DEMO_CHAT = [
  {
    role: "user",
    content:
      "I'm getting out of AA recovery and I'm trying to get back on my feet again out in society."
  },
  {
    role: "advisor",
    content:
      "Congratulations. I am happy to see that you are making an effort to get yourself back into the work field."
  },
  {
    role: "user",
    content: "I do have kids though. So that is making my situation more complicated."
  },
  {
    role: "advisor",
    content:
      "That makes sense — childcare and stable hours often come first. What does a typical week look like for you right now?"
  },
  {
    role: "user",
    content: "Mostly school drop-offs, part-time shifts when I can get them, and trying not to miss rent."
  },
  {
    role: "advisor",
    content:
      "Thanks for laying that out. Let's stabilize the basics first, then map paths that fit school hours and your skills."
  }
];

/**
 * @param {{
 *   frameEl: import("../components/whatimado-frame.js").WhatimadoFrame | null,
 *   mapEl: import("../components/whatimado-map.js").WhatimadoMap | null,
 *   mainEl: HTMLElement | null,
 *   messagesEl: HTMLElement | null,
 *   activePathEl: HTMLElement | null,
 *   selectionPanel: HTMLElement | null,
 *   pathCardsEl: HTMLElement | null
 * }} ctx
 */
export function initChatFlow(ctx) {
  const { frameEl, mapEl, mainEl, messagesEl, activePathEl, selectionPanel, pathCardsEl } = ctx;
  const isDemo = new URLSearchParams(window.location.search).has("demo");

  setPersistEnabled(!isDemo);
  bindPersistLifecycle();
  if (!isDemo) bindComposerDraftLifecycle();

  const layout = () => notifyFrameLayout({ frameEl, mapEl });

  /**
   * @param {import("../phases.js").Phase} phase
   * @param {{ animate?: boolean, instant?: boolean }} [options]
   */
  function setPhase(phase, { animate = true, instant = false } = {}) {
    const wasOpen =
      appStore.journey.phase === PHASE.OPEN || document.body.dataset.phase === PHASE.OPEN;
    appStore.journey.phase = phase;
    touchJourney();
    applyPhaseToDom(document, phase, {
      ghostDismissed: appStore.journey.ghostDismissed,
      instant
    });
    if (wasOpen && phase !== PHASE.OPEN) {
      frameEl?.onHeroDismissed({ animate });
    }
    schedulePersist();
  }

  function setComposerEnabled(enabled) {
    frameEl?.setComposerEnabled(enabled);
  }

  function dismissGhostMap({ instant = false } = {}) {
    if (appStore.journey.ghostDismissed && !instant) return;
    appStore.journey.ghostDismissed = true;
    mapEl?.dismissGhost({ instant });
    setPhase(appStore.journey.phase, { animate: !instant, instant });
  }

  /** True while a new roadmap is still being written — prompt still lifts for the keyboard. */
  function isPreRoadmapCompose() {
    const phase = appStore.journey.phase;
    return (
      phase === PHASE.OPEN ||
      phase === PHASE.EXPLORING ||
      phase === PHASE.COACHING ||
      !appStore.journey.pathsGenerated
    );
  }

  /** Lift the chat/prompt to the top so the keyboard cannot crop it. Map stays visible behind. */
  function ensureTypingFullStage() {
    const dock = frameEl?._dock;
    if (!dock) return;
    document.body.classList.add("is-chat-full-stage");
    if (MOBILE_MQ.matches) {
      if (!dock._mobileChatSheet) dock.enterMobileChatMode?.();
      if (dock.activeSnap !== SNAP.MOBILE_EXPANDED) {
        dock.snapTo(SNAP.MOBILE_EXPANDED, { animate: true });
      }
      return;
    }
    if (!frameEl?.classList.contains("is-docked")) {
      frameEl?.onHeroDismissed?.({ animate: false });
    }
    if (dock.activeSnap !== SNAP.TOP) {
      dock.snapTo(SNAP.TOP, { animate: true });
    }
  }

  /** After paths exist, drop the sheet so chat has room; conversation spine stays on the map. */
  function settleFrameAfterPathsReady() {
    const dock = frameEl?._dock;
    document.body.classList.remove("is-chat-full-stage");
    dock?.releaseMobileComposerFocus?.();
    if (!dock) return;
    if (MOBILE_MQ.matches) {
      dock.mobileGlideToBottom?.() || dock.snapTo(SNAP.MOBILE_COLLAPSED, { animate: true });
      return;
    }
    dock.snapTo(SNAP.HOME, { animate: true });
  }

  /** Fit the live map in the menu→prompt band after a path select or spine paint. */
  function revealMapForSelectedRoadmap() {
    document.body.classList.remove("is-chat-full-stage");
    mapEl?.syncLiveFromStore();
    window.setTimeout(() => {
      mapEl?.syncSnapCamera({ force: true, animate: true });
    }, MOBILE_MQ.matches ? 80 : 40);
  }

  function syncExploreOptions() {
    setExtraExploreOptions(
      analyticsPageAllowed(authState().user) ? [{ id: "option-analytics", label: "Analytics" }] : []
    );
  }

  /** Intake answers + phase markers on the horizontal path from the first prompt. */
  function deriveConversationTopics() {
    return deriveIntakeFactNodes(appStore.profile, appStore.location, appStore.journey);
  }

  function topicsSignature(topics) {
    return JSON.stringify(
      (topics || []).map((topic) => [
        topic.id || "",
        topic.label || "",
        topic.title || topic.value || "",
        topic.editable ? 1 : 0
      ])
    );
  }

  /** @type {{ key: string, mode: "chips"|"text"|"location"|"prompt" } | null} */
  let pendingFactEdit = null;

  function paintConversationMap({ fit = false, selectId = CONVO_PROMPT_ID } = {}) {
    const label = appStore.journey.mapPromptLabel;
    if (!label || appStore.journey.planConfirmed) return;
    syncExploreOptions();
    const topics = deriveConversationTopics();
    appStore.journey.mapTopics = topics;
    showConversationSpine({ promptTitle: label, topics });
    mapEl?.syncLiveFromStore();
    if (selectId && graphStore.nodes.some((node) => node.id === selectId)) {
      mapEl?.setSelectedNode?.(selectId);
      mapEl?.setFocusedNode?.(selectId);
    } else {
      mapEl?.setSelectedNode?.(CONVO_PROMPT_ID);
    }
    if (fit) {
      window.setTimeout(() => {
        mapEl?.syncSnapCamera({ force: true, animate: true });
      }, MOBILE_MQ.matches ? 80 : 40);
    }
  }

  function refreshConversationMap() {
    if (!appStore.journey.mapPromptLabel || appStore.journey.planConfirmed) return;
    const next = deriveConversationTopics();
    const prev = appStore.journey.mapTopics || [];
    if (topicsSignature(next) === topicsSignature(prev)) return;
    appStore.journey.mapTopics = next;
    paintConversationMap();
    touchJourney();
    schedulePersist();
  }

  function resetMapForFirstPrompt(text) {
    const label = promptMapLabel(text);
    appStore.journey.mapPromptLabel = label;
    appStore.journey.mapTopics = [];
    syncExploreOptions();
    paintConversationMap({ fit: true });
    touchJourney();
  }

  function clearPendingFactEdit() {
    pendingFactEdit = null;
    hideIntakeChips(messagesEl);
  }

  /**
   * @param {{ category: string, affectsPaths: boolean }} fact
   */
  async function confirmFactRipple(fact) {
    const hasMissions = Boolean(appStore.journey.planConfirmed || (appStore.journey.missionsStages || []).length);
    const hasPaths = Boolean(appStore.journey.pathsGenerated);
    if (!hasPaths && !hasMissions) return true;
    const ripple = hasMissions
      ? "Possibility maps, missions, and tasks that depended on the old answer may regenerate."
      : "Possibility maps that depended on the old answer may regenerate.";
    return confirmStartNewMap({
      title: `Update ${fact.category}?`,
      message: `Save the new ${fact.category.toLowerCase()} answer? ${ripple}`,
      confirmLabel: "Update and refresh",
      cancelLabel: "Keep current",
      returnFocus: frameEl?.composerInput || null
    });
  }

  /**
   * @param {import("../map/intake-facts.js").IntakeFactDef | { key: string, category: string, affectsPaths: boolean }} fact
   * @param {string} value
   * @param {{ display?: string }} [options]
   */
  async function applyEditedFact(fact, value, options = {}) {
    const nextValue = String(value || "").trim();
    if (!nextValue) return false;
    if (fact.affectsPaths) {
      const ok = await confirmFactRipple(fact);
      if (!ok) return false;
    }

    const hadMissions = Boolean(appStore.journey.planConfirmed || (appStore.journey.missionsStages || []).length);
    const hadPaths = Boolean(appStore.journey.pathsGenerated);

    if (fact.key === "location") {
      const parsed = parseLocationAnswer(nextValue);
      appStore.location = parsed.city || parsed.region || parsed.country ? parsed : { ...parsed, raw: nextValue };
      appStore.journey.locationConfirmed = true;
    } else if (fact.key === "prompt") {
      appStore.journey.mapPromptLabel = promptMapLabel(nextValue) || nextValue.slice(0, 48);
    } else if (fact.field) {
      appStore.profile = setUserProfileField(appStore.profile, fact.field, nextValue);
    }

    const brief = refreshGoalBrief(appStore.journey, appStore.profile, appStore.location, {
      latestUserText: `Correction: ${fact.category} is now ${options.display || nextValue}`
    });
    appStore.profile = brief.profile;

    if (hadMissions || hadPaths) {
      invalidateDownstreamWork(appStore.journey);
      missions.clear();
      appStore.journey.selectedPathId = null;
      appStore.journey.roadmapPathId = null;
      confirmGate.hide();
    }

    clearPendingFactEdit();
    paintConversationMap({
      fit: true,
      selectId: fact.key === "prompt" ? CONVO_PROMPT_ID : `convo-fact-${fact.key}`
    });
    touchJourney();
    flushPersist();

    const thread = continuationThread(messagesEl) || messagesEl;
    if (thread) {
      appendMessage(
        thread,
        "advisor",
        hadPaths || hadMissions
          ? `Updated ${fact.category.toLowerCase()} to “${options.display || nextValue}”. Refreshing what depended on it.`
          : `Updated ${fact.category.toLowerCase()} to “${options.display || nextValue}”.`
      );
    }

    if (hadPaths || hadMissions) {
      appStore.journey.pathsGenerated = false;
      await pathMap.generate();
    } else {
      layout();
    }
    return true;
  }

  function startFactChipEdit(def) {
    if (!def.step || !messagesEl) return;
    const founder = isFounderOrProjectPrompt(
      appStore.journey.messages.find((turn) => turn.role === "user")?.content || ""
    );
    const spec = getChipStep(def.step, { founder });
    if (!spec?.options?.length) {
      pendingFactEdit = { key: def.key, mode: "text" };
      appendMessage(
        continuationThread(messagesEl) || messagesEl,
        "advisor",
        `What should I use for ${def.category.toLowerCase()} instead? Type the corrected answer.`
      );
      frameEl?.focusComposer?.({ glideOnMobile: true });
      return;
    }
    pendingFactEdit = { key: def.key, mode: "chips" };
    hideIntakeChips(messagesEl);
    appendMessage(
      continuationThread(messagesEl) || messagesEl,
      "advisor",
      `Update ${def.category.toLowerCase()}. Pick a new answer below, or type it.`
    );
    renderIntakeChips(messagesEl, {
      options: spec.options,
      multiple: Boolean(spec.multiple),
      exclusiveValues: spec.exclusiveValues,
      onSelect: (option) => {
        void applyEditedFact(def, option.value, { display: option.label });
      }
    });
    layout();
    scrollFrameChildIntoView(messagesEl, { toEnd: true });
  }

  function beginIntakeFactEdit(nodeId) {
    if (nodeId === CONVO_PROMPT_ID) {
      pendingFactEdit = { key: "prompt", mode: "prompt" };
      hideIntakeChips(messagesEl);
      appendMessage(
        continuationThread(messagesEl) || messagesEl,
        "advisor",
        "What should this first path node say instead? Type a short corrected goal."
      );
      frameEl?.focusComposer?.({ glideOnMobile: true });
      return;
    }
    const def = intakeFactDefForId(nodeId);
    if (!def) return;
    if (def.key === "location") {
      pendingFactEdit = { key: "location", mode: "location" };
      hideIntakeChips(messagesEl);
      appendMessage(
        continuationThread(messagesEl) || messagesEl,
        "advisor",
        "Type your corrected place — for example “Austin, Texas” or “Austin, TX, USA”."
      );
      frameEl?.focusComposer?.({ glideOnMobile: true });
      return;
    }
    if (def.key === "name" || def.key === "skills") {
      pendingFactEdit = { key: def.key, mode: "text" };
      hideIntakeChips(messagesEl);
      appendMessage(
        continuationThread(messagesEl) || messagesEl,
        "advisor",
        def.key === "name"
          ? "What name should I use instead?"
          : "What skills or background should I use instead? Type a short correction."
      );
      frameEl?.focusComposer?.({ glideOnMobile: true });
      return;
    }
    startFactChipEdit(def);
  }

  /** @param {string} text */
  async function handlePendingFactEdit(text) {
    if (!pendingFactEdit) return false;
    const pending = pendingFactEdit;
    if (pending.mode === "prompt") {
      return applyEditedFact({ key: "prompt", category: "Goal", affectsPaths: true, field: null, step: null, id: CONVO_PROMPT_ID }, text);
    }
    if (pending.key === "location") {
      return applyEditedFact(
        { key: "location", category: "Location", affectsPaths: true, field: null, step: null, id: "convo-fact-location" },
        text,
        { display: text }
      );
    }
    const def = intakeFactDefForId(`${pending.key === "name" ? "convo-fact-name" : `convo-fact-${pending.key}`}`);
    if (!def) {
      clearPendingFactEdit();
      return false;
    }
    if (pending.mode === "chips") {
      const founder = isFounderOrProjectPrompt(
        appStore.journey.messages.find((turn) => turn.role === "user")?.content || ""
      );
      const spec = getChipStep(def.step || "", { founder });
      const match = spec?.options?.find(
        (option) =>
          option.label.toLowerCase() === text.toLowerCase() ||
          option.value.toLowerCase() === text.toLowerCase()
      );
      if (match) return applyEditedFact(def, match.value, { display: match.label });
    }
    return applyEditedFact(def, text, { display: text });
  }

  function reflectIntakeFact(node) {
    const host = document.getElementById("messages-tail") || messagesEl;
    if (!host || !node) return;
    let note = document.getElementById("map-focus-note");
    if (!note) {
      note = document.createElement("article");
      note.id = "map-focus-note";
      note.className = "v2-map-focus v2-text-box v2-text-box--chrome";
      host.appendChild(note);
    }
    const def = intakeFactDefForId(node.id);
    const editable = node.id === CONVO_PROMPT_ID || Boolean(def);
    const category =
      node.id === CONVO_PROMPT_ID ? "Goal" : def?.category || node.label || "Detail";
    note.innerHTML = `
      <p class="v2-map-focus__kicker">What I know</p>
      <h3>${escapeHtml(category)}</h3>
      <p>${escapeHtml(node.title || node.label || "")}</p>
      ${
        editable
          ? `<div class="v2-map-focus__actions"><button type="button" data-edit-fact="${escapeHtml(node.id)}">Edit this answer</button></div>`
          : ""
      }`;
    note.querySelector("[data-edit-fact]")?.addEventListener("click", () => {
      beginIntakeFactEdit(node.id);
    });
    scrollFrameChildIntoView(note);
  }

  function renderPathCards() {
    pathMap.render();
  }

  function showSelectedPath(node, { generating = false, scroll = true, keepGate = true } = {}) {
    const displayTitle = node.title || node.label;
    if (selectionPanel) {
      selectionPanel.classList.remove("hidden");
      const meta = [node.cost, node.timeline, node.income].filter(Boolean);
      const gateHost = selectionPanel.querySelector("#selection-gate-host");
      const existingGate = gateHost?.querySelector("#v2-confirm-gate") || null;
      selectionPanel.innerHTML = `
        <h2 class="v2-section-label">Selected path</h2>
        ${node.ideaType ? `<p class="v2-selection__type">${escapeHtml(node.ideaType)}</p>` : ""}
        <h3 class="v2-selection__title">${escapeHtml(displayTitle)}</h3>
        ${node.tagline || node.description ? `<p class="v2-selection__tagline">${escapeHtml(node.tagline || node.description || "")}</p>` : ""}
        ${meta.length ? `<p class="v2-selection-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>` : ""}
        ${node.why ? `<p class="v2-selection__why">${escapeHtml(node.why)}</p>` : ""}
        <p class="v2-status${generating ? "" : " hidden"}" id="selection-status" role="status" aria-live="polite"></p>
        <div id="selection-gate-host"></div>
      `;
      if (generating) {
        setStatusMessage(selectionPanel.querySelector("#selection-status"), "Generating this path");
      }
      if (existingGate && keepGate) {
        selectionPanel.querySelector("#selection-gate-host")?.appendChild(existingGate);
      }
      if (scroll) scrollFrameChildIntoView(selectionPanel);
    }
    if (activePathEl) {
      activePathEl.innerHTML = `<strong>${escapeHtml(displayTitle)}</strong>${appStore.journey.planConfirmed ? "Plan confirmed — missions next." : "Confirm this plan in chat, or discuss / alter below."}`;
    }
  }

  function applyPathsToMap() {
    mapEl?.syncLiveFromStore();
    setPhase(appStore.journey.selectedPathId ? PHASE.PATH_SELECTED : PHASE.POSSIBILITIES);
    const selectedPathId = appStore.journey.selectedPathId || null;
    const selected =
      (selectedPathId &&
        listedPathNodes().find((node) => node.id === selectedPathId && node.id !== CONVO_PROMPT_ID)) ||
      null;
    if (selected) {
      showSelectedPath(selected, { scroll: false });
    } else if (!appStore.journey.selectedPathId) {
      selectionPanel?.classList.add("hidden");
      if (activePathEl) {
        activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
      }
      confirmGate.hide();
    }
    renderPathCards();
    layout();
  }

  const pathMap = createPathMapController({
    messagesEl,
    pathCardsEl,
    mapEl,
    layout,
    flush: flushPersist,
    setComposerEnabled,
    setPhasePossibilities: applyPathsToMap,
    onSelectPath: (id, options) => handleNodeSelect(id, options),
    onShowChat: () => {
      layout();
      scrollFrameChildIntoView(continuationThread(messagesEl), { toEnd: true });
      frameEl?.focusComposer({ glideOnMobile: false });
    },
    onPathsReady: () => {
      refreshConversationMap();
      paintConversationMap({ fit: true });
    }
  });

  const drafts = createDraftsController({
    frameEl: document.getElementById("dynamic-frame"),
    openBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById("drafts-open")),
    flush: flushPersist
  });

  const taskChat = createTaskChatController({
    listRoot: document.getElementById("mission-stages"),
    frameEl,
    layout,
    flush: flushPersist
  });
  taskChat.bindRoot();

  /** Open chat context. Separate from focusMissionId so inspecting a node does not move progress. */
  let chatFocusId = "";

  function resolvedChatFocusId() {
    const preferred = chatFocusId || appStore.journey.focusMissionId || "";
    if (preferred && graphStore.nodes.some((node) => node.id === preferred)) return preferred;
    const progress = appStore.journey.focusMissionId || "";
    if (progress && graphStore.nodes.some((node) => node.id === progress)) return progress;
    return "";
  }

  function markMapCurrent() {
    mapEl?.setCurrentNodes?.(
      highlightIdsForChatFocus(resolvedChatFocusId(), graphStore.nodes, appStore.journey.focusMissionId || "")
    );
  }

  /** @param {import("../graph-store.js").GraphNode | undefined} missionNode */
  function markMissionStage(missionNode) {
    if (!missionNode) return;
    const index = Number.isInteger(missionNode.chainIndex)
      ? missionNode.chainIndex
      : Number(String(missionNode.id).replace("milestone-", "")) || 0;
    document.getElementById(`stage-${index}`)?.classList.add("is-open-context");
  }

  /** @param {string} taskId */
  function markTaskCard(taskId) {
    if (!taskId) return;
    document
      .querySelector(`#mission-stages [data-mission-id="${CSS.escape(taskId)}"]`)
      ?.classList.add("is-open-context");
  }

  function paintOpenContext(id) {
    document.querySelectorAll(".is-open-context").forEach((el) => el.classList.remove("is-open-context"));
    if (!id) return;
    const node = graphStore.nodes.find((entry) => entry.id === id);
    if (node?.type === "task") {
      markTaskCard(node.id);
      const mission = graphStore.nodes.find((entry) => entry.id === node.parentId && entry.type === "mission");
      markMissionStage(mission);
      return;
    }
    if (node?.type === "mission") {
      markMissionStage(node);
      const progressId = appStore.journey.focusMissionId || "";
      const task = graphStore.nodes.find(
        (entry) => entry.type === "task" && entry.id === progressId && entry.parentId === node.id
      );
      if (task) markTaskCard(task.id);
      return;
    }
    if (node?.type === "path") {
      document
        .querySelector(`.v2-path-card[data-path-id="${CSS.escape(node.id)}"]`)
        ?.classList.add("is-open-context");
      selectionPanel?.classList.add("is-open-context");
    }
  }

  /** Scroll the chat to the roadmap card that matches this path node. */
  function scrollChatToRoadmap(node) {
    if (!node || node.type !== "path") return;
    paintOpenContext(node.id);
    document.getElementById("possibilities")?.classList.remove("hidden");
    const card = document.querySelector(`.v2-path-card[data-path-id="${CSS.escape(node.id)}"]`);
    if (card) {
      scrollFrameChildIntoView(card);
      return;
    }
    if (selectionPanel && !selectionPanel.classList.contains("hidden")) {
      scrollFrameChildIntoView(selectionPanel);
    }
  }

  /** Mark the clicked task on the timeline without moving the Now stop. */
  function markTimelineOpen(taskId) {
    const host = document.getElementById("map-timeline");
    if (!host) return;
    if (taskId) host.dataset.openTaskId = taskId;
    else delete host.dataset.openTaskId;
    host.querySelectorAll("[data-timeline-id]").forEach((item) => {
      item.classList.toggle("is-open", Boolean(taskId) && item.getAttribute("data-timeline-id") === taskId);
    });
  }

  /** Temporary chat mark for the hovered task. Does not clear the open mission or task. */
  function paintHoverContext(id) {
    document.querySelectorAll(".is-hover-context").forEach((el) => el.classList.remove("is-hover-context"));
    const targetId = hoverChatTargetId(graphStore.nodes.find((entry) => entry.id === id));
    if (!targetId) return;
    document
      .querySelector(`#mission-stages [data-mission-id="${CSS.escape(targetId)}"]`)
      ?.classList.add("is-hover-context");
  }

  /**
   * Open the mission stage or task card that belongs to this node.
   * Progress (focusMissionId, completion) and the active roadmap stay as they are.
   * @param {import("../graph-store.js").GraphNode} node
   */
  function openWorkingContext(node) {
    const progressFocus = appStore.journey.focusMissionId;
    const activePath = appStore.journey.roadmapPathId;
    const confirmed = appStore.journey.planConfirmed;
    chatFocusId = node.id;
    mapEl?.setFocusedNode(null);
    markMapCurrent();
    document.getElementById("map-focus-note")?.remove();
    if (node.type === "mission") {
      taskChat.closeOpen({ restoreFocus: false });
      paintOpenContext(node.id);
      markTimelineOpen("");
      const index = Number.isInteger(node.chainIndex)
        ? node.chainIndex
        : Number(String(node.id).replace("milestone-", "")) || 0;
      const stage = document.getElementById(`stage-${index}`);
      if (stage) scrollFrameChildIntoView(stage);
      else {
        const missionsEl = document.getElementById("missions");
        if (missionsEl) scrollFrameChildIntoView(missionsEl);
      }
    } else {
      paintOpenContext(node.id);
      markTimelineOpen(node.id);
      taskChat.open(node.id);
      const card = document.getElementById(`mission-${node.id}`);
      if (card) scrollFrameChildIntoView(card);
    }
    appStore.journey.focusMissionId = progressFocus;
    appStore.journey.roadmapPathId = activePath;
    appStore.journey.planConfirmed = confirmed;
  }

  let shownBranchKey = "";
  /** Everything that places a node on the branch; done state is left out on purpose. */
  function roadmapBranchKey(pathId, stages) {
    return JSON.stringify([pathId, stages.map((stage) => [stage.label, (stage.missions || []).map((m) => [m.id, m.title])])]);
  }

  const missions = createMissionsController({
    sectionEl: document.getElementById("missions"),
    listEl: document.getElementById("mission-stages"),
    messagesEl,
    layout,
    flush: flushPersist,
    onRendered: () => taskChat.afterMissionRender(),
    onShown: (stages) => {
      drafts.sync(stages);
      setSpineAlternatePaths(Boolean(stages?.length));
      syncExploreOptions();
      const pathId = appStore.journey.roadmapPathId;
      if (stages?.length && pathId) {
        /* Ticking a task redraws the same branch. The phone map keeps its zoom and position for that. */
        const branchKey = roadmapBranchKey(pathId, stages);
        const sameBranch = branchKey === shownBranchKey;
        shownBranchKey = branchKey;
        const redraw = () => {
          showRoadmapBranch(pathId, stages);
          const keep = mapEl?._selectedId;
          mapEl?.syncLiveFromStore();
          const still = keep && graphStore.nodes.some((node) => node.id === keep);
          mapEl?.setSelectedNode(still ? keep : pathId);
          if (!sameBranch) mapEl?.syncRoadmapBranchFit?.({ animate: false });
        };
        if (sameBranch && mapEl?.holdCamera) mapEl.holdCamera(redraw);
        else redraw();
        markMapCurrent();
        paintOpenContext(resolvedChatFocusId());
      } else if (!stages?.length) {
        shownBranchKey = "";
        restorePossibilityMap();
        mapEl?.syncLiveFromStore();
      }
    }
  });

  document.addEventListener("mission-focus", (event) => {
    const id =
      event instanceof CustomEvent && typeof event.detail?.id === "string"
        ? event.detail.id
        : appStore.journey.focusMissionId || "";
    if (id) chatFocusId = id;
    markMapCurrent();
    paintOpenContext(id);
  });

  const confirmGate = createConfirmGateController({
    messagesEl,
    panelEl: selectionPanel,
    layout,
    flush: flushPersist,
    setComposerEnabled,
    setPhase,
    renderDetail: (node, options) => showSelectedPath(node, options),
    onConfirmed: (_idea, bullets) => {
      const selected =
        graphStore.nodes.find((node) => node.id === appStore.journey.selectedPathId) || null;
      if (selected && selected.type !== "start") showSelectedPath(selected, { scroll: false });
      offerUnchosenRoadmaps(selected?.id || "");
      layout();
      void missions.begin(selected, bullets);
    }
  });

  const intake = createIntakeController({
    messagesEl,
    layout,
    flush: flushPersist,
    setComposerEnabled,
    onProgress: () => refreshConversationMap(),
    onComplete: async () => {
      if (appStore.journey.phase === PHASE.EXPLORING) setPhase(PHASE.COACHING);
      if (!appStore.journey.pathsGenerated) await pathMap.generate();
    }
  });

  /** @param {string} nodeId @param {{ startConfirm?: boolean, openRoadmap?: boolean }} [options] */
  function handleNodeSelect(nodeId, { startConfirm = true, openRoadmap = false } = {}) {
    const node =
      graphStore.nodes.find((n) => n.id === nodeId) ||
      listedPathNodes().find((n) => n.id === nodeId) ||
      null;
    if (!node || node.type === "start" || node.type === "goal") return;
    if (node.id === CONVO_PROMPT_ID || isIntakeFactId(nodeId) || String(nodeId).startsWith("convo-phase-")) {
      mapEl?.setFocusedNode(nodeId);
      mapEl?.setSelectedNode?.(nodeId);
      if (isIntakeFactId(nodeId) || node.id === CONVO_PROMPT_ID) reflectIntakeFact(node);
      else reflectNodeInChat(node);
      return;
    }
    if (node.type === "more") {
      missions.confirmExtend();
      return;
    }
    if (node.type === "action") {
      if (node.id === "option-settings") {
        document.getElementById("nav-settings")?.click();
        return;
      }
      if (node.id === "option-analytics") {
        document.getElementById("nav-analytics")?.click();
        return;
      }
      mapEl?.setFocusedNode(nodeId);
      showSpokePanel(node);
      return;
    }
    const decision = resolveMapNodeActivation(
      node,
      {
        planConfirmed: appStore.journey.planConfirmed,
        roadmapPathId: appStore.journey.roadmapPathId,
        focusMissionId: appStore.journey.focusMissionId,
        chatFocusId: resolvedChatFocusId(),
        nodes: graphStore.nodes
      },
      { openRoadmap }
    );
    if (decision.action === "preview-alternate") {
      mapEl?.setFocusedNode(nodeId);
      showAlternatePath(node);
      reflectNodeInChat(node);
      markMapCurrent();
      scrollChatToRoadmap(node);
      return;
    }
    if (decision.action === "show-active-roadmap") {
      mapEl?.setFocusedNode(null);
      showSelectedPath(node, { scroll: false, keepGate: true });
      reflectNodeInChat(node);
      markMapCurrent();
      scrollChatToRoadmap(node);
      return;
    }
    if (decision.action === "open-working-context") {
      openWorkingContext(node);
      return;
    }
    const switching = Boolean(appStore.journey.roadmapPathId && appStore.journey.roadmapPathId !== nodeId);
    if (switching && appStore.journey.missionsStages?.length) saveRoadmapCopy();
    if (appStore.journey.selectedPathId && appStore.journey.selectedPathId !== nodeId) clearPathThread();
    if (switching) missions.clear();
    selectGraphNode(nodeId);
    mapEl?.setSelectedNode(nodeId);
    appStore.journey.selectedPathId = nodeId;
    if (startConfirm) appStore.journey.planConfirmed = false;
    setPhase(PHASE.PATH_SELECTED);
    showSelectedPath(node, { generating: startConfirm, keepGate: !switching, scroll: false });
    reflectNodeInChat(node);
    renderPathCards();
    layout();
    scrollChatToRoadmap(node);
    settleFrameAfterPathsReady();
    revealMapForSelectedRoadmap();
    if (startConfirm) void confirmGate.begin(node);
    else confirmGate.hide();
  }

  /** Settings, Notes, and Roadmaps spokes each rewrite the panel above the missions. */
  function showSpokePanel(node) {
    if (!selectionPanel) return;
    selectionPanel.classList.remove("hidden");
    const label = node.title || node.label || "Map";
    let body = "";
    if (node.id === "option-settings") {
      const place = formatUserLocation(appStore.location) || "Not set yet";
      const saved = (appStore.journey.savedPathIds || [])
        .map((pathId) => graphStore.nodes.find((entry) => entry.id === pathId))
        .filter(Boolean)
        .map((path) => path.title || path.label);
      body = `
        <p class="v2-selection__tagline">Location: ${escapeHtml(place)}</p>
        <p class="v2-selection__why">${saved.length ? `Saved maps: ${escapeHtml(saved.join(", "))}` : "No maps saved for later yet."}</p>
        <p class="v2-selection__why">Maps stay on this device until you sign in.</p>`;
    } else if (node.id === "option-notes") {
      const notes = appStore.journey.missionDrafts || [];
      body = notes.length
        ? notes
            .slice(0, 6)
            .map(
              (draft) =>
                `<p class="v2-selection__why"><strong>${escapeHtml(draft.label || "Note")}</strong> — ${escapeHtml(draft.missionTitle || "")}<br>${escapeHtml(draft.body)}</p>`
            )
            .join("")
        : `<p class="v2-selection__why">No notes yet. Open a notes sheet on a mission and it will show up here.</p>`;
    } else {
      const paths = graphStore.nodes.filter((entry) => entry.type === "path");
      body = paths
        .map((path) => {
          const mark = path.id === appStore.journey.roadmapPathId ? "On now — " : "";
          return `<p class="v2-selection__why">${escapeHtml(mark + (path.title || path.label || "My Paths"))}</p>`;
        })
        .join("");
      document.getElementById("possibilities")?.classList.remove("hidden");
    }
    selectionPanel.innerHTML = `<h2 class="v2-section-label">${escapeHtml(label)}</h2>${body}`;
    const target =
      node.id === "option-roadmaps"
        ? document.getElementById("path-cards") || selectionPanel
        : selectionPanel;
    scrollFrameChildIntoView(target);
  }

  function describeMapNode(node) {
    const stages = appStore.journey.missionsStages || [];
    if (node.type === "task") {
      for (const stage of stages) {
        const mission = (stage.missions || []).find((item) => item.id === node.id);
        if (mission) {
          return {
            title: mission.title,
            body: [stage.label, mission.text || mission.askDo].filter(Boolean).join(" — "),
            workId: mission.id
          };
        }
      }
    }
    if (node.type === "mission") {
      const stage =
        stages.find((item) => item.label === (node.title || node.label)) ||
        stages[Number(String(node.id).replace("milestone-", ""))];
      const firstTask = graphStore.nodes.find((entry) => entry.type === "task" && entry.parentId === node.id);
      return {
        title: stage?.label || node.title || node.label || "Mission",
        body: stage?.desc || (stage?.missions || []).map((item) => item.title).filter(Boolean).join(" · "),
        workId: firstTask?.id || ""
      };
    }
    return {
      title: node.title || node.label || "My Paths",
      body: node.tagline || node.description || node.why || "",
      workId: ""
    };
  }

  /** The chat shows the node the user clicked. Switching a roadmap still takes the button. */
  function reflectNodeInChat(node) {
    const host = document.getElementById("messages-tail") || messagesEl;
    if (!host || !node) return;
    let note = document.getElementById("map-focus-note");
    if (!note) {
      note = document.createElement("article");
      note.id = "map-focus-note";
      note.className = "v2-map-focus v2-text-box v2-text-box--chrome";
      host.appendChild(note);
    }
    const info = describeMapNode(node);
    const here =
      node.id === appStore.journey.focusMissionId ||
      (node.type === "path" && node.id === appStore.journey.roadmapPathId) ||
      (node.type === "mission" && info.workId && info.workId === appStore.journey.focusMissionId);
    const saved = (appStore.journey.savedPathIds || []).includes(node.id);
    const canSwitch =
      node.type === "path" && appStore.journey.planConfirmed && node.id !== appStore.journey.roadmapPathId;
    const actions = [];
    if (canSwitch) {
      actions.push(
        `<button type="button" data-map-save-path="${escapeHtml(node.id)}">${saved ? "Saved" : "Save this path"}</button>`
      );
      actions.push(`<button type="button" data-map-use-path="${escapeHtml(node.id)}">Use this path</button>`);
    }
    if (!here && info.workId && info.workId !== appStore.journey.focusMissionId) {
      actions.push(`<button type="button" data-map-work="${escapeHtml(info.workId)}">Work on this step</button>`);
    }
    note.innerHTML = `
      <p class="v2-map-focus__kicker">${here ? "Where you are" : "On the map"}</p>
      <h3>${escapeHtml(info.title)}</h3>
      ${info.body ? `<p>${escapeHtml(info.body)}</p>` : ""}
      ${actions.length ? `<div class="v2-map-focus__actions">${actions.join("")}</div>` : ""}`;
    note.querySelector("[data-map-use-path]")?.addEventListener("click", () => {
      handleNodeSelect(node.id, { startConfirm: true, openRoadmap: true });
    });
    note.querySelector("[data-map-save-path]")?.addEventListener("click", (event) => {
      toggleSavedPath(appStore.journey, node.id);
      touchJourney();
      flushPersist();
      const button = event.currentTarget;
      if (button instanceof HTMLElement) button.textContent = "Saved";
      missions.refresh();
    });
    note.querySelector("[data-map-work]")?.addEventListener("click", (event) => {
      const id = event.currentTarget instanceof Element ? event.currentTarget.getAttribute("data-map-work") : "";
      if (!id) return;
      missions.focus(id);
      markMapCurrent();
      reflectNodeInChat(graphStore.nodes.find((entry) => entry.id === id) || node);
    });
    if (node.type !== "path") scrollFrameChildIntoView(note);
  }

  /** After a roadmap is chosen, the others stay available to save. */
  function offerUnchosenRoadmaps(chosenId) {
    const host = document.getElementById("messages-tail") || messagesEl;
    const others = graphStore.nodes.filter((node) => node.type === "path" && node.id !== chosenId);
    if (!host || !others.length) return;
    let note = document.getElementById("map-save-others");
    if (!note) {
      note = document.createElement("article");
      note.id = "map-save-others";
      note.className = "v2-map-focus v2-text-box v2-text-box--chrome";
      host.appendChild(note);
    }
    const saved = new Set(appStore.journey.savedPathIds || []);
    note.innerHTML = `
      <p class="v2-map-focus__kicker">Other paths</p>
      <p>These stay on the map. Save any you might want later. Opening one takes the button on that path.</p>
      <div class="v2-map-focus__actions">
        ${others
          .map(
            (node) =>
              `<button type="button" data-save-other="${escapeHtml(node.id)}">${saved.has(node.id) ? "Saved" : "Save"} ${escapeHtml(node.title || node.label || "path")}</button>`
          )
          .join("")}
      </div>`;
    note.querySelectorAll("[data-save-other]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-save-other") || "";
        if (!id || saved.has(id)) return;
        toggleSavedPath(appStore.journey, id);
        saved.add(id);
        touchJourney();
        flushPersist();
        button.textContent = `Saved ${button.textContent.replace(/^Save\s+/, "")}`;
        missions.refresh();
      });
    });
  }

  /** Grey roadmap: show its card and let the user open it or save it. */
  function showAlternatePath(node) {
    if (!selectionPanel) return;
    selectionPanel.classList.remove("hidden");
    const saved = (appStore.journey.savedPathIds || []).includes(node.id);
    const meta = [node.cost, node.timeline, node.income].filter(Boolean);
    selectionPanel.innerHTML = `
      <h2 class="v2-section-label">Other path</h2>
      <h3 class="v2-selection__title">${escapeHtml(node.title || node.label || "My Paths")}</h3>
      ${node.tagline || node.description ? `<p class="v2-selection__tagline">${escapeHtml(node.tagline || node.description || "")}</p>` : ""}
      ${meta.length ? `<p class="v2-selection-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>` : ""}
      ${node.why ? `<p class="v2-selection__why">${escapeHtml(node.why)}</p>` : ""}
      <div class="v2-next-path__actions">
        <label class="v2-next-path__save">
          <input type="checkbox" data-focus-save="1" ${saved ? "checked" : ""} />
          Save map for later.
        </label>
        <button type="button" class="v2-next-path__open" data-focus-open="1">Open this path</button>
      </div>`;
    selectionPanel.querySelector("[data-focus-save]")?.addEventListener("change", () => {
      toggleSavedPath(appStore.journey, node.id);
      touchJourney();
      flushPersist();
      missions.refresh();
    });
    selectionPanel.querySelector("[data-focus-open]")?.addEventListener("click", () => {
      handleNodeSelect(node.id, { startConfirm: true, openRoadmap: true });
    });
    scrollFrameChildIntoView(selectionPanel);
  }

  function clearPathThread() {
    const tail = document.getElementById("messages-tail");
    if (tail) tail.innerHTML = "";
    const breakAt = appStore.journey.threadBreak;
    if (Number.isInteger(breakAt)) appStore.journey.messages = appStore.journey.messages.slice(0, breakAt);
  }

  function seedHypotheticalChat() {
    if (!messagesEl) return;

    ensureJourneyStarted(appStore.journey);
    for (const turn of DEMO_CHAT) {
      appendMessage(messagesEl, turn.role, turn.content);
      appStore.journey.messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.content
      });
    }

    appStore.journey.turnCount = 3;
    appStore.journey.ghostDismissed = true;
    appStore.journey.intakeComplete = true;
    mapEl?.dismissGhost();
    setPhase(PHASE.COACHING);
    layout();
    void pathMap.generate();
  }

  function restoreSessionUi() {
    if (!messagesEl) return false;
    const journey = appStore.journey;
    if (!journey.messages.length) return false;

    const breakAt = Number.isInteger(journey.threadBreak) ? journey.threadBreak : journey.messages.length;
    const tailEl = document.getElementById("messages-tail");
    journey.messages.slice(0, breakAt).forEach((turn) => {
      appendMessage(messagesEl, turn.role === "user" ? "user" : "advisor", turn.content, { skipScroll: true });
    });
    journey.messages.slice(breakAt).forEach((turn) => {
      appendMessage(tailEl || messagesEl, turn.role === "user" ? "user" : "advisor", turn.content, { skipScroll: true });
    });

    if (journey.ghostDismissed) {
      mapEl?.dismissGhost({ instant: true });
    }

    const hasPaths = listedPathNodes().length > 0 || graphStore.nodes.some((node) => node.type === "path");
    if (journey.mapPromptLabel && !journey.planConfirmed) {
      paintConversationMap({ fit: true });
      if (hasPaths) renderPathCards();
    } else if (hasPaths) {
      mapEl?.syncLiveFromStore();
      renderPathCards();
    }

    const selected =
      listedPathNodes().find((node) => node.id === (journey.selectedPathId || "")) ||
      graphStore.nodes.find((node) => node.id === (journey.selectedPathId || graphStore.selectedId)) ||
      null;
    if (selected && selected.type === "path" && selected.id !== CONVO_PROMPT_ID) {
      selectGraphNode(selected.id);
      mapEl?.setSelectedNode(selected.id);
      showSelectedPath(selected, { scroll: false });
    } else if (hasPaths && !journey.mapPromptLabel && activePathEl) {
      activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
    }

    setPhase(journey.phase, { animate: false, instant: true });
    intake.restoreChips();
    if (hasPaths) pathMap.restore();
    if (selected && selected.type === "path" && selected.id !== CONVO_PROMPT_ID) confirmGate.restore(selected);
    if (journey.planConfirmed) missions.restore();
    else refreshConversationMap();
    layout();
    const endEl = journey.planConfirmed
      ? document.getElementById("missions")
      : tailEl?.childElementCount
        ? tailEl
        : null;
    if (endEl) scrollFrameChildIntoView(endEl, { toEnd: !journey.planConfirmed });
    return true;
  }

  let newMapResetInFlight = false;

  function reloadWithoutDemo() {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.location.assign(`${url.pathname}${url.hash}`);
  }

  function startNewJourney() {
    cancelPendingComposerDraftSave();
    clearComposerDraft();
    shelveGuestMap();
    openFreshAccountRoadmap();
    setPersistEnabled(true);
    clearGuestJourney();
    resetAppStore();
    reloadWithoutDemo();
  }

  /** @param {string} roadmapId */
  function openRoadmapFromList(roadmapId) {
    if (newMapResetInFlight) return;
    cancelPendingComposerDraftSave();
    if (!openSavedRoadmap(roadmapId)) return;
    newMapResetInFlight = true;
    reloadWithoutDemo();
  }

  async function requestStartNewJourney(trigger) {
    if (newMapResetInFlight) return;
    const composerText = frameEl?.composerInput?.value ?? "";
    const hasWork = journeyHasActiveWork(appStore.journey, graphStore, {
      composerText,
      includeStoredDraft: false
    });
    if (hasWork) {
      const confirmed = await confirmStartNewMap({
        message: newMapConfirmMessage(readSession(), authState()),
        returnFocus: trigger instanceof HTMLElement ? trigger : null
      });
      if (!confirmed) return;
    }
    newMapResetInFlight = true;
    startNewJourney();
  }

  function goToChatHome() {
    closeActivePageIfOpen();
    frameEl?.scrollChatToTop({ behavior: "smooth" });
  }

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    cancelPendingComposerDraftSave();
    clearComposerDraft();

    ensureJourneyStarted(appStore.journey);
    trackEvent("prompt_submitted");
    dismissGhostMap();
    if (isPreRoadmapCompose()) ensureTypingFullStage();
    setComposerEnabled(false);

    if (pendingFactEdit) {
      const thread = continuationThread(messagesEl);
      appendMessage(thread, "user", trimmed);
      appStore.journey.messages.push({ role: "user", content: trimmed });
      appStore.journey.turnCount += 1;
      touchJourney();
      flushPersist();
      layout();
      try {
        const handled = await handlePendingFactEdit(trimmed);
        if (handled) return;
      } finally {
        setComposerEnabled(true);
      }
    }

    const firstPromptForMap = !appStore.journey.mapPromptLabel;

    if (appStore.journey.phase === PHASE.OPEN) {
      setPhase(PHASE.EXPLORING);
    }

    const thread = continuationThread(messagesEl);
    appendMessage(thread, "user", trimmed);
    layout();
    appStore.journey.messages.push({ role: "user", content: trimmed });
    appStore.journey.turnCount += 1;
    const briefRefresh = refreshGoalBrief(appStore.journey, appStore.profile, appStore.location, {
      latestUserText: trimmed
    });
    appStore.profile = briefRefresh.profile;
    if (firstPromptForMap && !appStore.journey.planConfirmed) {
      resetMapForFirstPrompt(trimmed);
    } else {
      refreshConversationMap();
    }
    touchJourney();
    flushPersist();

    try {
      if (intake.isBlocking()) {
        const handled = await intake.handleTypedAnswer(trimmed);
        if (handled) {
          refreshConversationMap();
          return;
        }
      }

      if (pathMap.isBlocking()) {
        const handled = await pathMap.handleTypedAnswer(trimmed);
        if (handled) return;
      }

      if (confirmGate.isBlocking()) {
        const idea =
          listedPathNodes().find((node) => node.id === appStore.journey.selectedPathId) ||
          graphStore.nodes.find((node) => node.id === appStore.journey.selectedPathId) ||
          null;
        const handled = await confirmGate.handleTypedAnswer(trimmed, idea);
        if (handled) return;
      }

      if (!appStore.journey.intakeComplete && !appStore.journey.pathMode) {
        intake.startAfterFirstPrompt();
        refreshConversationMap();
        return;
      }

      const typingEl = appendMessage(thread, "advisor", "…", { typing: true });
      layout();

      try {
        const reply = await callAdvisor(
          buildExplorationPrompt(
            appStore.journey.messages,
            buildSharedPromptContext({
              journey: appStore.journey,
              profile: appStore.profile,
              location: appStore.location
            })
          ),
          {
            maxTokens: 450,
            feature: "v2_exploration"
          }
        );
        typingEl.remove();
        const finalText = reply || "I'm here — tell me a bit more about what you're hoping changes.";
        appendMessage(thread, "advisor", finalText);
        layout();
        appStore.journey.messages.push({ role: "assistant", content: finalText });
        touchJourney();
        flushPersist();

        if (appStore.journey.turnCount >= 2 && appStore.journey.phase === PHASE.EXPLORING) {
          setPhase(PHASE.COACHING);
        }
        if (
          appStore.journey.intakeComplete &&
          appStore.journey.turnCount >= PATHS_READY_TURN &&
          appStore.journey.phase === PHASE.COACHING &&
          !appStore.journey.pathsGenerated
        ) {
          await pathMap.generate();
        }
      } catch (error) {
        typingEl.remove();
        appendMessage(
          thread,
          "advisor",
          `I couldn't reach the advisor right now (${error?.message || "unknown error"}). Check your connection or OpenRouter balance.`
        );
        layout();
        flushPersist();
      }
    } finally {
      setComposerEnabled(true);
      if (window.matchMedia("(max-width: 900px)").matches) {
        frameEl?.composerInput?.blur();
      } else {
        frameEl?.focusComposer();
      }
    }
  }

  let difficultyTicket = 0;

  async function startDifficulty(missionId) {
    const stages = appStore.journey.missionsStages || [];
    let found = null;
    let stageLabel = "";
    for (const stage of stages) {
      const mission = stage.missions?.find((item) => item.id === missionId);
      if (mission) {
        found = mission;
        stageLabel = stage.label || "";
        break;
      }
    }
    if (!found) return;

    const thread = continuationThread(messagesEl);
    const ask = `I'm having difficulties with “${found.title}”. Help me make it smaller.`;
    appendMessage(thread, "user", ask);
    appStore.journey.messages.push({ role: "user", content: ask });
    touchJourney();
    flushPersist();
    layout();

    const ticket = ++difficultyTicket;
    const typingEl = appendMessage(thread, "advisor", "…", { typing: true });
    let update = null;
    let spoken = "";
    try {
      const raw = await callAdvisor(buildDifficultyPrompt(found, stageLabel), {
        maxTokens: 500,
        feature: "v2_difficulty"
      });
      update = parseDifficultyUpdate(raw) || fallbackDifficultyUpdate(found);
      spoken = `${update.title}\n\n${update.description}`;
      if (update.suggested_steps.length) spoken += `\n\n${update.suggested_steps.join("\n")}`;
      if (update.timeline_adjustments) spoken += `\n\n${update.timeline_adjustments}`;
    } catch {
      update = fallbackDifficultyUpdate(found);
      spoken = `${update.title}\n\n${update.description}\n\nI couldn't reach the advisor, so this is a smaller version of the same mission. Apply it, or discard it and keep the original.`;
    }
    if (ticket !== difficultyTicket) return;
    typingEl.remove();
    appendMessage(thread, "advisor", spoken);
    appStore.journey.messages.push({ role: "advisor", content: spoken });
    touchJourney();

    const offer = document.createElement("div");
    offer.className = "v2-difficulty-offer v2-text-box v2-text-box--response";
    offer.innerHTML =
      `<p>Apply this to the path, or discard it. The mission stays as it is until you apply.</p>` +
      `<button type="button" data-apply-difficulty="1">Apply to path</button>` +
      `<button type="button" data-discard-difficulty="1">Discard</button>`;
    thread.appendChild(offer);
    offer.querySelector("[data-apply-difficulty]")?.addEventListener("click", () => {
      pushRoadmapUndo(appStore.journey);
      appStore.journey.missionsStages = applyStructuredMissionUpdate(
        appStore.journey.missionsStages || [],
        missionId,
        update
      );
      touchJourney();
      flushPersist();
      missions.refresh();
      offer.remove();
      appendMessage(thread, "advisor", "Updated that mission on the path.");
      layout();
    });
    offer.querySelector("[data-discard-difficulty]")?.addEventListener("click", () => {
      offer.remove();
      appendMessage(thread, "advisor", "Left the mission as it was.");
      layout();
    });
    layout();
    flushPersist();
  }

  mapEl?.setNodeSelectHandler(handleNodeSelect);
  const missionRoot = document.getElementById("mission-stages");
  const timelineEl = document.getElementById("map-timeline");
  missionRoot?.addEventListener("mission-open-path", (event) => {
    const id = event.detail?.id;
    if (id) handleNodeSelect(id, { startConfirm: true, openRoadmap: true });
  });
  function onMissionFocus(event) {
    const id = event.detail?.id;
    if (!id) return;
    const node = graphStore.nodes.find((item) => item.id === id);
    if (node && (node.type === "task" || node.type === "mission")) {
      openWorkingContext(node);
      return;
    }
    chatFocusId = id;
    markMapCurrent();
    paintOpenContext(id);
    markTimelineOpen(id);
    const card = document.getElementById(`mission-${id}`);
    if (card) scrollFrameChildIntoView(card);
  }
  timelineEl?.addEventListener("mission-focus", onMissionFocus);
  missionRoot?.addEventListener("mission-focus", onMissionFocus);
  function offerTimelineContinuation() {
    const thread = continuationThread(messagesEl);
    if (!thread) return;
    const titles = (appStore.journey.missionsStages || [])
      .flatMap((stage) => stage.missions || [])
      .map((mission) => String(mission.title || "").trim())
      .filter(Boolean);
    const spoken = titles.length
      ? `Continuation missions:\n${titles.map((title) => `• ${title}`).join("\n")}`
      : "Continuation missions will show here as you add them.";
    appendMessage(thread, "advisor", spoken, { skipScroll: true });
    appStore.journey.messages.push({ role: "advisor", content: spoken });
    touchJourney();
    flushPersist();

    const offer = document.createElement("div");
    offer.className = "v2-timeline-continue v2-text-box v2-text-box--response";
    offer.innerHTML =
      `<p>What do you want to do next?</p>` +
      `<button type="button" data-continue="finish">Finish current missions</button>` +
      `<button type="button" data-continue="roadmap">Open another path</button>` +
      `<button type="button" data-continue="save">Save for later</button>`;
    thread.appendChild(offer);
    offer.querySelector("[data-continue=finish]")?.addEventListener("click", () => {
      scrollFrameChildIntoView(document.getElementById("missions"));
    });
    offer.querySelector("[data-continue=roadmap]")?.addEventListener("click", () => {
      const cards = document.getElementById("possibilities");
      if (cards) cards.classList.remove("hidden");
      scrollFrameChildIntoView(cards);
    });
    offer.querySelector("[data-continue=save]")?.addEventListener("click", () => {
      const id = appStore.journey.roadmapPathId || appStore.journey.selectedPathId;
      if (id && !(appStore.journey.savedPathIds || []).includes(id)) {
        toggleSavedPath(appStore.journey, id);
        touchJourney();
        flushPersist();
      }
      appendMessage(thread, "advisor", "Saved this path for later. It stays on this device.");
    });
    layout();
    scrollFrameChildIntoView(offer, { toEnd: true });
  }

  timelineEl?.addEventListener("mission-add", () => {
    offerTimelineContinuation();
  });
  missionRoot?.addEventListener("mission-difficulty", (event) => {
    const id = event.detail?.id;
    if (id) startDifficulty(id);
  });
  mapEl?.setPromptEmptyChecker(() => !frameEl?.composerInput?.value.trim());

  mainEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (document.body.classList.contains("is-frame-dragging") || frameEl?.isDragging?.()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("whatimado-frame")) return;
    if (target.closest(".v2-rail")) return;
    if (target.closest(".whatimado-map__node--live")) return;
    if (target.closest(".whatimado-map__you-btn, .whatimado-map__link-btn, .whatimado-map__help-btn")) return;
    mapEl?.handleGlobalPanPointerDown(event);
  });

  mainEl?.addEventListener(
    "touchstart",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("whatimado-frame")) return;
      if (target.closest(".v2-rail")) return;
      if (target.closest(".whatimado-map__you-btn, .whatimado-map__link-btn, .whatimado-map__help-btn")) return;
      if (target.closest("whatimado-map") || target === mainEl) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  mapEl?.addEventListener("map-node-hover", (event) => {
    const detail = /** @type {CustomEvent<{ nodeId?: string }>} */ (event).detail;
    paintHoverContext(detail?.nodeId || "");
  });

  mapEl?.addEventListener("map-node-select", (event) => {
    const detail = /** @type {CustomEvent<{ nodeId: string, node?: { type?: string }, promptEmpty?: boolean }>} */ (event).detail;
    if (!detail?.nodeId) return;
    const type = detail.node?.type;
    const roadmapOpen = Boolean(appStore.journey.planConfirmed && appStore.journey.roadmapPathId);
    if (
      type === "mission" ||
      type === "more" ||
      type === "action" ||
      type === "path" ||
      (roadmapOpen && type === "task") ||
      !detail.promptEmpty
    ) {
      handleNodeSelect(detail.nodeId);
    }
  });

  frameEl?.composerInput?.addEventListener("input", () => {
    if (!frameEl.composerInput?.value.trim()) return;
    dismissGhostMap();
    if (isPreRoadmapCompose()) ensureTypingFullStage();
  });

  frameEl?.addEventListener("composer-submit", (event) => {
    const detail = /** @type {CustomEvent<{ text: string }>} */ (event).detail;
    void handleSubmit(detail?.text || "");
  });

  frameEl?.addEventListener("frame-drag-start", () => {
    mapEl?.cancelPanFromFrameDrag();
  });

  mapEl?.addEventListener("map-new-roadmap", () => {
    void requestStartNewJourney(mapEl);
  });

  frameEl?.addEventListener("dock-settled", () => {
    mapEl?.lockFromFrame();
    mapEl?.syncSnapCamera({ force: true, animate: true });
  });

  frameEl?.addEventListener("frame-drag-end", () => {
    window.setTimeout(
      () => mapEl?.syncSnapCamera({ force: true, animate: true }),
      MOBILE_MQ.matches ? MOBILE_GLIDE_EASE_MS + 40 : 40
    );
  });

  document.getElementById("nav-home")?.addEventListener("click", () => {
    goToChatHome();
  });

  document.getElementById("nav-new-map")?.addEventListener("click", (event) => {
    void requestStartNewJourney(/** @type {HTMLElement} */ (event.currentTarget));
  });

  bindRoadmapsNav({ onOpen: openRoadmapFromList });
  bindSaveMapButton(/** @type {HTMLButtonElement | null} */ (document.getElementById("missions-save-map")));

  window.addEventListener("resize", () => layout());

  onAuthChange(() => {
    syncExploreOptions();
    const pathId = appStore.journey.roadmapPathId;
    const stages = appStore.journey.missionsStages;
    if (pathId && appStore.journey.planConfirmed && stages?.length) {
      showRoadmapBranch(pathId, stages);
      const keep = mapEl?._selectedId;
      mapEl?.syncLiveFromStore();
      const still = keep && graphStore.nodes.some((node) => node.id === keep);
      mapEl?.setSelectedNode(still ? keep : pathId);
      mapEl?.syncRoadmapBranchFit?.({ animate: false });
      return;
    }
    if (appStore.journey.mapPromptLabel && !appStore.journey.planConfirmed) {
      paintConversationMap();
    }
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (taskChat.handlesEscape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  const restored = !isDemo && restoreGuestJourney() && restoreSessionUi();
  if (!restored) {
    if (!isDemo) applyPrefsToStore(appStore);
    applyPhaseToDom(document, PHASE.OPEN, { ghostDismissed: false });
    const fresh = isDemo ? null : activeAccountRoadmap();
    if (fresh && activePathEl) {
      activePathEl.innerHTML = `<strong>${escapeHtml(fresh.title)}</strong>Start a conversation below.`;
    }
  }

  const MOBILE_LAYOUT_MQ = window.matchMedia("(max-width: 900px)");
  MOBILE_LAYOUT_MQ.addEventListener("change", () => {
    frameEl?.reinitLayoutForViewport();
    if (MOBILE_LAYOUT_MQ.matches) {
      if (document.body.classList.contains("is-mobile-composer-focus")) {
        frameEl?.syncMobileKeyboard();
      } else {
        mapEl?.syncFrameGravity({ animate: false });
        mapEl?.lockFromFrame();
      }
    }
    layout();
  });

  if (MOBILE_LAYOUT_MQ.matches) {
    requestAnimationFrame(() => {
      mapEl?.syncFrameGravity({ animate: false });
      mapEl?.lockFromFrame();
    });
  }

  if (isDemo) {
    requestAnimationFrame(() => seedHypotheticalChat());
  }

  if (!isDemo) {
    frameEl?.restoreComposerDraft();
  }

  if (!MOBILE_LAYOUT_MQ.matches) {
    frameEl?.focusComposer();
  }

  return {
    store: appStore,
    handleSubmit,
    handleNodeSelect,
    startNewJourney,
    requestStartNewJourney,
    goToChatHome,
    journeyHasActiveWork: (opts) => journeyHasActiveWork(appStore.journey, graphStore, opts)
  };
}
