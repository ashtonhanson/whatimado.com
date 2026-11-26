import { initBrand } from "./config.js";
import { initChatFlow } from "./ui/chat-flow.js?v=20261126-demo-gap3";
import { initNeonShine } from "./neon-shine.js";
import { initNavRailToggle } from "./rail-toggle.js";
import { initMobileNav } from "./mobile-nav.js";
import { initAccountSheet } from "./ui/account-sheet.js";
import { initAccountMenu } from "./ui/account-menu.js";
import { initPages } from "./ui/pages.js";
import { initAuth } from "./state/auth.js";
import { trackEvent } from "./state/analytics.js";
import { initShareMeta } from "./share-meta.js";
import { initAmbientOrbs } from "./ambient-orbs.js?v=20261126-demo-gap3";

await initBrand();
await import("./components/whatimado-frame.js?v=20261126-demo-gap3");
await import("./components/whatimado-map.js?v=20261126-demo-gap3");

/** @type {import("./components/whatimado-frame.js").WhatimadoFrame|null} */
const frameEl = document.getElementById("dynamic-frame");
/** @type {import("./components/whatimado-map.js").WhatimadoMap|null} */
const mapEl = document.getElementById("possibility-map");

initChatFlow({
  frameEl,
  mapEl,
  mainEl: document.querySelector(".v2-main"),
  messagesEl: document.getElementById("messages"),
  activePathEl: document.getElementById("active-path-label"),
  selectionPanel: document.getElementById("selection-panel"),
  pathCardsEl: document.getElementById("path-cards")
});

initNeonShine();
initAmbientOrbs();
initNavRailToggle();
initMobileNav();
initAccountSheet();
initAccountMenu();
initPages();
initShareMeta();
void initAuth();
trackEvent("app_loaded");

const isMobile = window.matchMedia("(max-width: 900px)").matches;
const settleHomeTitles = () => {
  /* Refit + title layout once the shell is visible (layout while opacity 0 can hide Mission/Next Step). */
  requestAnimationFrame(() => {
    mapEl?.syncFrameGravity?.({ animate: false });
    mapEl?._layoutCallouts?.();
  });
};
if (isMobile) {
  /** Safety: never leave the mobile shell permanently hidden if dock init stalls. */
  window.setTimeout(() => {
    document.body.classList.add("is-mobile-shell-ready");
    settleHomeTitles();
  }, 1200);
  const readyWatch = new MutationObserver(() => {
    if (!document.body.classList.contains("is-mobile-shell-ready")) return;
    readyWatch.disconnect();
    settleHomeTitles();
  });
  readyWatch.observe(document.body, { attributes: true, attributeFilter: ["class"] });
} else {
  /* Desktop: fade map/frame/orbs together once custom elements have connected. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add("is-shell-ready");
      settleHomeTitles();
    });
  });
}
