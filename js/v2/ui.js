
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

/**
 * @param {HTMLElement} container
 * @param {"user"|"advisor"} role
 * @param {string} content
 * @param {{ typing?: boolean }} [options]
 */
export function appendMessage(container, role, content, options = {}) {
  const wrap = document.createElement("div");
  wrap.className = `v2-msg v2-msg--${role} v2-text-box v2-text-box--${role === "user" ? "prompt" : "response"}${options.typing ? " v2-msg--typing" : ""}`;

  if (role === "advisor") {
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
