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
const SCROLL_BOUNCE_MAX = 12;
const SCROLL_BOUNCE_RELEASE_MS = 480;

const FRAME_TEMPLATE = `
  <div class="whatimado-frame__inner">
    <div class="whatimado-frame__body-wrap">
      <div class="whatimado-frame__body" part="body">
        <div class="whatimado-frame__body-content"></div>
      </div>
      <div class="whatimado-frame__scroll-rail" aria-hidden="true">
        <div class="whatimado-frame__scroll-thumb"></div>
      </div>
    </div>
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
    /** @type {HTMLElement|null} */
    this._bodyContent = null;
    /** @type {HTMLElement|null} */
    this._scrollRail = null;
    /** @type {HTMLElement|null} */
    this._scrollThumb = null;
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
    /** @type {number} */
    this._overscrollY = 0;
    /** @type {number|null} */
    this._bounceReleaseTimer = null;
    /** @type {number|null} */
    this._springCleanupTimer = null;
    /** @type {boolean} */
    this._bounceEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /** @type {number} */
    this._touchStartY = 0;
    /** @type {number} */
    this._touchStartScroll = 0;

    this._onComposerFocus = () => this._pausePlaceholderCycle();
    this._onComposerBlur = () => this._maybeResumePlaceholderCycle();
    this._onComposerInput = () => this._onComposerInputChange();
    this._onBodyScroll = () => {
      this._updateScrollFade();
      this._updateCustomScrollbar();
    };
    this._onWheel = (event) => this._handleWheelOverscroll(event);
    this._onTouchStart = (event) => this._handleTouchStart(event);
    this._onTouchMove = (event) => this._handleTouchMove(event);
    this._onTouchEnd = () => this._releaseOverscroll();
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
    this._body?.addEventListener("scroll", this._onBodyScroll, { passive: true });
    this._body?.addEventListener("wheel", this._onWheel, { passive: false });
    this._body?.addEventListener("touchstart", this._onTouchStart, { passive: true });
    this._body?.addEventListener("touchmove", this._onTouchMove, { passive: false });
    this._body?.addEventListener("touchend", this._onTouchEnd, { passive: true });
    this._body?.addEventListener("touchcancel", this._onTouchEnd, { passive: true });
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
    this._body?.removeEventListener("scroll", this._onBodyScroll);
    this._body?.removeEventListener("wheel", this._onWheel);
    this._body?.removeEventListener("touchstart", this._onTouchStart);
    this._body?.removeEventListener("touchmove", this._onTouchMove);
    this._body?.removeEventListener("touchend", this._onTouchEnd);
    this._body?.removeEventListener("touchcancel", this._onTouchEnd);
    this._clearBounceReleaseTimer();
    this._clearSpringCleanupTimer();
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
    this._bodyContent = this.querySelector(".whatimado-frame__body-content");
    this._scrollRail = this.querySelector(".whatimado-frame__scroll-rail");
    this._scrollThumb = this.querySelector(".whatimado-frame__scroll-thumb");
    this._composerForm = this.querySelector(".whatimado-frame__composer");
    this._composerInput = this.querySelector(".whatimado-frame__composer-input");

    const contentTarget = this._bodyContent || this._body;
    initialChildren.forEach((node) => {
      contentTarget?.appendChild(node);
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

  /** Keep frame anchor fixed — grow downward only (upward expansion comes later) */
  _syncAnchorToContent() {
    const defaultVh = this._readRootVh("--whatimado-frame-top-default") ?? 42;
    document.documentElement.style.setProperty("--whatimado-frame-top", `${defaultVh}vh`);
    this.style.setProperty("--whatimado-frame-top", `${defaultVh}vh`);
  }

  _parseMaxGrowth() {
    return this.getAttribute("max-growth") || "";
  }

  /** Scrollable message area height (flex body-wrap) */
  _availableBodyHeight() {
    const wrap = this.querySelector(".whatimado-frame__body-wrap");
    if (wrap) return Math.max(80, wrap.clientHeight);
    return 120;
  }

  _applyAnchorStyles() {
    const anchorVh = this._parseAnchorVh();
    this.style.setProperty("--whatimado-frame-top", `${anchorVh}vh`);
    const maxGrowth = this._parseMaxGrowth();
    if (maxGrowth) {
      this.style.setProperty("--whatimado-frame-max-h", maxGrowth);
    } else {
      this.style.removeProperty("--whatimado-frame-max-h");
    }
  }

  _observeBody() {
    if (!this._body || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this.notifyContentChange());
    this._resizeObserver.observe(this._body);
    if (this._bodyContent) this._resizeObserver.observe(this._bodyContent);
    this._resizeObserver.observe(this);
  }

  _clearBounceReleaseTimer() {
    if (this._bounceReleaseTimer !== null) {
      window.clearTimeout(this._bounceReleaseTimer);
      this._bounceReleaseTimer = null;
    }
  }

  _clearSpringCleanupTimer() {
    if (this._springCleanupTimer !== null) {
      window.clearTimeout(this._springCleanupTimer);
      this._springCleanupTimer = null;
    }
  }

  _cancelSpringBack() {
    this._clearSpringCleanupTimer();
    this._bodyContent?.classList.remove("is-spring-back");
  }

  _isAtScrollTop() {
    return !!this._body && (this._body.scrollTop <= 0 || this._overscrollY > 0);
  }

  _isAtScrollBottom() {
    if (!this._body) return true;
    return (
      this._body.scrollTop + this._body.clientHeight >= this._body.scrollHeight - 1 ||
      this._overscrollY < 0
    );
  }

  _clampOverscroll(value) {
    return Math.max(-SCROLL_BOUNCE_MAX, Math.min(SCROLL_BOUNCE_MAX, value));
  }

  _applyOverscroll(value) {
    this._cancelSpringBack();
    this._clearBounceReleaseTimer();
    this._overscrollY = this._clampOverscroll(value);
    if (!this._bodyContent) return;
    this._bodyContent.style.transform = this._overscrollY ? `translateY(${this._overscrollY}px)` : "";
    this._updateCustomScrollbar();
  }

  _scheduleOverscrollRelease() {
    this._clearBounceReleaseTimer();
    this._bounceReleaseTimer = window.setTimeout(() => this._releaseOverscroll(), 90);
  }

  _releaseOverscroll() {
    this._clearBounceReleaseTimer();
    if (!this._overscrollY || !this._bodyContent) return;

    const edge = this._overscrollY > 0 ? "top" : "bottom";
    this._cancelSpringBack();
    this._bodyContent.classList.add("is-spring-back");
    this._overscrollY = 0;
    this._bodyContent.style.transform = "translateY(0)";
    this._updateCustomScrollbar();
    this._triggerScrollbarBounce(edge);

    this._clearSpringCleanupTimer();
    this._springCleanupTimer = window.setTimeout(() => {
      this._springCleanupTimer = null;
      this._bodyContent?.classList.remove("is-spring-back");
      if (this._overscrollY === 0 && this._bodyContent) {
        this._bodyContent.style.transform = "";
      }
    }, SCROLL_BOUNCE_RELEASE_MS);
  }

  /** @param {"top"|"bottom"} edge */
  _triggerScrollbarBounce(edge) {
    if (!this._scrollThumb) return;
    this.classList.remove("is-thumb-bounce-top", "is-thumb-bounce-bottom");
    void this.offsetWidth;
    this.classList.add(edge === "top" ? "is-thumb-bounce-top" : "is-thumb-bounce-bottom");
    window.setTimeout(() => {
      this.classList.remove("is-thumb-bounce-top", "is-thumb-bounce-bottom");
    }, SCROLL_BOUNCE_RELEASE_MS);
  }

  _handleWheelOverscroll(event) {
    if (!this._bounceEnabled || !this.classList.contains("is-scrollable") || !this._body) return;

    const atTop = this._isAtScrollTop();
    const atBottom = this._isAtScrollBottom();

    if (atTop && event.deltaY < 0) {
      event.preventDefault();
      this._applyOverscroll(this._overscrollY - event.deltaY * 0.32);
      this._scheduleOverscrollRelease();
      return;
    }

    if (atBottom && event.deltaY > 0) {
      event.preventDefault();
      this._applyOverscroll(this._overscrollY - event.deltaY * 0.32);
      this._scheduleOverscrollRelease();
      return;
    }

    if (this._overscrollY !== 0) {
      this._releaseOverscroll();
    }
  }

  _handleTouchStart(event) {
    if (!this._body || !event.touches[0]) return;
    this._touchStartY = event.touches[0].clientY;
    this._touchStartScroll = this._body.scrollTop;
  }

  _handleTouchMove(event) {
    if (!this._bounceEnabled || !this.classList.contains("is-scrollable") || !this._body || !event.touches[0]) {
      return;
    }

    const deltaY = event.touches[0].clientY - this._touchStartY;
    const atTop = this._isAtScrollTop();
    const atBottom = this._isAtScrollBottom();

    if (atTop && deltaY > 0) {
      event.preventDefault();
      this._applyOverscroll(deltaY * 0.42);
      return;
    }

    if (atBottom && deltaY < 0) {
      event.preventDefault();
      this._applyOverscroll(deltaY * 0.42);
    }
  }

  _updateCustomScrollbar() {
    if (!this._scrollRail || !this._scrollThumb || !this._body) return;

    const scrollable = this.classList.contains("is-scrollable");
    this._scrollRail.hidden = !scrollable;
    if (!scrollable) return;

    const trackHeight = this._scrollRail.clientHeight;
    if (trackHeight <= 0) return;

    const { scrollTop, scrollHeight, clientHeight } = this._body;
    const scrollRange = Math.max(1, scrollHeight - clientHeight);
    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(28, ratio * trackHeight);
    const maxTravel = Math.max(0, trackHeight - thumbHeight);
    const scrollRatio = scrollTop / scrollRange;
    let thumbY = scrollRatio * maxTravel;

    if (this._overscrollY > 0) {
      thumbY -= (this._overscrollY / SCROLL_BOUNCE_MAX) * 10;
    } else if (this._overscrollY < 0) {
      thumbY += (-this._overscrollY / SCROLL_BOUNCE_MAX) * 10;
    }

    this._scrollThumb.style.height = `${thumbHeight}px`;
    this._scrollThumb.style.transform = `translateY(${thumbY}px)`;
  }

  _updateScrollFade() {
    if (!this._body) return;
    const scrollable = this.classList.contains("is-scrollable");
    const fadeTop = scrollable && this._body.scrollTop > 6;
    this.classList.toggle("is-fade-top", fadeTop);
  }

  _updateScrollState() {
    if (!this._body) return;

    const bodyMax = this._availableBodyHeight();
    const scrollable = this._body.scrollHeight > bodyMax + 1;

    if (scrollable) {
      this._body.style.maxHeight = `${bodyMax}px`;
      this._body.style.overflowY = "auto";
      this.classList.add("is-scrollable");
    } else {
      this._body.style.maxHeight = "";
      this._body.style.overflowY = "";
      this.classList.remove("is-scrollable");
    }

    this._updateScrollFade();
    this._updateCustomScrollbar();
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
        this._updateScrollFade();
      }
    });
  }
}

if (!customElements.get("whatimado-frame")) {
  customElements.define("whatimado-frame", WhatimadoFrame);
}
