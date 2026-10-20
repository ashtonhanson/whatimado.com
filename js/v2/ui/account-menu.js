import { onAuthChange, reloadApp, signOut, syncNow } from "../state/auth.js";
import { readSession } from "../state/guest-account.js";

/** @param {any} user */
function displayName(user) {
  const meta = user?.user_metadata || {};
  return String(meta.full_name || "").trim() || user?.email || "Account";
}

/** @param {string} text */
function initialOf(text) {
  const letter = String(text || "").trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

/**
 * What the sidebar bar and the menu header say for this auth state.
 * @param {import("../state/auth.js").AuthState} state
 */
function accountCopy(state) {
  if (state.user) {
    const name = displayName(state.user);
    const sync = state.sync === "error" ? "Not synced" : state.sync === "syncing" ? "Syncing…" : "Synced";
    return {
      member: true,
      name,
      initial: initialOf(name),
      detail: sync,
      menuDetail: name === state.user.email ? sync : state.user.email || sync
    };
  }
  const session = readSession();
  if (state.ready && session?.mode === "account" && session.email) {
    return {
      member: false,
      name: session.email,
      initial: initialOf(session.email),
      detail: "Signed out",
      menuDetail: "Sign in to sync your roadmaps"
    };
  }
  return {
    member: false,
    name: "Guest",
    initial: "",
    detail: "Sign in to back up maps",
    menuDetail: "Saved on this device"
  };
}

/** @param {string} [focusId] */
function openSettings(focusId) {
  document.getElementById("nav-settings")?.click();
  if (!focusId) return;
  requestAnimationFrame(() => {
    const field = document.getElementById(focusId);
    field?.scrollIntoView({ block: "center" });
    field?.focus({ preventScroll: true });
  });
}

export function initAccountMenu() {
  const button = document.getElementById("profile-btn");
  const menu = document.getElementById("account-menu");
  if (!button || !menu) return;

  const items = () => /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]')].filter((el) => !el.hidden));

  const place = () => {
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 248);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;
    menu.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
  };

  const isOpen = () => !menu.hidden;

  /** @param {boolean} [returnFocus] */
  const close = (returnFocus = false) => {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-menu-open");
    if (returnFocus) button.focus();
  };

  const open = () => {
    place();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-menu-open");
    items()[0]?.focus();
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (isOpen()) close();
    else open();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!isOpen()) return;
      const target = /** @type {Node} */ (event.target);
      if (menu.contains(target) || button.contains(target)) return;
      close();
    },
    true
  );
  window.addEventListener("resize", () => close());

  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      close(event.key === "Escape");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    }
  });

  /** @param {string} mode */
  const openAccountSheet = (mode) => document.dispatchEvent(new CustomEvent("v2-open-account", { detail: { mode } }));

  menu.addEventListener("click", async (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-account-action]") : null;
    if (!item) return;
    const action = item.getAttribute("data-account-action");
    const member = !menu.querySelector("[data-account-member]")?.hasAttribute("hidden");
    close();
    if (action === "account") openAccountSheet(member ? "account" : "create");
    else if (action === "signin") openAccountSheet("signin");
    else if (action === "create") openAccountSheet("create");
    else if (action === "sync") void syncNow();
    else if (action === "profile") openSettings("settings-name");
    else if (action === "settings") openSettings();
    else if (action === "feedback") openSettings("settings-suggest-text");
    else if (action === "signout") {
      await signOut();
      reloadApp();
    }
  });

  onAuthChange((state) => {
    const copy = accountCopy(state);
    const name = button.querySelector(".v2-profile-copy strong");
    const detail = button.querySelector(".v2-profile-copy span");
    const guestAvatar = /** @type {HTMLElement | null} */ (button.querySelector("[data-avatar-guest]"));
    const initialAvatar = /** @type {HTMLElement | null} */ (button.querySelector("[data-avatar-initial]"));
    if (name) name.textContent = copy.name;
    if (detail) detail.textContent = copy.detail;
    if (guestAvatar) guestAvatar.hidden = Boolean(copy.initial);
    if (initialAvatar) {
      initialAvatar.hidden = !copy.initial;
      initialAvatar.textContent = copy.initial;
    }
    button.setAttribute("aria-label", `Account menu: ${copy.name}`);

    const headName = menu.querySelector("[data-account-name]");
    const headDetail = menu.querySelector("[data-account-detail]");
    const headAvatar = /** @type {HTMLElement | null} */ (menu.querySelector("[data-account-avatar]"));
    if (headName) headName.textContent = copy.name;
    if (headDetail) headDetail.textContent = copy.menuDetail;
    if (headAvatar) {
      headAvatar.textContent = copy.initial;
      headAvatar.classList.toggle("is-guest", !copy.initial);
    }
    menu.querySelectorAll("[data-account-guest]").forEach((el) => {
      /** @type {HTMLElement} */ (el).hidden = copy.member;
    });
    menu.querySelectorAll("[data-account-member]").forEach((el) => {
      /** @type {HTMLElement} */ (el).hidden = !copy.member;
    });
  });
}
