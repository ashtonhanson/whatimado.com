
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
 * @param {{ typing?: boolean }} [options]
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

  const frameBody = container.closest(".whatimado-frame__body");
  if (frameBody) {
    requestAnimationFrame(() => {
      frameBody.scrollTop = frameBody.scrollHeight;
    });
  } else {
    wrap.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  return wrap;
}
