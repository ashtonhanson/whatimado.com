
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
  `<span class="v2-typing-dots__dot">.</span>` +
  `<span class="v2-typing-dots__dot">.</span>` +
  `<span class="v2-typing-dots__dot">.</span>` +
  `</span>`;

/**
 * @param {HTMLElement} container
 * @param {"user"|"advisor"} role
 * @param {string} content
 * @param {{ typing?: boolean, skipScroll?: boolean }} [options]
 */
export function appendMessage(container, role, content, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = `v2-msg v2-msg--${role} v2-text-box v2-text-box--${role === "user" ? "prompt" : "response"}${options.typing ? " v2-msg--typing" : ""}`;

  if (options.typing && role === "advisor") {
    wrap.innerHTML =
      `<div class="v2-msg-label">whatimado</div>` +
      `<div class="v2-msg-body v2-msg-body--typing" aria-label="Generating response">${TYPING_DOTS_HTML}</div>`;
  } else if (role === "advisor") {
    wrap.innerHTML = `<div class="v2-msg-label">whatimado</div><div class="v2-msg-body">${formatMessageHtml(content)}</div>`;
  } else {
    wrap.innerHTML = `<div class="v2-msg-body">${formatMessageHtml(content)}</div>`;
  }

  container.appendChild(wrap);

  if (!options.skipScroll) {
    scrollFrameChildIntoView(wrap, { toEnd: true });
  }

  return wrap;
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
  el.innerHTML =
    `${escapeHtml(value)} ` +
    `<span class="v2-typing-dots" aria-hidden="true">` +
    `<span class="v2-typing-dots__dot">.</span>` +
    `<span class="v2-typing-dots__dot">.</span>` +
    `<span class="v2-typing-dots__dot">.</span>` +
    `</span>`;
}
