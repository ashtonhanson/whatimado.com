import "./components/whatimado-frame.js";
import "./components/whatimado-map.js";
import { PHASE, applyPhaseToDom } from "./phases.js";
import { seedPossibilityNodes, graphStore, selectGraphNode } from "./graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "./advisor.js";
import { appendMessage } from "./ui.js";

/** @type {{ phase: import("./phases.js").Phase, messages: { role: "user"|"assistant", content: string }[], turnCount: number, ghostDismissed: boolean }} */
const state = {
  phase: PHASE.OPEN,
  messages: [],
  turnCount: 0,
  ghostDismissed: false
};

/** @type {import("./components/whatimado-frame.js").WhatimadoFrame|null} */
const frameEl = document.getElementById("dynamic-frame");
/** @type {import("./components/whatimado-map.js").WhatimadoMap|null} */
const mapEl = document.getElementById("possibility-map");
const messagesEl = document.getElementById("messages");
const activePathEl = document.getElementById("active-path-label");
const selectionPanel = document.getElementById("selection-panel");
const pathCardsEl = document.getElementById("path-cards");

function notifyFrameLayout() {
  frameEl?.notifyContentChange();
}

function setPhase(phase) {
  state.phase = phase;
  applyPhaseToDom(document, phase, { ghostDismissed: state.ghostDismissed });
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

function showDemoPossibilities() {
  seedPossibilityNodes();
  mapEl?.syncLiveFromStore();
  setPhase(PHASE.POSSIBILITIES);
  if (activePathEl) {
    activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one to continue — demo scaffold.";
  }
  renderDemoPathCards();
  notifyFrameLayout();
}

function renderDemoPathCards() {
  if (!pathCardsEl) return;
  const titles = [
    { id: "path-a", title: "Rebuild with your skills", desc: "Use what you already know while stabilizing basics." },
    { id: "path-b", title: "Train into a trade", desc: "Structured certification route with clear milestones." },
    { id: "path-c", title: "Freelance / self-employed", desc: "Small projects first, then repeat clients." }
  ];
  pathCardsEl.innerHTML = titles
    .map(
      (p) => `
    <button type="button" class="v2-path-card" data-path-id="${p.id}">
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
    </button>`
    )
    .join("");

  pathCardsEl.querySelectorAll(".v2-path-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-path-id");
      if (!id) return;
      pathCardsEl.querySelectorAll(".v2-path-card").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      handleNodeSelect(id);
    });
  });
}

/** @param {string} nodeId */
function handleNodeSelect(nodeId) {
  const node = graphStore.nodes.find((n) => n.id === nodeId);
  if (!node || node.type === "start") return;
  selectGraphNode(nodeId);
  mapEl?.setSelectedNode(nodeId);
  setPhase(PHASE.PATH_SELECTED);
  if (selectionPanel) {
    selectionPanel.classList.remove("hidden");
    selectionPanel.innerHTML = `<h2 class="v2-section-label">Selected path</h2><p><strong>${node.label}</strong> — mission nodes and resources will connect here in the next build step.</p>`;
  }
  if (activePathEl) {
    activePathEl.innerHTML = `<strong>${node.label}</strong>0 missions · scaffold`;
  }
  notifyFrameLayout();
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
  notifyFrameLayout();
  state.messages.push({ role: "user", content: trimmed });
  state.turnCount += 1;

  const typingEl = appendMessage(messagesEl, "advisor", "…", { typing: true });
  notifyFrameLayout();

  try {
    const reply = await callAdvisor(buildExplorationPrompt(state.messages), {
      maxTokens: 450,
      feature: "v2_exploration"
    });
    typingEl.remove();
    const finalText = reply || "I'm here — tell me a bit more about what you're hoping changes.";
    appendMessage(messagesEl, "advisor", finalText);
    notifyFrameLayout();
    state.messages.push({ role: "assistant", content: finalText });

    if (state.turnCount >= 2 && state.phase === PHASE.EXPLORING) {
      setPhase(PHASE.COACHING);
    }
    if (state.turnCount >= 3 && state.phase === PHASE.COACHING) {
      appendMessage(
        messagesEl,
        "advisor",
        "When you're ready, I can sketch a few possible directions on the map above. Tap a path node or card to explore."
      );
      notifyFrameLayout();
      showDemoPossibilities();
    }
  } catch (error) {
    typingEl.remove();
    appendMessage(
      messagesEl,
      "advisor",
      `I couldn't reach the advisor right now (${error?.message || "unknown error"}). Check your connection or OpenRouter balance.`
    );
    notifyFrameLayout();
  } finally {
    setComposerEnabled(true);
    frameEl?.focusComposer();
  }
}

mapEl?.setNodeSelectHandler(handleNodeSelect);

mapEl?.addEventListener("map-node-select", (event) => {
  const detail = /** @type {CustomEvent<{ nodeId: string }>} */ (event).detail;
  if (detail?.nodeId) handleNodeSelect(detail.nodeId);
});

frameEl?.composerInput?.addEventListener("input", () => {
  if (frameEl.composerInput?.value.trim()) dismissGhostMap();
});

frameEl?.addEventListener("composer-submit", (event) => {
  const detail = /** @type {CustomEvent<{ text: string }>} */ (event).detail;
  void handleSubmit(detail?.text || "");
});

document.getElementById("nav-home")?.addEventListener("click", () => {
  window.location.reload();
});

window.addEventListener("resize", () => notifyFrameLayout());

setPhase(PHASE.OPEN);
frameEl?.focusComposer();
