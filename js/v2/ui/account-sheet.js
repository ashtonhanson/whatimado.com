import { appStore } from "../state/store.js";
import {
  accountUserIdFromEmail,
  ensureGuestUserId,
  isPlausibleEmail,
  loadAccountSnapshot,
  readSession,
  writeSession
} from "../state/guest-account.js";
import { migrateGuestToAccount, signInToAccount } from "../state/persistence.js";

const ACK_KEY = "whatimado_v2_guest_ack";

function profileCopy(session) {
  const name = document.querySelector("#profile-btn strong");
  const detail = document.querySelector("#profile-btn .v2-profile-copy span");
  if (!name || !detail) return;
  if (session?.mode === "account") {
    name.textContent = session.email || "Account";
    detail.textContent = "Roadmap saved on this device";
    return;
  }
  name.textContent = "Guest";
  detail.textContent = "Create account";
}

function renderImports(root, session) {
  if (!root) return;
  const account = session?.mode === "account" ? loadAccountSnapshot(session.userId) : null;
  const imported = account?.importedRoadmaps || [];
  if (!imported.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `
    <h3>Saved from earlier guest maps</h3>
    <ul>
      ${imported
        .map((item) => `<li>${item.title || "Guest roadmap"}</li>`)
        .join("")}
    </ul>
  `;
}

export function initAccountSheet() {
  const dialog = document.getElementById("account-sheet");
  const opener = document.getElementById("profile-btn");
  const guestForm = document.getElementById("account-guest-form");
  const createForm = document.getElementById("account-create-form");
  const status = document.getElementById("account-status");
  const imports = document.getElementById("account-imports");
  if (!dialog || !opener) return;

  const session = readSession();
  profileCopy(session);
  renderImports(imports, session);

  opener.addEventListener("click", () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
  });

  const signinForm = document.getElementById("account-signin-form");
  const signinOpen = document.getElementById("account-signin-open");
  const signinStatus = document.getElementById("account-signin-status");

  /** @param {boolean} on */
  const showSignIn = (on) => {
    if (!signinForm || !createForm) return;
    signinForm.hidden = !on;
    createForm.hidden = on;
    signinOpen?.setAttribute("aria-expanded", on ? "true" : "false");
    if (signinStatus) signinStatus.textContent = "";
    if (on) document.getElementById("account-signin-email")?.focus();
  };

  signinOpen?.addEventListener("click", () => showSignIn(signinForm?.hidden ?? false));
  document.getElementById("account-signin-back")?.addEventListener("click", () => {
    showSignIn(false);
    document.getElementById("account-email")?.focus();
  });
  dialog.addEventListener("close", () => showSignIn(false));

  signinForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = String(document.getElementById("account-signin-email")?.value || "").trim();
    const password = String(document.getElementById("account-signin-password")?.value || "");
    if (!isPlausibleEmail(email)) {
      if (signinStatus) signinStatus.textContent = "Enter the email you signed up with.";
      return;
    }
    if (!password) {
      if (signinStatus) signinStatus.textContent = "Enter your password.";
      return;
    }
    const result = signInToAccount(email);
    if (!result.ok) {
      if (signinStatus) signinStatus.textContent = "No account with that email on this device yet. Create one instead.";
      return;
    }
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    if (signinStatus) {
      signinStatus.textContent = result.keptGuest
        ? "Signed in. Your guest roadmap moved onto the account. Opening it…"
        : "Signed in. Opening your roadmap…";
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.location.assign(`${url.pathname}${url.hash}`);
  });

  guestForm?.addEventListener("submit", () => {
    ensureGuestUserId();
    writeSession({ mode: "guest", userId: ensureGuestUserId() });
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    profileCopy(readSession());
    if (status) status.textContent = "";
  });

  createForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = String(document.getElementById("account-email")?.value || "").trim();
    const password = String(document.getElementById("account-password")?.value || "");
    if (!isPlausibleEmail(email)) {
      if (status) status.textContent = "Enter an email address.";
      return;
    }
    if (password.length < 8) {
      if (status) status.textContent = "Use at least 8 characters. The password is not saved on this device.";
      return;
    }
    const userId = accountUserIdFromEmail(email);
    const moved = migrateGuestToAccount(userId, email);
    if (!moved.imported) {
      if (status) status.textContent = "Start a roadmap first, then create the account so there is something to keep.";
      return;
    }
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    const next = readSession();
    profileCopy(next);
    renderImports(imports, next);
    if (status) {
      status.textContent = moved.replacedLive
        ? "This roadmap is now on your account on this device."
        : "Your account already had a roadmap. This guest map was saved beside it with today's date.";
    }
    const passwordField = document.getElementById("account-password");
    if (passwordField) passwordField.value = "";
  });

  let acknowledged = false;
  try {
    acknowledged = window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    acknowledged = true;
  }
  if (!acknowledged && !appStore.journey?.id && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}
