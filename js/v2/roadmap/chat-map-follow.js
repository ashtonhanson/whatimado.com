/**
 * Keep the node map centered on the mission/task/path currently visible in chat.
 * Camera only — never changes roadmap progress or path selection.
 */

import { appStore } from "../state/store.js";

const NEAR_BOTTOM_PX = 72;

/**
 * @param {{
 *   frameEl: import("../components/whatimado-frame.js").WhatimadoFrame | null,
 *   mapEl: import("../components/whatimado-map.js").WhatimadoMap | null
 * }} deps
 */
export function bindChatMapFollow({ frameEl, mapEl }) {
  if (!frameEl || !mapEl || frameEl.dataset.chatMapFollowBound === "1") return;
  frameEl.dataset.chatMapFollowBound = "1";

  let raf = 0;
  let lastId = "";
  let pendingId = "";
  let pendingHits = 0;

  const sync = ({ animate = true, force = false } = {}) => {
    if (!mapEl.canChatFollow?.()) return;
    const id = visibleChatWorkId(frameEl);
    if (!id) return;

    if (id === lastId) {
      pendingId = "";
      pendingHits = 0;
      return;
    }

    /* Hysteresis: require two consecutive frames on a new card before switching. */
    if (!force && lastId) {
      if (id === pendingId) pendingHits += 1;
      else {
        pendingId = id;
        pendingHits = 1;
      }
      if (pendingHits < 2) return;
    }

    lastId = id;
    pendingId = "";
    pendingHits = 0;
    mapEl.followChatNode?.(id, { animate });
  };

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      sync({ animate: true });
    });
  };

  const body = frameEl.bodyEl;
  body?.addEventListener("scroll", onScroll, { passive: true });
  mapEl.addEventListener("chat-follow-resume", () => {
    lastId = "";
    pendingId = "";
    pendingHits = 0;
    sync({ animate: true, force: true });
  });

  /* First paint after missions render. */
  requestAnimationFrame(() => sync({ animate: false, force: true }));
}

/**
 * Pick the mission, stage, or Possibility Maps path most centered in the chat column.
 * @param {import("../components/whatimado-frame.js").WhatimadoFrame} frameEl
 * @returns {string}
 */
export function visibleChatWorkId(frameEl) {
  const body = frameEl?.bodyEl;
  if (!body) return "";
  const bodyRect = body.getBoundingClientRect();
  const composer = frameEl.querySelector(".whatimado-frame__composer");
  const composerTop = composer?.getBoundingClientRect().top ?? bodyRect.bottom;
  const viewBottom = Math.min(bodyRect.bottom, composerTop - 4);
  const viewTop = bodyRect.top;
  if (viewBottom - viewTop < 40) return "";

  const midY = (viewTop + viewBottom) / 2;
  /** @type {{ id: string, score: number, prefer: number } | null} */
  let best = null;

  const consider = (id, score, prefer) => {
    if (!id || score <= 0) return;
    if (!best || score * prefer > best.score * best.prefer) {
      best = { id, score, prefer };
    }
  };

  body.querySelectorAll(".v2-mission[data-mission-id]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const id = el.getAttribute("data-mission-id") || "";
    if (!id) return;
    /* Prefer the bar itself so collapsed rows still count. */
    const bar = el.querySelector(".v2-mission-done-acc__bar") || el;
    consider(id, visibilityScore(bar.getBoundingClientRect(), viewTop, viewBottom, midY), 3);
  });

  body.querySelectorAll(".v2-stage[data-stage-index]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const index = el.getAttribute("data-stage-index");
    if (index == null || index === "") return;
    const id = `milestone-${index}`;
    /* Score the mission title only — the article wraps all tasks and would dominate. */
    const label = el.querySelector(".v2-stage__label") || el;
    consider(id, visibilityScore(label.getBoundingClientRect(), viewTop, viewBottom, midY), 1);
  });

  const possibilities = body.querySelector("#possibilities");
  if (possibilities instanceof HTMLElement && !possibilities.classList.contains("hidden")) {
    const fallbackPath =
      possibilities.querySelector(".v2-path-card.is-selected")?.getAttribute("data-path-id") ||
      appStore.journey?.roadmapPathId ||
      appStore.journey?.selectedPathId ||
      possibilities.querySelector(".v2-path-card[data-path-id]")?.getAttribute("data-path-id") ||
      "";

    const title = possibilities.querySelector(".v2-possibilities__title") || possibilities;
    if (title instanceof HTMLElement && fallbackPath) {
      consider(
        fallbackPath,
        visibilityScore(title.getBoundingClientRect(), viewTop, viewBottom, midY),
        2.4
      );
    }

    possibilities.querySelectorAll(".v2-path-card[data-path-id]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const id = el.getAttribute("data-path-id") || "";
      consider(id, visibilityScore(el.getBoundingClientRect(), viewTop, viewBottom, midY), 2.6);
    });
  }

  return best?.id || "";
}

/**
 * @param {DOMRect} rect
 * @param {number} viewTop
 * @param {number} viewBottom
 * @param {number} midY
 */
function visibilityScore(rect, viewTop, viewBottom, midY) {
  const top = Math.max(rect.top, viewTop);
  const bottom = Math.min(rect.bottom, viewBottom);
  const overlap = bottom - top;
  if (overlap <= 8) return 0;
  const elMid = (rect.top + rect.bottom) / 2;
  const dist = Math.abs(elMid - midY);
  const viewH = Math.max(1, viewBottom - viewTop);
  return overlap / viewH - dist / viewH;
}

export { NEAR_BOTTOM_PX };
