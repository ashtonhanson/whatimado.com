import { appStore } from "../state/store.js";
import {
  accountUserIdFromEmail,
  ensureGuestUserId,
  isPlausibleEmail,
  loadAccountSnapshot,
  readSession,
  writeSession
} from "../state/guest-account.js";
import { migrateGuestToAccount } from "../state/persistence.js";

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
