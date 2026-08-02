/** Example prompts cycled in the composer when empty */
const EXAMPLE_PROMPTS = [
  "Share what's going on…",
  "I just lost my job and need a plan…",
  "Help me explore a career change…",
  "I'm stuck — not sure what path fits me…",
  "I want training options near me…"
];

const PLACEHOLDER_FADE_MS = 450;
const PLACEHOLDER_CYCLE_MS_MIN = 5000;
const PLACEHOLDER_CYCLE_MS_MAX = 7000;

const FRAME_TEMPLATE = `
  <div class="whatimado-frame__inner">
    <div class="whatimado-frame__body" part="body"></div>
    <form class="whatimado-frame__composer" part="composer" novalidate>
      <label class="sr-only" for="whatimado-composer-input">Your message</label>
      <textarea
        id="whatimado-composer-input"
        class="whatimado-frame__composer-input"
        rows="1"
        placeholder=""
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
    /** @type {boolean} */
    this._built = false;
    /** @type {number|null} */
    this._placeholderTimer = null;
    /** @type {number} */
    this._placeholderIndex = 0;
    /** @type {boolean} */
    this._placeholderPaused = false;

    this._onComposerFocus = () => this._pausePlaceholderCycle();
    this._onComposerBlur = () => this._maybeResumePlaceholderCycle();
    this._onComposerInput = () => this._onComposerInputChange();
  }

  connectedCallback() {
    if (!this._built) this._build();
    this._applyAnchorStyles();
    this._observeBody();
    this._composerForm?.addEventListener("submit", this._onSubmit);
    this._composerInput?.addEventListener("keydown", this._onKeydown);
    this._composerInput?.addEventListener("focus", this._onComposerFocus);
    this._composerInput?.addEventListener("blur", this._onComposerBlur);
    this._composerInput?.addEventListener("input", this._onComposerInput);
    this._initPlaceholderCycle();
    requestAnimationFrame(() => this._updateScrollState());
  }

  disconnectedCallback() {
    this._stopPlaceholderCycle();
    this._resizeObserver?.disconnect();
    this._composerForm?.removeEventListener("submit", this._onSubmit);
    this._composerInput?.removeEventListener("keydown", this._onKeydown);
    this._composerInput?.removeEventListener("focus", this._onComposerFocus);
    this._composerInput?.removeEventListener("blur", this._onComposerBlur);
    this._composerInput?.removeEventListener("input", this._onComposerInput);
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
    const fromRoot = getComputedStyle(document.documentElement)
      .getPropertyValue("--whatimado-frame-top")
      .trim();
    const rootMatch = fromRoot.match(/^([\d.]+)vh$/);
    if (rootMatch) {
      const num = Number.parseFloat(rootMatch[1]);
      if (Number.isFinite(num)) return num;
    }

    const raw = this.getAttribute("anchor");
    const num = raw ? Number.parseFloat(raw) : 42;
    return Number.isFinite(num) ? num : 42;
  }

  /** @param {string} token */
  _readRootVh(token) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const match = raw.match(/^([\d.]+)vh$/);
    return match ? Number.parseFloat(match[1]) : null;
  }

  /** Grow/shrink frame anchor with content while preserving minimum map band */
  _syncAnchorToContent() {
    const bottomPad = 16;
    const defaultVh = this._readRootVh("--whatimado-frame-top-default") ?? 42;
    const minMapVh = this._readRootVh("--v2-map-min-band") ?? 28;

    if (this._body) {
      this._body.style.maxHeight = "";
      this._body.style.overflowY = "";
    }
    this.classList.remove("is-scrollable");

    const frameHeight = this.getBoundingClientRect().height;
    const maxBottom = window.innerHeight - bottomPad;
    let idealTopPx = maxBottom - frameHeight;
    const minTopPx = (window.innerHeight * minMapVh) / 100;
    const maxTopPx = (window.innerHeight * defaultVh) / 100;

    idealTopPx = Math.max(minTopPx, Math.min(maxTopPx, idealTopPx));
    const anchorVh = (idealTopPx / window.innerHeight) * 100;

    document.documentElement.style.setProperty("--whatimado-frame-top", `${anchorVh.toFixed(2)}vh`);
    this.style.setProperty("--whatimado-frame-top", `${anchorVh.toFixed(2)}vh`);
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
    this._resizeObserver = new ResizeObserver(() => this.notifyContentChange());
    this._resizeObserver.observe(this._body);
    this._resizeObserver.observe(this);
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
    this._maybeResumePlaceholderCycle();
    this.dispatchEvent(
      new CustomEvent("composer-submit", {
        bubbles: true,
        detail: { text }
      })
    );
  };

  _initPlaceholderCycle() {
    if (!this._composerInput || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (this._composerInput) {
        this._composerInput.placeholder = EXAMPLE_PROMPTS[0];
      }
      return;
    }
    this._placeholderIndex = 0;
    this._composerInput.placeholder = EXAMPLE_PROMPTS[0];
    this._schedulePlaceholderCycle();
  }

  _schedulePlaceholderCycle() {
    this._stopPlaceholderCycle();
    if (this._placeholderPaused || this._composerInput?.value.trim()) return;

    const delay = PLACEHOLDER_CYCLE_MS_MIN + Math.random() * (PLACEHOLDER_CYCLE_MS_MAX - PLACEHOLDER_CYCLE_MS_MIN);
    this._placeholderTimer = window.setTimeout(() => this._advancePlaceholder(), delay);
  }

  _stopPlaceholderCycle() {
    if (this._placeholderTimer !== null) {
      window.clearTimeout(this._placeholderTimer);
      this._placeholderTimer = null;
    }
  }

  _pausePlaceholderCycle() {
    this._placeholderPaused = true;
    this._stopPlaceholderCycle();
    this._composerInput?.classList.remove("is-placeholder-fading");
  }

  _maybeResumePlaceholderCycle() {
    if (this._composerInput?.value.trim()) return;
    this._placeholderPaused = false;
    this._schedulePlaceholderCycle();
  }

  _onComposerInputChange() {
    if (this._composerInput?.value.trim()) {
      this._pausePlaceholderCycle();
    } else if (document.activeElement !== this._composerInput) {
      this._maybeResumePlaceholderCycle();
    }
  }

  _advancePlaceholder() {
    if (!this._composerInput || this._placeholderPaused || this._composerInput.value.trim()) return;

    this._composerInput.classList.add("is-placeholder-fading");
    window.setTimeout(() => {
      if (!this._composerInput || this._placeholderPaused || this._composerInput.value.trim()) return;

      this._placeholderIndex = (this._placeholderIndex + 1) % EXAMPLE_PROMPTS.length;
      this._composerInput.placeholder = EXAMPLE_PROMPTS[this._placeholderIndex];
      this._composerInput.classList.remove("is-placeholder-fading");
      this._schedulePlaceholderCycle();
    }, PLACEHOLDER_FADE_MS);
  }

  _onKeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this._composerForm?.requestSubmit();
    }
  };

  /** Call after DOM updates inside the body (new messages, etc.) */
  notifyContentChange() {
    requestAnimationFrame(() => {
      this._syncAnchorToContent();
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
