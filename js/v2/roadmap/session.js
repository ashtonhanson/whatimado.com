import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { appendMessage, scrollFrameChildIntoView, setStatusMessage } from "../ui.js";
import { hideIntakeChips } from "../components/profile-chips.js";
import { PHASE } from "../phases.js";
import { buildIntakeContextBlock } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";
import {
  buildPlanSummaryPrompt,
  fallbackPlanSummary,
  hideConfirmGate,
  parsePlanSummary,
  renderConfirmGate
} from "./confirm-gate.js";

/**
 * @param {{
 *   messagesEl: HTMLElement | null,
 *   panelEl: HTMLElement | null,
 *   layout: () => void,
 *   flush: () => void,
 *   setComposerEnabled: (enabled: boolean) => void,
 *   setPhase: (phase: import("../phases.js").Phase) => void,
 *   renderDetail?: (idea: import("../graph-store.js").GraphNode, options?: { generating?: boolean }) => void,
 *   onConfirmed: (idea: import("../graph-store.js").GraphNode, bullets: string[]) => void
 * }} ui
 */
export function createConfirmGateController(ui) {
  const { messagesEl, panelEl, layout, flush, setComposerEnabled, setPhase, renderDetail, onConfirmed } = ui;
  let visible = false;
  let pending = false;

  function gateHost() {
    return panelEl?.querySelector("#selection-gate-host") || panelEl || messagesEl;
  }

  function statusEl() {
    return panelEl?.querySelector("#selection-status") || null;
  }

  function pushAdvisor(text, { skipScroll = false } = {}) {
    if (!messagesEl) return;
    appendMessage(messagesEl, "advisor", text, { skipScroll });
    appStore.journey.messages.push({ role: "assistant", content: text });
    touchJourney();
    layout();
    flush();
  }

  function hide() {
    visible = false;
    hideConfirmGate(gateHost());
    hideConfirmGate(messagesEl);
    setStatusMessage(statusEl(), "");
    appStore.journey.confirmGateAwaitingRevision = false;
  }

  function showGate(bullets, { update = false } = {}) {
    visible = true;
    appStore.journey.planBullets = bullets.slice();
    appStore.journey.confirmGateAwaitingRevision = false;
    touchJourney();
    renderConfirmGate(gateHost(), {
      label: update
        ? "Here's the updated plan based on what you shared. Does this look right before I build your roadmap?"
        : "Here's the plan I'd suggest — does this look right?",
      bullets,
      onConfirm: () => accept(),
      onRevise: () => requestRevision()
    });
    setStatusMessage(statusEl(), "");
    scrollFrameChildIntoView(panelEl || messagesEl);
    layout();
    flush();
  }

  async function requestSummary(idea, revision = "") {
    const fallback = fallbackPlanSummary(appStore.profile, idea.title || idea.label);
    const context = buildIntakeContextBlock(
      appStore.profile,
      formatUserLocation(appStore.location),
      appStore.journey.pathMode
    );
    try {
      const raw = await callAdvisor(buildPlanSummaryPrompt(idea, context, revision), {
        maxTokens: 500,
        feature: "v2_plan_summary"
      });
      return parsePlanSummary(raw, fallback);
    } catch {
      return fallback;
    }
  }

  /**
   * @param {import("../graph-store.js").GraphNode} idea
   * @param {{ update?: boolean, revision?: string }} [options]
   */
  async function begin(idea, options = {}) {
    if (!idea || idea.type === "start") return;
    if (pending && appStore.journey.selectedPathId === idea.id && !options.revision) return;
    if (
      visible &&
      appStore.journey.selectedPathId === idea.id &&
      !options.update &&
      !options.revision &&
      !appStore.journey.confirmGateAwaitingRevision
    ) {
      return;
    }

    pending = true;
    visible = false;
    hideIntakeChips(messagesEl);
    hideConfirmGate(gateHost());
    hideConfirmGate(messagesEl);
    appStore.journey.mapChatType = null;
    appStore.journey.mapChatPathId = null;
    appStore.journey.planConfirmed = false;
    appStore.journey.selectedPathId = idea.id;
    setPhase(PHASE.PATH_SELECTED);
    renderDetail?.(idea, { generating: true });
    setStatusMessage(statusEl(), options.revision ? "Updating this roadmap" : "Generating this roadmap");
    setComposerEnabled(false);
    layout();
    scrollFrameChildIntoView(panelEl || messagesEl);

    try {
      const summary = await requestSummary(idea, options.revision || "");
      renderDetail?.(idea, { generating: false });
      pushAdvisor(summary.intro, { skipScroll: true });
      showGate(summary.bullets, { update: Boolean(options.update || options.revision) });
    } finally {
      pending = false;
      setComposerEnabled(true);
      setStatusMessage(statusEl(), "");
    }
  }

  function requestRevision() {
    visible = false;
    hideConfirmGate(gateHost());
    hideConfirmGate(messagesEl);
    appStore.journey.confirmGateAwaitingRevision = true;
    touchJourney();
    flush();
    setComposerEnabled(true);
    pushAdvisor("What would you like to change about this plan? Tell me what's missing, out of order, or not realistic for you.");
    scrollFrameChildIntoView(messagesEl, { toEnd: true });
  }

  function accept() {
    const bullets = Array.isArray(appStore.journey.planBullets) ? appStore.journey.planBullets : [];
    const ideaId = appStore.journey.selectedPathId;
    hide();
    appStore.journey.planConfirmed = true;
    appStore.journey.confirmGateAwaitingRevision = false;
    appStore.journey.mapChatType = null;
    setPhase(PHASE.MISSIONS);
    touchJourney();
    flush();
    pushAdvisor("Locked in. I'll turn this into missions next — for now this is the plan we're building from.");
    const idea = { id: ideaId };
    onConfirmed(idea, bullets);
  }

  async function handleTypedAnswer(text, idea) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    if (appStore.journey.confirmGateAwaitingRevision) {
      if (!idea) return true;
      await begin(idea, { update: true, revision: trimmed });
      return true;
    }
    if (visible) {
      const q = trimmed.toLowerCase();
      if (/^(yes|looks good|confirm|create|ok|okay|good)\b/.test(q)) {
        accept();
        return true;
      }
      if (!idea) return true;
      await begin(idea, { update: true, revision: trimmed });
      return true;
    }
    return false;
  }

  function restore(idea) {
    const bullets = Array.isArray(appStore.journey.planBullets) ? appStore.journey.planBullets : [];
    if (appStore.journey.planConfirmed || appStore.journey.phase === PHASE.MISSIONS) return;
    if (appStore.journey.mapChatType) return;
    if (appStore.journey.confirmGateAwaitingRevision) {
      setComposerEnabled(true);
      return;
    }
    if (idea && bullets.length && appStore.journey.phase === PHASE.PATH_SELECTED) {
      showGate(bullets);
    }
  }

  function isBlocking() {
    return visible || Boolean(appStore.journey.confirmGateAwaitingRevision);
  }

  return {
    begin,
    hide,
    restore,
    handleTypedAnswer,
    isBlocking
  };
}
