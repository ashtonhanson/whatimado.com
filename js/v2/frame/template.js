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
