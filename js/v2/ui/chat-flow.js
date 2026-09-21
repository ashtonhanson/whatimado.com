import { PHASE, applyPhaseToDom } from "../phases.js";
import { graphStore, selectGraphNode } from "../graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "../advisor.js";
import { appendMessage, escapeHtml } from "../ui.js";
import { notifyFrameLayout } from "../layout/notify-frame-layout.js";
import { appStore, resetAppStore, touchJourney } from "../state/store.js";
import { ensureJourneyStarted } from "../state/journey.js";
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

  function showSelectedPath(node) {
    const displayTitle = node.title || node.label;
    if (selectionPanel) {
      selectionPanel.classList.remove("hidden");
      const bits = [node.ideaType, node.cost, node.timeline].filter(Boolean);
      selectionPanel.innerHTML = `<h2 class="v2-section-label">Selected path</h2><p><strong>${escapeHtml(displayTitle)}</strong>${node.tagline ? ` — ${escapeHtml(node.tagline)}` : node.description ? ` — ${escapeHtml(node.description)}` : ""}</p>${bits.length ? `<p class="v2-selection-meta">${bits.map((bit) => escapeHtml(bit)).join(" · ")}</p>` : ""}`;
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
      showSelectedPath(selected);
    } else if (activePathEl) {
      activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
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
    onSelectPath: (id, options) => handleNodeSelect(id, options)
  });

  const confirmGate = createConfirmGateController({
    messagesEl,
    layout,
    flush: flushPersist,
    setComposerEnabled,
    setPhase,
    onConfirmed: () => {
      const selected =
        graphStore.nodes.find((node) => node.id === appStore.journey.selectedPathId) || null;
      if (selected && selected.type !== "start") showSelectedPath(selected);
      layout();
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

  /** @param {string} nodeId @param {{ startConfirm?: boolean }} [options] */
  function handleNodeSelect(nodeId, { startConfirm = true } = {}) {
    const node = graphStore.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === "start") return;
    selectGraphNode(nodeId);
    mapEl?.setSelectedNode(nodeId);
    appStore.journey.selectedPathId = nodeId;
    if (startConfirm) appStore.journey.planConfirmed = false;
    setPhase(PHASE.PATH_SELECTED);
    showSelectedPath(node);
    renderPathCards();
    layout();
    if (startConfirm) void confirmGate.begin(node);
    else confirmGate.hide();
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

    for (const turn of journey.messages) {
      appendMessage(messagesEl, turn.role === "user" ? "user" : "advisor", turn.content);
    }

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
      showSelectedPath(selected);
    } else if (hasPaths && activePathEl) {
      activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
    }

    setPhase(journey.phase, { animate: false, instant: true });
    intake.restoreChips();
    if (hasPaths) pathMap.restore();
    if (selected && selected.type !== "start") confirmGate.restore(selected);
    layout();
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

    appendMessage(messagesEl, "user", trimmed);
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

      const typingEl = appendMessage(messagesEl, "advisor", "…", { typing: true });
      layout();

      try {
        const reply = await callAdvisor(buildExplorationPrompt(appStore.journey.messages), {
          maxTokens: 450,
          feature: "v2_exploration"
        });
        typingEl.remove();
        const finalText = reply || "I'm here — tell me a bit more about what you're hoping changes.";
        appendMessage(messagesEl, "advisor", finalText);
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
          messagesEl,
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

  mapEl?.setNodeSelectHandler(handleNodeSelect);
  mapEl?.setPromptEmptyChecker(() => !frameEl?.composerInput?.value.trim());

  mainEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (document.body.classList.contains("is-frame-dragging") || frameEl?.isDragging?.()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("whatimado-frame")) return;
    if (target.closest(".v2-rail")) return;
    if (target.closest(".whatimado-map__node--live")) return;
    if (target.closest(".whatimado-map__you-btn")) return;
    mapEl?.handleGlobalPanPointerDown(event);
  });

  mainEl?.addEventListener(
    "touchstart",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("whatimado-frame")) return;
      if (target.closest(".v2-rail")) return;
      if (target.closest(".whatimado-map__you-btn")) return;
      if (target.closest("whatimado-map") || target === mainEl) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  mapEl?.addEventListener("map-node-select", (event) => {
    const detail = /** @type {CustomEvent<{ nodeId: string, promptEmpty?: boolean }>} */ (event).detail;
    if (!detail?.nodeId || detail.promptEmpty) return;
    handleNodeSelect(detail.nodeId);
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

  frameEl?.addEventListener("dock-settled", () => {
    mapEl?.lockFromFrame();
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
