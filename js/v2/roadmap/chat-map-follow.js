/**
 * Keep the node map centered on the mission/task currently visible in chat.
 * Camera only — never changes roadmap progress or path selection.
 */

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

  const sync = ({ animate = true } = {}) => {
    if (!mapEl.canChatFollow?.()) return;
    const id = visibleChatWorkId(frameEl);
    if (!id || id === lastId) {
      if (id && id === lastId) mapEl.followChatNode?.(id, { animate: false, soft: true });
      return;
    }
    lastId = id;
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
    sync({ animate: true });
  });

  /* First paint after missions render. */
  requestAnimationFrame(() => sync({ animate: false }));
}

/**
 * Pick the mission or task card most centered in the visible chat column.
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

  body.querySelectorAll(".v2-mission[data-mission-id]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const id = el.getAttribute("data-mission-id") || "";
    if (!id) return;
    /* Prefer the bar itself so collapsed rows still count. */
    const bar = el.querySelector(".v2-mission-done-acc__bar") || el;
    const score = visibilityScore(bar.getBoundingClientRect(), viewTop, viewBottom, midY);
    if (score <= 0) return;
    const prefer = 3;
    if (!best || score * prefer > best.score * best.prefer) {
      best = { id, score, prefer };
    }
  });

  body.querySelectorAll(".v2-stage[data-stage-index]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const index = el.getAttribute("data-stage-index");
    if (index == null || index === "") return;
    const id = `milestone-${index}`;
    /* Score the mission title only — the article wraps all tasks and would dominate. */
    const label = el.querySelector(".v2-stage__label") || el;
    const score = visibilityScore(label.getBoundingClientRect(), viewTop, viewBottom, midY);
    if (score <= 0) return;
    const prefer = 1;
    if (!best || score * prefer > best.score * best.prefer) {
      best = { id, score, prefer };
    }
  });

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
