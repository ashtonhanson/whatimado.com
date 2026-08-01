import { PHASE, applyPhaseToDom } from "./phases.js";
import { seedPossibilityNodes, graphStore } from "./graph-store.js";
import { callAdvisor, buildExplorationPrompt } from "./advisor.js";
import { appendMessage, renderMapCanvas } from "./ui.js";

/** @type {{ phase: import("./phases.js").Phase, messages: { role: "user"|"assistant", content: string }[], turnCount: number }} */
const state = {
  phase: PHASE.OPEN,
  messages: [],
  turnCount: 0
};

const messagesEl = document.getElementById("messages");
const composerForm = document.getElementById("composer");
const composerInput = document.getElementById("composer-input");
const sendBtn = document.getElementById("composer-send");
const mapSvg = document.getElementById("map-svg");
const activePathEl = document.getElementById("active-path-label");
const selectionPanel = document.getElementById("selection-panel");
const pathCardsEl = document.getElementById("path-cards");

function setPhase(phase) {
  state.phase = phase;
  applyPhaseToDom(document, phase);
}

function setComposerEnabled(enabled) {
  if (composerInput) composerInput.disabled = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled;
}

function showDemoPossibilities() {
  seedPossibilityNodes();
  renderMapCanvas(mapSvg, handleNodeSelect);
  setPhase(PHASE.POSSIBILITIES);
  if (activePathEl) {
    activePathEl.innerHTML = "<strong>Exploring paths</strong>Pick one to continue — demo scaffold.";
  }
  renderDemoPathCards();
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
  setPhase(PHASE.PATH_SELECTED);
  if (selectionPanel) {
    selectionPanel.classList.remove("hidden");
    selectionPanel.innerHTML = `<h2 class="v2-section-label">Selected path</h2><p><strong>${node.label}</strong> — mission nodes and resources will connect here in the next build step.</p>`;
  }
  if (activePathEl) {
    activePathEl.innerHTML = `<strong>${node.label}</strong>0 missions · scaffold`;
  }
}

async function handleSubmit(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  setComposerEnabled(false);

  if (state.phase === PHASE.OPEN) {
    setPhase(PHASE.EXPLORING);
  }

  appendMessage(messagesEl, "user", trimmed);
  state.messages.push({ role: "user", content: trimmed });
  state.turnCount += 1;

  const typingEl = appendMessage(messagesEl, "advisor", "…", { typing: true });

  try {
    const reply = await callAdvisor(buildExplorationPrompt(state.messages), {
      maxTokens: 450,
      feature: "v2_exploration"
    });
    typingEl.remove();
    const finalText = reply || "I'm here — tell me a bit more about what you're hoping changes.";
    appendMessage(messagesEl, "advisor", finalText);
    state.messages.push({ role: "assistant", content: finalText });

    if (state.turnCount >= 2 && state.phase === PHASE.EXPLORING) {
      setPhase(PHASE.COACHING);
    }
    if (state.turnCount >= 3 && state.phase === PHASE.COACHING) {
      appendMessage(
        messagesEl,
        "advisor",
        "When you're ready, I can sketch a few possible directions on the map above. For this preview shell, that appears after a few turns — tap a path card or node to explore."
      );
      showDemoPossibilities();
    }
  } catch (error) {
    typingEl.remove();
    appendMessage(
      messagesEl,
      "advisor",
      `I couldn't reach the advisor right now (${error?.message || "unknown error"}). Check your connection or OpenRouter balance.`
    );
  } finally {
    setComposerEnabled(true);
    composerInput?.focus();
  }
}

composerForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = composerInput?.value || "";
  if (composerInput) composerInput.value = "";
  void handleSubmit(text);
});

composerInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composerForm?.requestSubmit();
  }
});

document.getElementById("nav-home")?.addEventListener("click", () => {
  window.location.reload();
});

setPhase(PHASE.OPEN);
composerInput?.focus();
