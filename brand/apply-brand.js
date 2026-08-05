/**
 * Apply white-label brand JSON to the v2 shell (CSS vars + DOM copy).
 * @param {Record<string, unknown>} brand
 * @param {Document} [doc]
 */
export function applyBrand(brand, doc = document) {
  const root = doc.documentElement;
  const { colors, fonts, layout, wordmark, hero, composer, map, shell, productName, pageTitle, favicon, homeUrl } =
    brand;

  if (pageTitle) doc.title = String(pageTitle);

  const faviconEl = doc.querySelector('link[rel="icon"]');
  if (favicon && faviconEl instanceof HTMLLinkElement) faviconEl.href = String(favicon);

  if (colors && typeof colors === "object") {
    const colorMap = {
      bg: "--v2-bg",
      bgGradient: "--v2-bg-gradient",
      teal: "--v2-teal",
      tealDim: "--v2-teal-dim",
      neonTeal: "--v2-neon-teal",
      yellow: "--v2-yellow",
      yellowBright: "--v2-yellow-bright",
      yellowDim: "--v2-yellow-dim",
      brandDo: "--v2-brand-do",
      text: "--v2-text",
      textMuted: "--v2-text-muted"
    };
    for (const [key, varName] of Object.entries(colorMap)) {
      if (colors[key] != null) root.style.setProperty(varName, String(colors[key]));
    }
  }

  if (fonts && typeof fonts === "object") {
    if (fonts.body) root.style.setProperty("--v2-font-body", String(fonts.body));
    if (fonts.hero) root.style.setProperty("--v2-font-hero", String(fonts.hero));
  }

  if (layout && typeof layout === "object") {
    if (layout.frameTopDefault != null) {
      root.style.setProperty("--whatimado-frame-top-default", String(layout.frameTopDefault));
    }
    if (layout.frameMaxWidth != null) {
      root.style.setProperty("--v2-frame-max-width", String(layout.frameMaxWidth));
    }
    if (layout.homePromptMaxWidth != null) {
      root.style.setProperty("--v2-home-prompt-max-width", String(layout.homePromptMaxWidth));
    }
  }

  applyWordmark(doc, wordmark, { productName, homeUrl });
  applyHero(doc, hero);
  applyShellCopy(doc, shell);
  applyMapAria(doc, map);
  applyComposerLabels(doc, composer);
  applyMapYouButton(doc, map);
}

/** @param {Document} doc @param {Record<string, unknown>|undefined} composer */
function applyComposerLabels(doc, composer) {
  if (!composer || typeof composer !== "object") return;

  const sendBtn = doc.querySelector(".whatimado-frame__composer-send");
  if (sendBtn && composer.sendLabel) sendBtn.textContent = String(composer.sendLabel);

  const label = doc.querySelector('label[for="whatimado-composer-input"]');
  if (label && composer.inputLabel) label.textContent = String(composer.inputLabel);
}

/** @param {Document} doc @param {Record<string, unknown>|undefined} map */
function applyMapYouButton(doc, map) {
  if (!map || typeof map !== "object") return;

  const youBtn = doc.querySelector(".whatimado-map__you-btn");
  if (youBtn && map.youButtonLabel) youBtn.textContent = String(map.youButtonLabel);
  if (youBtn && map.youButtonAriaLabel) {
    youBtn.setAttribute("aria-label", String(map.youButtonAriaLabel));
  }
}

/**
 * @param {Document} doc
 * @param {Record<string, unknown>|undefined} wordmark
 * @param {{ productName?: string, homeUrl?: string }} meta
 */
function applyWordmark(doc, wordmark, meta) {
  if (!wordmark || typeof wordmark !== "object") return;

  const brandLink = doc.querySelector(".v2-brand");
  if (brandLink instanceof HTMLAnchorElement) {
    if (meta.homeUrl) brandLink.href = String(meta.homeUrl);
    if (wordmark.homeAriaLabel || meta.productName) {
      brandLink.setAttribute("aria-label", String(wordmark.homeAriaLabel || `${meta.productName} home`));
    }
  }

  const wordEl = doc.querySelector(".v2-brand-word");
  if (wordEl && Array.isArray(wordmark.segments)) {
    wordEl.innerHTML = wordmark.segments
      .map((seg) => {
        const s = /** @type {{ text?: string, className?: string }} */ (seg);
        return `<span class="${s.className || ""}">${escapeText(s.text || "")}</span>`;
      })
      .join("");
  }

  const markEl = doc.querySelector(".v2-brand-mark");
  if (markEl && wordmark.markLetter) {
    markEl.textContent = String(wordmark.markLetter);
  }
}

/** @param {Document} doc @param {Record<string, unknown>|undefined} hero */
function applyHero(doc, hero) {
  if (!hero || typeof hero !== "object") return;

  const kickerBrand = doc.querySelector(".v2-kicker-brand");
  if (kickerBrand && Array.isArray(hero.titleParts)) {
    if (hero.ariaLabel) kickerBrand.setAttribute("aria-label", String(hero.ariaLabel));
    kickerBrand.innerHTML = hero.titleParts
      .map((part, i) => {
        const p = /** @type {{ text?: string, className?: string }} */ (part);
        const space =
          i < hero.titleParts.length - 1
            ? '<span class="v2-kicker-space" aria-hidden="true"> </span>'
            : "";
        return `<span class="${p.className || ""}">${escapeText(p.text || "")}</span>${space}`;
      })
      .join("");
  }

  const subEl = doc.querySelector(".v2-kicker-sub");
  if (subEl && hero.subtitle) {
    const breakBefore = hero.subtitleBreakBefore;
    const text = String(hero.subtitle);
    if (breakBefore && text.includes(String(breakBefore))) {
      const idx = text.indexOf(String(breakBefore));
      const before = text.slice(0, idx).trimEnd();
      const after = text.slice(idx);
      subEl.innerHTML = `${escapeText(before)}<br class="v2-kicker-sub-br" /> ${escapeText(after)}`;
    } else {
      subEl.textContent = text;
    }
  }
}

/** @param {Document} doc @param {Record<string, unknown>|undefined} shell */
function applyShellCopy(doc, shell) {
  if (!shell || typeof shell !== "object") return;

  const syncNote = doc.querySelector(".v2-sync-note");
  if (syncNote && shell.syncNote) syncNote.textContent = String(shell.syncNote);

  const activePath = doc.getElementById("active-path-label");
  const empty = shell.activePathEmpty;
  if (activePath && empty && typeof empty === "object") {
    const e = /** @type {{ title?: string, body?: string }} */ (empty);
    activePath.innerHTML = `<strong>${escapeText(e.title || "")}</strong>${escapeText(e.body || "")}`;
  }

  const region = doc.querySelector(".v2-resources-region");
  if (region && shell.resourcesRegion) region.textContent = String(shell.resourcesRegion);
}

/** @param {Document} doc @param {Record<string, unknown>|undefined} map */
function applyMapAria(doc, map) {
  if (!map || typeof map !== "object") return;
  const mapEl = doc.getElementById("possibility-map");
  if (mapEl && map.possibilityMapAriaLabel) {
    mapEl.setAttribute("aria-label", String(map.possibilityMapAriaLabel));
  }
}

/** @param {string} text */
function escapeText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
