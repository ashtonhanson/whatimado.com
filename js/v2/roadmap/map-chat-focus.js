/**
 * One source of truth for the mission or task whose working context is open,
 * and for the map node that glows with it.
 * Inspecting a node does not change progress (focusMissionId, done, bypassed)
 * and does not activate another roadmap.
 *
 * @param {{ id?: string, type?: string } | null | undefined} node
 * @param {{ planConfirmed?: boolean, roadmapPathId?: string | null, focusMissionId?: string | null, chatFocusId?: string | null }} journey
 * @param {{ openRoadmap?: boolean }} [options]
 */
export function resolveMapNodeActivation(node, journey, { openRoadmap = false } = {}) {
  const focusMissionId = journey?.focusMissionId || null;
  const roadmapPathId = journey?.roadmapPathId || null;
  const planConfirmed = Boolean(journey?.planConfirmed);
  const chatFocusId = journey?.chatFocusId || focusMissionId || null;
  const kept = {
    focusMissionId,
    roadmapPathId,
    planConfirmed,
    changesProgress: false,
    activatesRoadmap: false
  };

  if (!node || node.type === "start" || node.type === "more" || node.type === "action") {
    return { action: "passthrough", ...kept, chatFocusId, highlightIds: chatFocusId ? [chatFocusId] : [] };
  }

  if (node.type === "path" && planConfirmed && roadmapPathId && !openRoadmap) {
    if (node.id !== roadmapPathId) {
      return {
        action: "preview-alternate",
        ...kept,
        previewPathId: node.id,
        chatFocusId,
        highlightIds: chatFocusId ? [chatFocusId] : []
      };
    }
    return {
      action: "show-active-roadmap",
      ...kept,
      chatFocusId,
      highlightIds: chatFocusId ? [chatFocusId] : []
    };
  }

  if (node.type === "mission" || node.type === "task") {
    return {
      action: "open-working-context",
      ...kept,
      chatFocusId: node.id,
      highlightIds: [node.id],
      contextType: node.type
    };
  }

  if (node.type === "path" && openRoadmap) {
    return {
      action: "activate-roadmap",
      focusMissionId,
      roadmapPathId: node.id,
      planConfirmed,
      changesProgress: false,
      activatesRoadmap: true,
      chatFocusId: null,
      highlightIds: []
    };
  }

  return {
    action: "select-unconfirmed-path",
    ...kept,
    chatFocusId,
    highlightIds: chatFocusId ? [chatFocusId] : []
  };
}

/**
 * Map glow follows the open chat context only.
 * The active roadmap stays selected on its own, so a second task does not keep glowing.
 * @param {string | null | undefined} chatFocusId
 */
export function highlightIdsForChatFocus(chatFocusId) {
  return chatFocusId ? [chatFocusId] : [];
}
