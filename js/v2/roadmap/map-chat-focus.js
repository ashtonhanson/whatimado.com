/**
 * One source of truth for the mission or task whose working context is open,
 * and for the mission node and current task that glow with it.
 * Inspecting a node does not change progress (focusMissionId, done, bypassed)
 * and does not activate another roadmap.
 *
 * @param {{ id?: string, type?: string } | null | undefined} node
 * @param {{ planConfirmed?: boolean, roadmapPathId?: string | null, focusMissionId?: string | null, chatFocusId?: string | null, nodes?: Array<{ id?: string, type?: string, parentId?: string }> }} journey
 * @param {{ openRoadmap?: boolean }} [options]
 */
export function resolveMapNodeActivation(node, journey, { openRoadmap = false } = {}) {
  const focusMissionId = journey?.focusMissionId || null;
  const roadmapPathId = journey?.roadmapPathId || null;
  const planConfirmed = Boolean(journey?.planConfirmed);
  const chatFocusId = journey?.chatFocusId || focusMissionId || null;
  const nodes = Array.isArray(journey?.nodes) ? journey.nodes : [];
  const kept = {
    focusMissionId,
    roadmapPathId,
    planConfirmed,
    changesProgress: false,
    activatesRoadmap: false
  };

  if (!node || node.type === "start" || node.type === "more" || node.type === "goal" || node.type === "action") {
    return {
      action: "passthrough",
      ...kept,
      chatFocusId,
      highlightIds: highlightIdsForChatFocus(chatFocusId, nodes, focusMissionId)
    };
  }

  if (node.type === "path" && planConfirmed && roadmapPathId && !openRoadmap) {
    if (node.id !== roadmapPathId) {
      return {
        action: "preview-alternate",
        ...kept,
        previewPathId: node.id,
        chatFocusId,
        highlightIds: highlightIdsForChatFocus(chatFocusId, nodes, focusMissionId)
      };
    }
    return {
      action: "show-active-roadmap",
      ...kept,
      chatFocusId,
      highlightIds: highlightIdsForChatFocus(chatFocusId, nodes, focusMissionId)
    };
  }

  if (node.type === "mission" || node.type === "task") {
    return {
      action: "open-working-context",
      ...kept,
      chatFocusId: node.id,
      highlightIds: highlightIdsForChatFocus(node.id, nodes, focusMissionId),
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
    highlightIds: highlightIdsForChatFocus(chatFocusId, nodes, focusMissionId)
  };
}

/**
 * Persistent map glow inside an open mission: that mission node and its current task.
 * A task focus keeps its parent mission. A mission focus keeps the progress task only
 * when that task's parent id is this mission. Ids are matched, never titles.
 * @param {string | null | undefined} chatFocusId
 * @param {Array<{ id?: string, type?: string, parentId?: string }>} [nodes]
 * @param {string | null | undefined} [progressTaskId]
 */
export function highlightIdsForChatFocus(chatFocusId, nodes = [], progressTaskId = "") {
  if (!chatFocusId) return [];
  const list = Array.isArray(nodes) ? nodes : [];
  const node = list.find((entry) => entry.id === chatFocusId);
  if (!node) return [chatFocusId];
  if (node.type === "task") return node.parentId ? [node.parentId, node.id] : [node.id];
  if (node.type === "mission") {
    const task = list.find(
      (entry) => entry.type === "task" && entry.id === progressTaskId && entry.parentId === node.id
    );
    return task ? [node.id, task.id] : [node.id];
  }
  return [node.id];
}

/**
 * Hover lights the chat card for this task id only. Leaving the node clears that
 * temporary mark; it is not part of the persistent mission and task glow.
 * @param {{ id?: string, type?: string } | null | undefined} node
 */
export function hoverChatTargetId(node) {
  if (!node || node.type !== "task" || !node.id) return "";
  return node.id;
}

/**
 * The roadmap timeline belongs in that roadmap's open chat.
 * A settings, analytics, or other page, or a different roadmap, suppresses the display.
 * The chat copy itself stays put so closing the panel shows the same timeline again.
 * @param {{ roadmapPathId?: string, chatRoadmapId?: string, planConfirmed?: boolean, page?: string }} state
 */
export function timelineShowsInOpenChat({
  roadmapPathId = "",
  chatRoadmapId = "",
  planConfirmed = false,
  page = ""
} = {}) {
  if (page) return false;
  if (!planConfirmed) return false;
  if (!roadmapPathId || roadmapPathId !== chatRoadmapId) return false;
  return true;
}
