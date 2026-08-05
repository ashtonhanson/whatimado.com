import { PHASE, applyPhaseToDom } from "../phases.js";
import { loadAdvisorPaths, graphStore, selectGraphNode, seedPossibilityNodes } from "../graph-store.js";
import {
  callAdvisor,
  buildExplorationPrompt,
  buildPathsPrompt,
  parseAdvisorPathsResponse
} from "../advisor.js";
import { appendMessage, escapeHtml } from "../ui.js";
import { notifyFrameLayout } from "../layout/notify-frame-layout.js";

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

  /** @type {{ phase: import("../phases.js").Phase, messages: { role: "user"|"assistant", content: string }[], turnCount: number, ghostDismissed: boolean, pathsGenerated: boolean, pathsGenerating: boolean }} */
  const state = {
    phase: PHASE.OPEN,
    messages: [],
    turnCount: 0,
    ghostDismissed: false,
    pathsGenerated: false,
    pathsGenerating: false
  };

  const layout = () => notifyFrameLayout({ frameEl, mapEl });

  function setPhase(phase) {
    const wasOpen = state.phase === PHASE.OPEN;
    state.phase = phase;
    applyPhaseToDom(document, phase, { ghostDismissed: state.ghostDismissed });
    if (wasOpen && phase !== PHASE.OPEN) {
      frameEl?.onHeroDismissed({ animate: true });
    }
  }

  function setComposerEnabled(enabled) {
    frameEl?.setComposerEnabled(enabled);
  }

  function dismissGhostMap() {
    if (state.ghostDismissed) return;
    state.ghostDismissed = true;
    mapEl?.dismissGhost();
    setPhase(state.phase);
  }

  function renderPathCards() {
    if (!pathCardsEl) return;

    const paths = graphStore.nodes.filter((node) => node.type === "path");
    pathCardsEl.innerHTML = paths
      .map(
        (path) => `
    <button type="button" class="v2-path-card" data-path-id="${escapeHtml(path.id)}" style="--path-accent: ${escapeHtml(path.accent || "#2ee8d6")}">
      <h3>${escapeHtml(path.title || path.label)}</h3>
      <p>${escapeHtml(path.description || "")}</p>
    </button>`
      )
      .join("");

    pathCardsEl.querySelectorAll(".v2-path-card").forEach((btn) => {
      const id = btn.getAttribute("data-path-id");
      if (!id) return;

      btn.addEventListener("mouseenter", () => {
        mapEl?.setPathPreview(id);
      });
      btn.addEventListener("mouseleave", () => {
        mapEl?.setPathPreview(null);
      });
      btn.addEventListener("click", () => {
        mapEl?.setPathPreview(null);
        pathCardsEl.querySelectorAll(".v2-path-card").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        handleNodeSelect(id);
      });
    });
  }

  function applyPathsToMap() {
    mapEl?.syncLiveFromStore();
    setPhase(PHASE.POSSIBILITIES);
    if (activePathEl) {
      activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one on the map or below.";
    }
    renderPathCards();
    layout();
  }

  function fallbackPaths() {
    seedPossibilityNodes();
    const seeded = graphStore.nodes.filter((node) => node.type === "path");
    seeded.forEach((node, index) => {
      const titles = ["Rebuild with your skills", "Train into a trade", "Freelance / self-employed"];
      const descs = [
        "Use what you already know while stabilizing basics.",
        "Structured certification route with clear milestones.",
        "Small projects first, then repeat clients."
      ];
      node.title = titles[index] || node.label;
      node.description = descs[index] || "";
    });
    applyPathsToMap();
  }

  async function generateAdvisorPaths() {
    if (state.pathsGenerated || state.pathsGenerating) return;
    state.pathsGenerating = true;
    setComposerEnabled(false);

    const typingEl = appendMessage(messagesEl, "advisor", "Mapping a few paths that could fit…", { typing: true });
    layout();

    try {
      const raw = await callAdvisor(buildPathsPrompt(state.messages), {
        maxTokens: 700,
        feature: "v2_paths"
      });
      const { intro, paths } = parseAdvisorPathsResponse(raw);

      typingEl.remove();
      loadAdvisorPaths(paths);
      applyPathsToMap();
      appendMessage(messagesEl, "advisor", intro);
      state.messages.push({ role: "assistant", content: intro });
      state.pathsGenerated = true;
      layout();
    } catch (error) {
      typingEl.remove();
      appendMessage(
        messagesEl,
        "advisor",
        "I couldn't map custom paths just now — here are starter directions you can explore."
      );
      layout();
      fallbackPaths();
      state.pathsGenerated = true;
    } finally {
      state.pathsGenerating = false;
      setComposerEnabled(true);
      if (window.matchMedia("(max-width: 900px)").matches) {
        frameEl?.composerInput?.blur();
      } else {
        frameEl?.focusComposer();
      }
    }
  }

  /** @param {string} nodeId */
  function handleNodeSelect(nodeId) {
    const node = graphStore.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === "start") return;
    selectGraphNode(nodeId);
    mapEl?.setSelectedNode(nodeId);
    setPhase(PHASE.PATH_SELECTED);
    const displayTitle = node.title || node.label;
    if (selectionPanel) {
      selectionPanel.classList.remove("hidden");
      selectionPanel.innerHTML = `<h2 class="v2-section-label">Selected path</h2><p><strong>${escapeHtml(displayTitle)}</strong>${node.description ? ` — ${escapeHtml(node.description)}` : ""}</p>`;
    }
    if (activePathEl) {
      activePathEl.innerHTML = `<strong>${escapeHtml(displayTitle)}</strong>Ready for missions next.`;
    }
    layout();
  }

  function seedHypotheticalChat() {
    if (!messagesEl) return;

    for (const turn of DEMO_CHAT) {
      appendMessage(messagesEl, turn.role, turn.content);
      state.messages.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.content
      });
    }

    state.turnCount = 3;
    state.ghostDismissed = true;
    mapEl?.dismissGhost();
    setPhase(PHASE.COACHING);
    layout();
    void generateAdvisorPaths();
  }

  async function handleSubmit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    dismissGhostMap();
    setComposerEnabled(false);

    if (state.phase === PHASE.OPEN) {
      setPhase(PHASE.EXPLORING);
    }

    appendMessage(messagesEl, "user", trimmed);
    layout();
    state.messages.push({ role: "user", content: trimmed });
    state.turnCount += 1;

    const typingEl = appendMessage(messagesEl, "advisor", "…", { typing: true });
    layout();

    try {
      const reply = await callAdvisor(buildExplorationPrompt(state.messages), {
        maxTokens: 450,
        feature: "v2_exploration"
      });
      typingEl.remove();
      const finalText = reply || "I'm here — tell me a bit more about what you're hoping changes.";
      appendMessage(messagesEl, "advisor", finalText);
      layout();
      state.messages.push({ role: "assistant", content: finalText });

      if (state.turnCount >= 2 && state.phase === PHASE.EXPLORING) {
        setPhase(PHASE.COACHING);
      }
      if (state.turnCount >= PATHS_READY_TURN && state.phase === PHASE.COACHING && !state.pathsGenerated) {
        await generateAdvisorPaths();
      }
    } catch (error) {
      typingEl.remove();
      appendMessage(
        messagesEl,
        "advisor",
        `I couldn't reach the advisor right now (${error?.message || "unknown error"}). Check your connection or OpenRouter balance.`
      );
      layout();
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
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("whatimado-frame")) return;
    if (target.closest(".v2-rail")) return;
    if (target.closest(".whatimado-map__node--live")) return;
    if (target.closest(".whatimado-map__you-btn")) return;
    mapEl?.handleGlobalPanPointerDown(event);
  });

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

  frameEl?.addEventListener("dock-progress", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    const frameTop = /** @type {CustomEvent<{ frameTop: number }>} */ (event).detail?.frameTop;
    if (typeof frameTop === "number") {
      mapEl?.syncGravityForFrameTop(frameTop, { animate: false });
    }
  });

  frameEl?.addEventListener("dock-settled", () => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      mapEl?.lockFromFrame();
      return;
    }
    mapEl?.syncFrameGravity({ animate: false });
    mapEl?.lockFromFrame();
  });

  document.getElementById("nav-home")?.addEventListener("click", () => {
    window.location.reload();
  });

  window.addEventListener("resize", () => layout());

  applyPhaseToDom(document, PHASE.OPEN, { ghostDismissed: false });

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

  if (new URLSearchParams(window.location.search).has("demo")) {
    requestAnimationFrame(() => seedHypotheticalChat());
  }

  if (!MOBILE_LAYOUT_MQ.matches) {
    frameEl?.focusComposer();
  }

  return { state, handleSubmit, handleNodeSelect };
}
