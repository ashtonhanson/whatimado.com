import { PHASE, applyPhaseToDom } from "../phases.js";
import { graphStore, restorePossibilityMap, selectGraphNode, setExtraExploreOptions, setSpineAlternatePaths, showRoadmapBranch } from "../graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "../advisor.js";
import { appendMessage, continuationThread, escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { notifyFrameLayout } from "../layout/notify-frame-layout.js";
import { MOBILE_GLIDE_EASE_MS, MOBILE_MQ } from "../dock/constants.js";
import { appStore, resetAppStore, touchJourney } from "../state/store.js";
import { buildSharedPromptContext, refreshGoalBrief } from "../state/goal-brief.js";
import { ensureJourneyStarted, toggleSavedPath } from "../state/journey.js";
import { formatUserLocation } from "../state/location.js";
import { applyPrefsToStore } from "../state/prefs.js";
import { trackEvent } from "../state/analytics.js";
import {
  activeAccountRoadmap,
  bindPersistLifecycle,
  clearGuestJourney,
  flushPersist,
  openFreshAccountRoadmap,
  restoreGuestJourney,
  schedulePersist,
  setPersistEnabled
} from "../state/persistence.js";
import {
  bindComposerDraftLifecycle,
  cancelPendingComposerDraftSave,
  clearComposerDraft
} from "../state/composer-draft.js";
import { authState, onAuthChange } from "../state/auth.js";
import { isFounderUser } from "../state/cloud-config.js";
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
        setStatusMessage(selectionPanel.querySelector("#selection-status"), "Generating this roadmap");
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
    const selected =
      graphStore.nodes.find((node) => node.id === (appStore.journey.selectedPathId || graphStore.selectedId)) || null;
    if (selected && selected.type !== "start") {
      showSelectedPath(selected, { scroll: false });
    } else {
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
      setExtraExploreOptions(isFounderUser(authState().user) ? [{ id: "option-analytics", label: "Analytics" }] : []);
      const pathId = appStore.journey.roadmapPathId;
      if (stages?.length && pathId) {
        showRoadmapBranch(pathId, stages);
        const keep = mapEl?._selectedId;
        mapEl?.syncLiveFromStore();
        const still = keep && graphStore.nodes.some((node) => node.id === keep);
        mapEl?.setSelectedNode(still ? keep : pathId);
        mapEl?.syncRoadmapBranchFit?.({ animate: false });
        markMapCurrent();
        paintOpenContext(resolvedChatFocusId());
      } else if (!stages?.length) {
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
    onComplete: async () => {
      if (appStore.journey.phase === PHASE.EXPLORING) setPhase(PHASE.COACHING);
      if (!appStore.journey.pathsGenerated) await pathMap.generate();
    }
  });

  /** @param {string} nodeId @param {{ startConfirm?: boolean, openRoadmap?: boolean }} [options] */
  function handleNodeSelect(nodeId, { startConfirm = true, openRoadmap = false } = {}) {
    const node = graphStore.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === "start") return;
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
      return;
    }
    if (decision.action === "show-active-roadmap") {
      mapEl?.setFocusedNode(null);
      showSelectedPath(node, { scroll: true, keepGate: true });
      reflectNodeInChat(node);
      markMapCurrent();
      const missionsEl = document.getElementById("missions");
      if (missionsEl && !missionsEl.classList.contains("hidden")) scrollFrameChildIntoView(missionsEl);
      return;
    }
    if (decision.action === "open-working-context") {
      openWorkingContext(node);
      return;
    }
    const switching = Boolean(appStore.journey.roadmapPathId && appStore.journey.roadmapPathId !== nodeId);
    if (appStore.journey.selectedPathId && appStore.journey.selectedPathId !== nodeId) clearPathThread();
    if (switching) missions.clear();
    selectGraphNode(nodeId);
    mapEl?.setSelectedNode(nodeId);
    appStore.journey.selectedPathId = nodeId;
    if (startConfirm) appStore.journey.planConfirmed = false;
    setPhase(PHASE.PATH_SELECTED);
    showSelectedPath(node, { generating: startConfirm, keepGate: !switching });
    reflectNodeInChat(node);
    renderPathCards();
    layout();
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
          return `<p class="v2-selection__why">${escapeHtml(mark + (path.title || path.label || "Roadmap"))}</p>`;
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
      title: node.title || node.label || "Roadmap",
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
        `<button type="button" data-map-save-path="${escapeHtml(node.id)}">${saved ? "Saved" : "Save this roadmap"}</button>`
      );
      actions.push(`<button type="button" data-map-use-path="${escapeHtml(node.id)}">Use this roadmap</button>`);
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
    scrollFrameChildIntoView(note);
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
      <p class="v2-map-focus__kicker">Other roadmaps</p>
      <p>These stay on the map. Save any you might want later. Opening one takes the button on that roadmap.</p>
      <div class="v2-map-focus__actions">
        ${others
          .map(
            (node) =>
              `<button type="button" data-save-other="${escapeHtml(node.id)}">${saved.has(node.id) ? "Saved" : "Save"} ${escapeHtml(node.title || node.label || "roadmap")}</button>`
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
      <h2 class="v2-section-label">Other roadmap</h2>
      <h3 class="v2-selection__title">${escapeHtml(node.title || node.label || "Roadmap")}</h3>
      ${node.tagline || node.description ? `<p class="v2-selection__tagline">${escapeHtml(node.tagline || node.description || "")}</p>` : ""}
      ${meta.length ? `<p class="v2-selection-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</p>` : ""}
      ${node.why ? `<p class="v2-selection__why">${escapeHtml(node.why)}</p>` : ""}
      <div class="v2-next-path__actions">
        <label class="v2-next-path__save">
          <input type="checkbox" data-focus-save="1" ${saved ? "checked" : ""} />
          Save map for later.
        </label>
        <button type="button" class="v2-next-path__open" data-focus-open="1">Open this roadmap</button>
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

    const hasPaths = graphStore.nodes.some((node) => node.type === "path");
    if (hasPaths) {
      mapEl?.syncLiveFromStore();
      renderPathCards();
    }

    const selected =
      graphStore.nodes.find((node) => node.id === (journey.selectedPathId || graphStore.selectedId)) ||
      null;
    if (selected && selected.type !== "start") {
      selectGraphNode(selected.id);
      mapEl?.setSelectedNode(selected.id);
      showSelectedPath(selected, { scroll: false });
    } else if (hasPaths && activePathEl) {
      activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
    }

    setPhase(journey.phase, { animate: false, instant: true });
    intake.restoreChips();
    if (hasPaths) pathMap.restore();
    if (selected && selected.type !== "start") confirmGate.restore(selected);
    if (journey.planConfirmed) missions.restore();
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

  function startNewJourney() {
    cancelPendingComposerDraftSave();
    clearComposerDraft();
    openFreshAccountRoadmap();
    setPersistEnabled(true);
    clearGuestJourney();
    resetAppStore();
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.location.assign(`${url.pathname}${url.hash}`);
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
    setComposerEnabled(false);

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
    touchJourney();
    flushPersist();

    try {
      if (intake.isBlocking()) {
        const handled = await intake.handleTypedAnswer(trimmed);
        if (handled) return;
      }

      if (pathMap.isBlocking()) {
        const handled = await pathMap.handleTypedAnswer(trimmed);
        if (handled) return;
      }

      if (confirmGate.isBlocking()) {
        const idea =
          graphStore.nodes.find((node) => node.id === appStore.journey.selectedPathId) || null;
        const handled = await confirmGate.handleTypedAnswer(trimmed, idea);
        if (handled) return;
      }

      if (!appStore.journey.intakeComplete && !appStore.journey.pathMode) {
        intake.startAfterFirstPrompt();
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
      `<p>Apply this to the roadmap, or discard it. The mission stays as it is until you apply.</p>` +
      `<button type="button" data-apply-difficulty="1">Apply to roadmap</button>` +
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
      appendMessage(thread, "advisor", "Updated that mission on the roadmap.");
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
      `<button type="button" data-continue="roadmap">Open another roadmap</button>` +
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
      appendMessage(thread, "advisor", "Saved this roadmap for later. It stays on this device.");
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
    if (target.closest(".whatimado-map__you-btn, .whatimado-map__link-btn")) return;
    mapEl?.handleGlobalPanPointerDown(event);
  });

  mainEl?.addEventListener(
    "touchstart",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("whatimado-frame")) return;
      if (target.closest(".v2-rail")) return;
      if (target.closest(".whatimado-map__you-btn, .whatimado-map__link-btn")) return;
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
      (roadmapOpen && (type === "task" || type === "path")) ||
      !detail.promptEmpty
    ) {
      handleNodeSelect(detail.nodeId);
    }
  });

  frameEl?.composerInput?.addEventListener("input", () => {
    if (frameEl.composerInput?.value.trim()) dismissGhostMap();
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

  frameEl?.addEventListener("dock-progress", (event) => {
    const frameTop = /** @type {CustomEvent<{ frameTop?: number }>} */ (event).detail?.frameTop;
    if (typeof frameTop === "number") mapEl?.syncSpreadForFrame(frameTop);
  });

  frameEl?.addEventListener("dock-settled", () => {
    mapEl?.lockFromFrame();
    mapEl?.syncSnapCamera();
  });

  frameEl?.addEventListener("frame-drag-end", () => {
    if (MOBILE_MQ.matches) window.setTimeout(() => mapEl?.syncSnapCamera(), MOBILE_GLIDE_EASE_MS + 40);
  });

  document.getElementById("nav-home")?.addEventListener("click", () => {
    goToChatHome();
  });

  document.getElementById("nav-new-map")?.addEventListener("click", (event) => {
    void requestStartNewJourney(/** @type {HTMLElement} */ (event.currentTarget));
  });

  window.addEventListener("resize", () => layout());

  onAuthChange(() => {
    const want = isFounderUser(authState().user);
    setExtraExploreOptions(want ? [{ id: "option-analytics", label: "Analytics" }] : []);
    const has = graphStore.nodes.some((node) => node.id === "option-analytics");
    if (want === has) return;
    const pathId = appStore.journey.roadmapPathId;
    const stages = appStore.journey.missionsStages;
    if (!pathId || !appStore.journey.planConfirmed || !stages?.length) return;
    showRoadmapBranch(pathId, stages);
    const keep = mapEl?._selectedId;
    mapEl?.syncLiveFromStore();
    const still = keep && graphStore.nodes.some((node) => node.id === keep);
    mapEl?.setSelectedNode(still ? keep : pathId);
    mapEl?.syncRoadmapBranchFit?.({ animate: false });
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
