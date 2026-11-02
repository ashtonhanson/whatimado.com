
/** @param {string} value */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** @param {string} value */
export function formatMessageHtml(value) {
  let html = escapeHtml(value);
  html = html.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  return html.replaceAll("\n\n", "<br><br>").replaceAll("\n", "<br>");
}

const TYPING_DOTS_HTML =
  `<span class="v2-typing-dots" aria-hidden="true">` +
  `<span class="v2-typing-dots__dot"></span>` +
  `<span class="v2-typing-dots__dot"></span>` +
  `<span class="v2-typing-dots__dot"></span>` +
  `</span>`;

/**
 * Pull optional [[check]] confusion block from an advisor reply.
 * @param {string} value
 * @returns {{ body: string, check: { off: string, clarify: string } | null }}
 */
export function parseAdvisorCheck(value) {
  const text = String(value || "");
  const match = text.match(/\[\[check\]\]([\s\S]*?)\[\[\/check\]\]/i);
  if (!match) return { body: text.trim(), check: null };
  const block = match[1] || "";
  const body = text.replace(match[0], "").trim();
  const offMatch = block.match(/What might be off:\s*(.+)/i);
  const clarifyMatch = block.match(/Clarify:\s*(.+)/i);
  const off = String(offMatch?.[1] || "").trim();
  const clarify = String(clarifyMatch?.[1] || "").trim();
  if (!off && !clarify) return { body: body || text.replace(match[0], "").trim(), check: null };
  return {
    body: body || text.replace(match[0], "").trim(),
    check: {
      off: off || "I may have misunderstood something.",
      clarify: clarify || "What should I correct?"
    }
  };
}

/**
 * Heuristic fallback when the model did not emit [[check]] but sounds unsure.
 * @param {string} value
 */
export function advisorSoundsUncertain(value) {
  const text = String(value || "");
  if (/\[\[check\]\]/i.test(text)) return false;
  return /\b(i'?m not (entirely )?sure|i may have (this|that|you) wrong|if i'?m (reading|understanding) (this|you|that) (right|correctly)|did i get that right|correct me if|not clear (to me|whether|if)|could mean a few|ambiguous|i might be missing)\b/i.test(
    text
  );
}

/**
 * @param {HTMLElement} container
 * @param {"user"|"advisor"} role
 * @param {string} content
 * @param {{
 *   typing?: boolean,
 *   skipScroll?: boolean,
 *   messageIndex?: number,
 *   editable?: boolean
 * }} [options]
 */
export function appendMessage(container, role, content, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = `v2-msg v2-msg--${role} v2-text-box v2-text-box--${role === "user" ? "prompt" : "response"}${options.typing ? " v2-msg--typing" : ""}`;

  if (Number.isInteger(options.messageIndex)) {
    wrap.dataset.msgIndex = String(options.messageIndex);
  }

  if (options.typing && role === "advisor") {
    wrap.innerHTML =
      `<div class="v2-msg-label">whatimado</div>` +
      `<div class="v2-msg-body v2-msg-body--typing" aria-label="Generating response">${TYPING_DOTS_HTML}</div>`;
  } else if (role === "advisor") {
    const parsed = parseAdvisorCheck(content);
    const showCheck = parsed.check || advisorSoundsUncertain(parsed.body);
    const check = parsed.check || (showCheck
      ? {
          off: "I may have misunderstood part of what you said.",
          clarify: "What should I correct so I have this right?"
        }
      : null);
    const bodyHtml = formatMessageHtml(parsed.body || content);
    wrap.innerHTML =
      `<div class="v2-msg-label">whatimado</div>` +
      `<div class="v2-msg-body">${bodyHtml}</div>` +
      (check
        ? `<aside class="v2-msg-check" data-msg-check="1">
            <p class="v2-msg-check__label">I might have this wrong</p>
            <p class="v2-msg-check__off">${escapeHtml(check.off)}</p>
            <p class="v2-msg-check__ask">${escapeHtml(check.clarify)}</p>
            <button type="button" class="v2-msg-check__clarify">Clarify</button>
          </aside>`
        : "");
  } else {
    wrap.innerHTML = `<div class="v2-msg-body">${formatMessageHtml(content)}</div>`;
    if (options.editable !== false && Number.isInteger(options.messageIndex)) {
      const actions = document.createElement("div");
      actions.className = "v2-msg__actions";
      actions.innerHTML = `<button type="button" class="v2-msg__edit" data-edit-msg="${options.messageIndex}">Edit</button>`;
      wrap.appendChild(actions);
    }
  }

  container.appendChild(wrap);

  if (!options.skipScroll) {
    scrollFrameChildIntoView(wrap, { toEnd: true });
  }

  syncFrameHasChat();
  return wrap;
}

/** Mark the prompt frame when transcript content exists so mobile keeps a scrollable band. */
export function syncFrameHasChat() {
  const frame = document.getElementById("dynamic-frame");
  if (!frame) return;
  const messages = document.getElementById("messages");
  const tail = document.getElementById("messages-tail");
  const has =
    Boolean(messages?.querySelector(".v2-msg")) || Boolean(tail?.querySelector(".v2-msg"));
  frame.classList.toggle("has-chat", has);
  if (typeof /** @type {{ notifyContentChange?: () => void }} */ (frame).notifyContentChange === "function") {
    /** @type {{ notifyContentChange?: () => void }} */ (frame).notifyContentChange?.();
  }
}

/**
 * Once path cards are on screen, new chat belongs under them — not back in the intake transcript.
 * @param {HTMLElement | null} [primary]
 * @returns {HTMLElement | null}
 */
export function continuationThread(primary) {
  const tail = document.getElementById("messages-tail");
  const cards = document.getElementById("possibilities");
  const pathsShown = Boolean(cards && !cards.classList.contains("hidden") && tail);
  if (pathsShown) return tail;
  return primary || document.getElementById("messages");
}

/**
 * Scroll a child into the prompt frame body (cards, details, or latest chat).
 * @param {HTMLElement | null} el
 * @param {{ toEnd?: boolean }} [options]
 */
export function scrollFrameChildIntoView(el, { toEnd = false } = {}) {
  if (!el) return;
  const frameBody = el.closest(".whatimado-frame__body");
  const run = () => {
    if (!el.isConnected) return;
    if (frameBody) {
      if (toEnd) {
        frameBody.scrollTop = frameBody.scrollHeight;
        return;
      }
      const bodyTop = frameBody.getBoundingClientRect().top;
      const childTop = el.getBoundingClientRect().top;
      frameBody.scrollTop = Math.max(0, frameBody.scrollTop + (childTop - bodyTop) - 10);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

/**
 * @param {HTMLElement | null} el
 * @param {string} text
 */
export function setStatusMessage(el, text) {
  if (!el) return;
  const value = String(text || "").trim();
  if (!value) {
    el.classList.add("hidden");
    el.textContent = "";
    el.removeAttribute("aria-busy");
    return;
  }
  el.classList.remove("hidden");
  el.setAttribute("aria-busy", "true");
  el.innerHTML = `${escapeHtml(value)} ${TYPING_DOTS_HTML}`;
}
