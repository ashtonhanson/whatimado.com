import { PHASE, applyPhaseToDom } from "../phases.js";
import { graphStore, restorePossibilityMap, selectGraphNode, setSpineAlternatePaths, showRoadmapBranch } from "../graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "../advisor.js";
import { appendMessage, continuationThread, escapeHtml, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { notifyFrameLayout } from "../layout/notify-frame-layout.js";
import { appStore, resetAppStore, touchJourney } from "../state/store.js";
import { ensureJourneyStarted, toggleSavedPath } from "../state/journey.js";
import { formatUserLocation } from "../state/location.js";
import {
  bindPersistLifecycle,
  clearGuestJourney,
  flushPersist,
  restoreGuestJourney,
  schedulePersist,
  setPersistEnabled
} from "../state/persistence.js";
import { createIntakeController } from "../intake/session.js";
import { createPathMapController } from "../map/session.js";
import { createConfirmGateController } from "../roadmap/session.js";
import { createMissionsController, highlightTimelineMission } from "../roadmap/missions.js";
import { applyStructuredMissionUpdate, buildDifficultyPrompt, fallbackDifficultyUpdate, parseDifficultyUpdate } from "../roadmap/difficulty.js";
import { createDraftsController } from "../roadmap/drafts.js";

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

  const missions = createMissionsController({
    sectionEl: document.getElementById("missions"),
    listEl: document.getElementById("mission-stages"),
    layout,
    flush: flushPersist,
    onShown: (stages) => {
      drafts.sync(stages);
      setSpineAlternatePaths(Boolean(stages?.length));
      const pathId = appStore.journey.roadmapPathId;
      if (stages?.length && pathId) {
        showRoadmapBranch(pathId, stages);
        const keep = mapEl?._selectedId;
        mapEl?.syncLiveFromStore();
        const still = keep && graphStore.nodes.some((node) => node.id === keep);
        mapEl?.setSelectedNode(still ? keep : pathId);
      } else if (!stages?.length) {
        restorePossibilityMap();
        mapEl?.syncLiveFromStore();
      }
    }
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
      void missions.extend();
      return;
    }
    if (node.type === "action") {
      mapEl?.setFocusedNode(nodeId);
      showSpokePanel(node);
      return;
    }
    if (!openRoadmap && node.type === "path" && appStore.journey.planConfirmed && appStore.journey.roadmapPathId) {
      if (node.id !== appStore.journey.roadmapPathId) {
        mapEl?.setFocusedNode(nodeId);
        showAlternatePath(node);
        return;
      }
      mapEl?.setFocusedNode(null);
      showSelectedPath(node, { scroll: true, keepGate: true });
      const missionsEl = document.getElementById("missions");
      if (missionsEl && !missionsEl.classList.contains("hidden")) scrollFrameChildIntoView(missionsEl);
      return;
    }
    if (node.type === "mission" || node.type === "task") {
      mapEl?.setSelectedNode(nodeId);
      highlightTimelineMission(document.getElementById("mission-stages"), nodeId);
      const card = document.getElementById(node.type === "task" ? `mission-${nodeId}` : nodeId);
      card?.scrollIntoView({ block: "nearest" });
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

  function startNewJourney() {
    setPersistEnabled(true);
    clearGuestJourney();
    resetAppStore();
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.location.assign(`${url.pathname}${url.hash}`);
  }

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    ensureJourneyStarted(appStore.journey);
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
        const reply = await callAdvisor(buildExplorationPrompt(appStore.journey.messages), {
          maxTokens: 450,
          feature: "v2_exploration"
        });
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
  timelineEl?.addEventListener("mission-focus", (event) => {
    const id = event.detail?.id;
    if (!id) return;
    document.getElementById(`mission-${id}`)?.scrollIntoView({ block: "nearest" });
    const node = graphStore.nodes.find((item) => item.id === id);
    if (node) {
      mapEl?.setFocusedNode?.(id);
      mapEl?.setSelectedNode?.(id);
    }
  });
  timelineEl?.addEventListener("mission-add", () => {
    missions.extend();
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

  mapEl?.addEventListener("map-node-select", (event) => {
    const detail = /** @type {CustomEvent<{ nodeId: string, promptEmpty?: boolean }>} */ (event).detail;
    if (!detail?.nodeId) return;
    if (detail.node?.type === "mission" || detail.node?.type === "more" || detail.node?.type === "action" || !detail.promptEmpty) {
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

  mapEl?.addEventListener("map-new-roadmap", () => startNewJourney());

  frameEl?.addEventListener("dock-progress", (event) => {
    const frameTop = /** @type {CustomEvent<{ frameTop?: number }>} */ (event).detail?.frameTop;
    if (typeof frameTop === "number") mapEl?.syncSpreadForFrame(frameTop);
  });

  frameEl?.addEventListener("dock-settled", () => {
    mapEl?.lockFromFrame();
    mapEl?.syncSnapCamera();
  });

  document.getElementById("nav-home")?.addEventListener("click", () => {
    startNewJourney();
  });

  window.addEventListener("resize", () => layout());

  const restored = !isDemo && restoreGuestJourney() && restoreSessionUi();
  if (!restored) {
    applyPhaseToDom(document, PHASE.OPEN, { ghostDismissed: false });
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

  if (!MOBILE_LAYOUT_MQ.matches) {
    frameEl?.focusComposer();
  }

  return { store: appStore, handleSubmit, handleNodeSelect, startNewJourney };
}
