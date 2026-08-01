import { graphStore, selectGraphNode } from "./graph-store.js";

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
  wrap.className = `v2-msg v2-msg--${role}${options.typing ? " v2-msg--typing" : ""}`;

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

/**
 * @param {SVGElement} svg
 * @param {(nodeId: string) => void} [onSelect]
 */
export function renderMapCanvas(svg, onSelect) {
  if (!svg) return;
  const w = 800;
  const h = 280;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const parts = [];
  graphStore.edges.forEach(({ from, to }) => {
    const a = graphStore.nodes.find((n) => n.id === from);
    const b = graphStore.nodes.find((n) => n.id === to);
    if (!a || !b) return;
    parts.push(
      `<line class="v2-map-edge" x1="${a.x * w}" y1="${a.y * h}" x2="${b.x * w}" y2="${b.y * h}" />`
    );
  });

  graphStore.nodes.forEach((node) => {
    const cx = node.x * w;
    const cy = node.y * h;
    const r = node.type === "start" ? 14 : 11;
    const classes = [
      "v2-map-node",
      node.type === "start" ? "is-start" : "",
      graphStore.selectedId === node.id ? "is-selected" : ""
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(`
      <g class="${classes}" data-node-id="${escapeHtml(node.id)}" role="button" tabindex="0">
        <circle cx="${cx}" cy="${cy}" r="${r}" />
        <text x="${cx}" y="${cy - r - 6}" text-anchor="middle">${escapeHtml(node.label)}</text>
      </g>
    `);
  });

  svg.innerHTML = parts.join("");

  svg.querySelectorAll(".v2-map-node").forEach((el) => {
    const id = el.getAttribute("data-node-id");
    if (!id) return;
    el.addEventListener("click", () => {
      selectGraphNode(id);
      renderMapCanvas(svg, onSelect);
      onSelect?.(id);
    });
  });
}
