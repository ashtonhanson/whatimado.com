import { initBrand } from "./config.js";
import { initChatFlow } from "./ui/chat-flow.js";
import { initNeonShine } from "./neon-shine.js";
import { initNavRailToggle } from "./rail-toggle.js";
import { initMobileNav } from "./mobile-nav.js";
import { initAccountSheet } from "./ui/account-sheet.js";
import { initAccountMenu } from "./ui/account-menu.js";
import { initPages } from "./ui/pages.js";
import { initAuth } from "./state/auth.js";
import { trackEvent } from "./state/analytics.js";

await initBrand();
await import("./components/whatimado-frame.js");
await import("./components/whatimado-map.js");

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
initNavRailToggle();
initMobileNav();
initAccountSheet();
initAccountMenu();
initPages();
void initAuth();
trackEvent("app_loaded");

/** Safety: never leave the mobile shell permanently hidden if dock init stalls. */
if (window.matchMedia("(max-width: 900px)").matches) {
  window.setTimeout(() => {
    document.body.classList.add("is-mobile-shell-ready");
  }, 1200);
}
