const FRAME_TEMPLATE = `
  <div class="whatimado-frame__inner">
    <div class="whatimado-frame__body" part="body"></div>
    <form class="whatimado-frame__composer" part="composer" novalidate>
      <label class="sr-only" for="whatimado-composer-input">Your message</label>
      <textarea
        id="whatimado-composer-input"
        class="whatimado-frame__composer-input"
        rows="1"
        placeholder="Share what's going on…"
        autocomplete="off"
      ></textarea>
      <button type="submit" class="whatimado-frame__composer-send">Send</button>
    </form>
  </div>
`;

export class WhatimadoFrame extends HTMLElement {
  static get observedAttributes() {
    return ["anchor", "max-growth"];
  }

  constructor() {
    super();
    /** @type {HTMLElement|null} */
    this._body = null;
    /** @type {HTMLFormElement|null} */
    this._composerForm = null;
    /** @type {HTMLTextAreaElement|null} */
    this._composerInput = null;
    /** @type {ResizeObserver|null} */
    this._resizeObserver = null;
    this._built = false;
  }

  connectedCallback() {
    if (!this._built) this._build();
    this._applyAnchorStyles();
    this._observeBody();
    this._composerForm?.addEventListener("submit", this._onSubmit);
    this._composerInput?.addEventListener("keydown", this._onKeydown);
    requestAnimationFrame(() => this._updateScrollState());
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    this._composerForm?.removeEventListener("submit", this._onSubmit);
    this._composerInput?.removeEventListener("keydown", this._onKeydown);
  }

  attributeChangedCallback(name) {
    if (name === "anchor" || name === "max-growth") {
      this._applyAnchorStyles();
      this._updateScrollState();
    }
  }

  /** @returns {HTMLElement} */
  get bodyEl() {
    if (!this._body) this._build();
    return /** @type {HTMLElement} */ (this._body);
  }

  /** @returns {HTMLTextAreaElement|null} */
  get composerInput() {
    return this._composerInput;
  }

  focusComposer() {
    this._composerInput?.focus();
  }

  setComposerEnabled(enabled) {
    if (this._composerInput) this._composerInput.disabled = !enabled;
    const sendBtn = this._composerForm?.querySelector("button[type=submit]");
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  _build() {
    if (this._built) return;
    this._built = true;

    const initialChildren = [...this.childNodes];
    this.innerHTML = FRAME_TEMPLATE;

    this._body = this.querySelector(".whatimado-frame__body");
    this._composerForm = this.querySelector(".whatimado-frame__composer");
    this._composerInput = this.querySelector(".whatimado-frame__composer-input");

    initialChildren.forEach((node) => {
      this._body?.appendChild(node);
    });
  }

  _parseAnchorVh() {
    const raw = this.getAttribute("anchor");
    const num = raw ? Number.parseFloat(raw) : 42;
    return Number.isFinite(num) ? num : 42;
  }

  _parseMaxGrowth() {
    const raw = this.getAttribute("max-growth") || "calc(100dvh - var(--whatimado-frame-top) - 1rem)";
    return raw;
  }

  _applyAnchorStyles() {
    const anchorVh = this._parseAnchorVh();
    this.style.setProperty("--whatimado-frame-top", `${anchorVh}vh`);
    this.style.setProperty("--whatimado-frame-max-h", this._parseMaxGrowth());
  }

  _observeBody() {
    if (!this._body || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this._updateScrollState());
    this._resizeObserver.observe(this._body);
  }

  _updateScrollState() {
    if (!this._body) return;

    const topPx = this._parseAnchorVh() * window.innerHeight / 100;
    const maxOuter = window.innerHeight - topPx - 16;
    const composerH = this._composerForm?.offsetHeight || 0;
    const innerPad = 0;
    const bodyMax = Math.max(80, maxOuter - composerH - innerPad);

    if (this._body.scrollHeight > bodyMax) {
      this._body.style.maxHeight = `${bodyMax}px`;
      this._body.style.overflowY = "auto";
      this.classList.add("is-scrollable");
    } else {
      this._body.style.maxHeight = "";
      this._body.style.overflowY = "";
      this.classList.remove("is-scrollable");
    }
  }

  _onSubmit = (event) => {
    event.preventDefault();
    const text = this._composerInput?.value || "";
    if (this._composerInput) this._composerInput.value = "";
    this.dispatchEvent(
      new CustomEvent("composer-submit", {
        bubbles: true,
        detail: { text }
      })
    );
  };

  _onKeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this._composerForm?.requestSubmit();
    }
  };

  /** Call after DOM updates inside the body (new messages, etc.) */
  notifyContentChange() {
    requestAnimationFrame(() => {
      this._updateScrollState();
      if (this.classList.contains("is-scrollable") && this._body) {
        this._body.scrollTop = this._body.scrollHeight;
      }
    });
  }
}

if (!customElements.get("whatimado-frame")) {
  customElements.define("whatimado-frame", WhatimadoFrame);
}
