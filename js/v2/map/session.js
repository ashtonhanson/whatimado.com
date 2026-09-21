import { appStore, touchJourney } from "../state/store.js";
import { callAdvisor } from "../advisor.js";
import { appendMessage } from "../ui.js";
import { hideIntakeChips, renderIntakeChips } from "../components/profile-chips.js";
import { renderPathCards } from "../components/path-cards.js";
import {
  appendAdvisorPaths,
  graphStore,
  loadAdvisorPaths,
  MAX_PATH_NODES,
  selectGraphNode
} from "../graph-store.js";
import { PATH_MODE } from "../intake/path-mode.js";
import { buildIntakeContextBlock } from "../intake/stability-gates.js";
import { formatUserLocation } from "../state/location.js";
import {
  buildAlterSystemPrompt,
  buildDiscussSystemPrompt,
  buildIdeasPrompt,
  detectMapChatIntent,
  fallbackIdeas,
  filterNewIdeas,
  ideaCountForMode,
  MAX_MAP_PATHS,
  parseIdeasResponse
} from "./ideas.js";

function pathNodes() {
  return graphStore.nodes.filter((node) => node.type === "path");
}

function contextBlock() {
  const extras = [];
  const direction = String(appStore.journey.pathDirectionNote || "").trim();
  if (direction) {
    extras.push(
      `The user wants a different overall direction for the map: ${direction}`,
      "Regenerate paths that follow this new direction. Do not recycle the previous titles or strategy mix."
    );
  }
  const base = buildIntakeContextBlock(
    appStore.profile,
    formatUserLocation(appStore.location),
    appStore.journey.pathMode
  );
  return extras.length ? `${base}\n${extras.join("\n")}` : base;
}

/**
 * @param {{
 *   messagesEl: HTMLElement | null,
 *   pathCardsEl: HTMLElement | null,
 *   mapEl: { syncLiveFromStore: () => void, setPathPreview: (id: string | null) => void, setSelectedNode: (id: string) => void } | null,
 *   layout: () => void,
 *   flush: () => void,
 *   setComposerEnabled: (enabled: boolean) => void,
 *   setPhasePossibilities: () => void,
 *   onSelectPath: (id: string, options?: { startConfirm?: boolean }) => void
 * }} ui
 */
export function createPathMapController(ui) {
  const { messagesEl, pathCardsEl, mapEl, layout, flush, setComposerEnabled, setPhasePossibilities, onSelectPath } = ui;
  let moreBusy = false;
  let regenBusy = false;

  function pushAdvisor(text) {
    if (!messagesEl) return;
    appendMessage(messagesEl, "advisor", text);
    appStore.journey.messages.push({ role: "assistant", content: text });
    touchJourney();
    layout();
    flush();
  }

  function pushUser(text) {
    if (!messagesEl) return;
    appendMessage(messagesEl, "user", text);
    appStore.journey.messages.push({ role: "user", content: text });
    appStore.journey.turnCount += 1;
    touchJourney();
    layout();
    flush();
  }

  function showUpdateChip(label, onSelect) {
    if (!messagesEl) return;
    hideIntakeChips(messagesEl);
    renderIntakeChips(messagesEl, {
      options: [{ value: "update", label }],
      onSelect: () => {
        hideIntakeChips(messagesEl);
        onSelect();
      }
    });
  }

  function applyIdeasToMap(ideas, { keepSelectedId = appStore.journey.selectedPathId } = {}) {
    loadAdvisorPaths(ideas, { keepSelectedId });
    mapEl?.syncLiveFromStore();
    if (graphStore.selectedId) mapEl?.setSelectedNode(graphStore.selectedId);
    setPhasePossibilities();
    render();
    layout();
    flush();
  }

  function render() {
    const paths = pathNodes();
    const mode = appStore.journey.pathMode;
    renderPathCards(pathCardsEl, {
      paths,
      selectedId: appStore.journey.selectedPathId || graphStore.selectedId,
      canAddMore: mode !== PATH_MODE.DIRECT && paths.length < MAX_MAP_PATHS && paths.length < MAX_PATH_NODES,
      moreBusy,
      regenBusy,
      feedbackGiven: Boolean(appStore.journey.mapFeedbackGiven),
      onSelect: (id) => onSelectPath(id),
      onPreview: (id) => mapEl?.setPathPreview(id),
      onDiscuss: (id) => void startDiscuss(id),
      onAlter: (id) => void startAlter(id),
      onMore: () => void fetchMore(),
      onRegenerate: () => void regenerateAll(),
      onAlterDirection: () => startRedirect(),
      onFeedback: (sentiment) => handleFeedback(sentiment)
    });
    layout();
  }

  async function requestIdeas({ count, excludeTitles = [], replaceTitle = "", mode = "generate", feature = "v2_paths" }) {
    const raw = await callAdvisor(
      buildIdeasPrompt(appStore.journey.messages, contextBlock(), { count, excludeTitles, replaceTitle, mode }),
      { maxTokens: count > 1 ? 900 : 700, feature }
    );
    const parsed = parseIdeasResponse(raw);
    if (!parsed.ideas.length) throw new Error("No paths in advisor response");
    return parsed;
  }

  async function generate({ silentFail = false } = {}) {
    if (appStore.journey.pathsGenerated || appStore.pathsGenerating) return;
    appStore.pathsGenerating = true;
    setComposerEnabled(false);
    const typingEl = messagesEl ? appendMessage(messagesEl, "advisor", "Mapping a few paths that could fit…", { typing: true }) : null;
    layout();
    const count = ideaCountForMode(appStore.journey.pathMode);
    try {
      const { intro, ideas } = await requestIdeas({ count, mode: "generate", feature: "v2_paths" });
      typingEl?.remove();
      applyIdeasToMap(ideas.slice(0, count), { keepSelectedId: null });
      pushAdvisor(intro);
      appStore.journey.pathsGenerated = true;
      appStore.journey.mapChatType = null;
      appStore.journey.mapChatPathId = null;
      touchJourney();
      flush();
    } catch (error) {
      typingEl?.remove();
      applyIdeasToMap(fallbackIdeas(appStore.profile, appStore.journey.pathMode), { keepSelectedId: null });
      appStore.journey.pathsGenerated = true;
      touchJourney();
      flush();
      if (!silentFail) {
        pushAdvisor("I couldn't map custom paths just now — here are starter directions you can explore.");
      }
    } finally {
      appStore.pathsGenerating = false;
      setComposerEnabled(true);
    }
  }

  async function fetchMore() {
    const existing = pathNodes();
    if (moreBusy || existing.length >= MAX_MAP_PATHS) return;
    moreBusy = true;
    regenBusy = false;
    render();
    setComposerEnabled(false);
    try {
      const room = Math.min(3, MAX_MAP_PATHS - existing.length);
      const { ideas } = await requestIdeas({
        count: room,
        excludeTitles: existing.map((node) => node.title || node.label),
        mode: "more",
        feature: "v2_more_paths"
      });
      const fresh = filterNewIdeas(ideas, existing.map((node) => ({ title: node.title || node.label })));
      if (!fresh.length) {
        pushAdvisor("I couldn't find new paths that were different enough — try altering one, or regenerate the map.");
        return;
      }
      const added = appendAdvisorPaths(fresh);
      mapEl?.syncLiveFromStore();
      render();
      layout();
      flush();
      if (added.length) {
        pushAdvisor(`Added ${added.length} more path${added.length === 1 ? "" : "s"} to your map.`);
      }
    } catch {
      pushAdvisor("I couldn't add more paths just now — try again in a moment.");
    } finally {
      moreBusy = false;
      setComposerEnabled(true);
      render();
    }
  }

  async function regenerateAll() {
    if (regenBusy) return;
    regenBusy = true;
    render();
    setComposerEnabled(false);
    const typingEl = messagesEl ? appendMessage(messagesEl, "advisor", "Refreshing your map…", { typing: true }) : null;
    layout();
    const count = ideaCountForMode(appStore.journey.pathMode);
    const previous = pathNodes().map((node) => node.title || node.label);
    try {
      const { intro, ideas } = await requestIdeas({
        count,
        excludeTitles: previous,
        mode: "regenerate",
        feature: "v2_paths_regen"
      });
      typingEl?.remove();
      applyIdeasToMap(ideas.slice(0, count), { keepSelectedId: null });
      appStore.journey.selectedPathId = null;
      appStore.journey.mapChatType = null;
      appStore.journey.mapChatPathId = null;
      touchJourney();
      pushAdvisor(intro || "Here's a refreshed map based on what you've said.");
    } catch {
      typingEl?.remove();
      pushAdvisor("I couldn't regenerate the map just now — your current paths are unchanged.");
    } finally {
      regenBusy = false;
      setComposerEnabled(true);
      render();
    }
  }

  async function replacePath(pathId) {
    const current = pathNodes();
    const target = current.find((node) => node.id === pathId);
    if (!target) return;
    setComposerEnabled(false);
    const typingEl = messagesEl ? appendMessage(messagesEl, "advisor", "Updating that path…", { typing: true }) : null;
    layout();
    try {
      const { ideas } = await requestIdeas({
        count: 1,
        excludeTitles: current.filter((node) => node.id !== pathId).map((node) => node.title || node.label),
        replaceTitle: target.title || target.label,
        mode: "replace",
        feature: "v2_path_replace"
      });
      typingEl?.remove();
      const replacement = ideas[0];
      if (!replacement) throw new Error("empty replace");
      replacement.id = pathId;
      const next = current.map((node) =>
        node.id === pathId
          ? {
              ...replacement,
              id: pathId,
              label: replacement.label || replacement.title
            }
          : {
              id: node.id,
              label: node.label,
              title: node.title || node.label,
              type: node.ideaType || "Opportunity",
              tagline: node.tagline || node.description || "",
              why: node.why || "",
              cost: node.cost || "",
              timeline: node.timeline || "",
              income: node.income || "",
              description: node.description || node.tagline || ""
            }
      );
      applyIdeasToMap(next, { keepSelectedId: pathId });
      appStore.journey.selectedPathId = pathId;
      appStore.journey.mapChatType = null;
      appStore.journey.mapChatPathId = null;
      selectGraphNode(pathId);
      mapEl?.setSelectedNode(pathId);
      touchJourney();
      pushAdvisor(`Updated "${target.title || target.label}" on your map.`);
    } catch {
      typingEl?.remove();
      pushAdvisor("I couldn't revise that path just now — your map is unchanged. Try again or keep chatting.");
    } finally {
      setComposerEnabled(true);
      hideIntakeChips(messagesEl);
      render();
    }
  }

  function startDiscuss(pathId) {
    const idea = pathNodes().find((node) => node.id === pathId);
    if (!idea) return;
    hideIntakeChips(messagesEl);
    onSelectPath(pathId, { startConfirm: false });
    appStore.journey.mapChatType = "discuss";
    appStore.journey.mapChatPathId = pathId;
    touchJourney();
    flush();
    pushAdvisor(
      `Let's talk about "${idea.title || idea.label}". What questions do you have — fit, timing, money, or how you'd actually start? Tap Update this path when you want a revised version on the map.`
    );
    showUpdateChip("Update this path", () => void replacePath(pathId));
  }

  function startAlter(pathId) {
    const idea = pathNodes().find((node) => node.id === pathId);
    if (!idea) return;
    hideIntakeChips(messagesEl);
    onSelectPath(pathId, { startConfirm: false });
    appStore.journey.mapChatType = "alter";
    appStore.journey.mapChatPathId = pathId;
    touchJourney();
    flush();
    pushAdvisor(
      `Let's fix "${idea.title || idea.label}". Tell me what's off — too generic, wrong focus, timing, or budget — then tap Update this path.`
    );
    showUpdateChip("Update this path", () => void replacePath(pathId));
  }

  function startRedirect() {
    hideIntakeChips(messagesEl);
    appStore.journey.mapChatType = "redirect";
    appStore.journey.mapChatPathId = null;
    touchJourney();
    flush();
    pushAdvisor(
      "What direction should these paths take instead? For example: more employment, less teaching, closer to your current skills, faster income, or a different field entirely."
    );
  }

  function handleFeedback(sentiment) {
    appStore.journey.mapFeedbackGiven = true;
    appStore.journey.mapFeedbackSentiment = sentiment;
    touchJourney();
    flush();
    render();
    if (sentiment === "no") {
      const first = pathNodes()[0];
      if (first) startAlter(first.id);
      else pushAdvisor("What would make these paths more useful?");
    }
  }

  async function handleTypedAnswer(text) {
    const type = appStore.journey.mapChatType;
    if (!type) return false;
    const trimmed = String(text || "").trim();
    if (!trimmed) return true;
    hideIntakeChips(messagesEl);
    const pathId = appStore.journey.mapChatPathId;
    if (type === "redirect") {
      appStore.journey.pathDirectionNote = trimmed;
      appStore.journey.mapChatType = null;
      appStore.journey.mapChatPathId = null;
      touchJourney();
      flush();
      await regenerateAll();
      return true;
    }
    const idea = pathNodes().find((node) => node.id === pathId);
    const intent = detectMapChatIntent(trimmed);
    if (intent === "regenerate") {
      appStore.journey.mapChatType = null;
      appStore.journey.mapChatPathId = null;
      await regenerateAll();
      return true;
    }
    if (intent === "replace_path" && pathId) {
      await replacePath(pathId);
      return true;
    }

    setComposerEnabled(false);
    const typingEl = messagesEl ? appendMessage(messagesEl, "advisor", "…", { typing: true }) : null;
    layout();
    const paths = pathNodes().map((node) => ({
      title: node.title || node.label,
      type: node.ideaType || "",
      tagline: node.tagline || node.description || "",
      why: node.why || "",
      cost: node.cost || "",
      timeline: node.timeline || "",
      income: node.income || ""
    }));
    const system =
      type === "discuss" && idea
        ? buildDiscussSystemPrompt(
            {
              id: idea.id,
              label: idea.label,
              title: idea.title || idea.label,
              type: idea.ideaType || "Opportunity",
              tagline: idea.tagline || idea.description || "",
              why: idea.why || "",
              cost: idea.cost || "",
              timeline: idea.timeline || "",
              income: idea.income || "",
              description: idea.description || ""
            },
            paths
          )
        : buildAlterSystemPrompt(paths, appStore.journey.pathMode === PATH_MODE.DIRECT);
    const transcript = appStore.journey.messages
      .slice(-12)
      .map((m) => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`)
      .join("\n\n");
    try {
      const reply =
        (await callAdvisor(`${system}\n\nConversation:\n${transcript}\n\nRespond to the user's latest message.`, {
          maxTokens: 320,
          feature: "v2_path_discuss"
        })) || "Tell me what to change and I'll update that path when you tap the button.";
      typingEl?.remove();
      pushAdvisor(reply);
    } catch {
      typingEl?.remove();
      pushAdvisor("I couldn't reach the helper just now. Tap Update this path to revise from what you already said, or try again in a moment.");
    } finally {
      setComposerEnabled(true);
      if (pathId) showUpdateChip("Update this path", () => void replacePath(pathId));
    }
    return true;
  }

  function isBlocking() {
    return Boolean(appStore.journey.mapChatType);
  }

  function restore() {
    render();
    const pathId = appStore.journey.mapChatPathId;
    if (appStore.journey.mapChatType && pathId) {
      showUpdateChip("Update this path", () => void replacePath(pathId));
    }
  }

  return {
    generate,
    render,
    restore,
    handleTypedAnswer,
    isBlocking,
    fetchMore,
    regenerateAll
  };
}
