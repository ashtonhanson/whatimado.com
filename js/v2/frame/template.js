/**
 * @param {{ inputLabel?: string, sendLabel?: string }} [labels]
 */
export function buildFrameTemplate(labels = {}) {
  const inputLabel = labels.inputLabel || "Your message";
  const sendLabel = labels.sendLabel || "Send";

  return `
  <div class="whatimado-frame__inner">
    <div
      class="whatimado-frame__drag-rail"
      part="drag-rail"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Drag to reposition chat panel"
      tabindex="0"
    >
      <span class="whatimado-frame__drag-grip" aria-hidden="true"></span>
    </div>
    <div class="whatimado-frame__body-wrap">
      <div class="whatimado-frame__body" part="body">
        <div class="whatimado-frame__body-content"></div>
      </div>
      <div class="whatimado-frame__scroll-rail" aria-hidden="true">
        <div class="whatimado-frame__scroll-thumb"></div>
      </div>
    </div>
    <button
      type="button"
      class="whatimado-frame__scroll-bottom"
      aria-label="Scroll to bottom"
      aria-hidden="true"
      tabindex="-1"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
          d="M5.2 7.6 10 12.4 14.8 7.6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>
      </svg>
    </button>
    <form class="whatimado-frame__composer" part="composer" novalidate>
      <label class="sr-only" for="whatimado-composer-input">${inputLabel}</label>
      <textarea
        id="whatimado-composer-input"
        class="whatimado-frame__composer-input"
        rows="1"
        placeholder=""
        autocomplete="off"
      ></textarea>
      <button type="submit" class="whatimado-frame__composer-send">${sendLabel}</button>
    </form>
  </div>
`;
}
