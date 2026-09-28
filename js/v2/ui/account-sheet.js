import { appStore } from "../state/store.js";
import { ensureGuestUserId, isPlausibleEmail, loadAccountSnapshot, readSession, writeSession } from "../state/guest-account.js";
import {
  authState,
  createAccount,
  onAuthChange,
  reloadApp,
  requestPasswordReset,
  signIn,
  signOut,
  syncNow,
  updatePassword
} from "../state/auth.js";

const ACK_KEY = "whatimado_v2_guest_ack";

function acknowledge() {
  try {
    window.localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** @param {import("../state/auth.js").AuthState} state */
function syncLine(state) {
  if (state.sync === "syncing") return "Syncing your roadmaps…";
  if (state.sync === "ok") return "Roadmaps backed up to your account.";
  if (state.sync === "error") return `Not synced yet: ${state.syncError}`;
  if (state.sync === "offline") return "Offline. Roadmaps are saved on this device and sync when you're back.";
  return "Roadmaps save on this device and back up to your account.";
}

/** @param {import("../state/auth.js").AuthState} state */
function profileCopy(state) {
  const name = document.querySelector("#profile-btn strong");
  const detail = document.querySelector("#profile-btn .v2-profile-copy span");
  const note = document.querySelector(".v2-sync-note");
  if (!name || !detail) return;
  const session = readSession();
  if (state.user) {
    name.textContent = state.user.email || "Account";
    detail.textContent = state.sync === "error" ? "Not synced" : state.sync === "syncing" ? "Syncing…" : "Synced";
    if (note) note.textContent = "Signed in. Roadmaps back up to your account.";
    return;
  }
  if (state.ready && session?.mode === "account") {
    name.textContent = session.email || "Account";
    detail.textContent = "Sign in to sync";
    if (note) note.textContent = "Signed out. Maps still save on this device.";
    return;
  }
  name.textContent = "Guest";
  detail.textContent = "Create account";
  if (note) note.textContent = "Maps auto-save on this device. Create an account to back them up.";
}

/** @param {HTMLElement | null} root */
function renderImports(root) {
  if (!root) return;
  const session = readSession();
  const account = session?.mode === "account" ? loadAccountSnapshot(session.userId) : null;
  const imported = account?.importedRoadmaps || [];
  root.replaceChildren();
  if (!imported.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "Saved from earlier guest maps";
  const list = document.createElement("ul");
  for (const item of imported) {
    const li = document.createElement("li");
    li.textContent = item.title || "Guest roadmap";
    list.append(li);
  }
  root.append(heading, list);
}

/**
 * @param {HTMLButtonElement | null | undefined} button
 * @param {boolean} busy
 */
function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
}

export function initAccountSheet() {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("account-sheet"));
  const opener = document.getElementById("profile-btn");
  if (!dialog || !opener) return;

  const guestView = document.getElementById("account-guest-view");
  const memberView = document.getElementById("account-member-view");
  const guestForm = document.getElementById("account-guest-form");
  const createForm = /** @type {HTMLFormElement | null} */ (document.getElementById("account-create-form"));
  const signinForm = /** @type {HTMLFormElement | null} */ (document.getElementById("account-signin-form"));
  const recoveryForm = /** @type {HTMLFormElement | null} */ (document.getElementById("account-recovery-form"));
  const signinOpen = document.getElementById("account-signin-open");
  const status = document.getElementById("account-status");
  const signinStatus = document.getElementById("account-signin-status");
  const recoveryStatus = document.getElementById("account-recovery-status");
  const memberEmail = document.getElementById("account-member-email");
  const memberSync = document.getElementById("account-member-sync");
  const imports = document.getElementById("account-imports");

  const open = () => {
    if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  };

  /** @param {boolean} on */
  const showSignIn = (on) => {
    if (!signinForm || !createForm) return;
    signinForm.hidden = !on;
    createForm.hidden = on;
    signinOpen?.setAttribute("aria-expanded", on ? "true" : "false");
    if (signinStatus) signinStatus.textContent = "";
    if (on) document.getElementById("account-signin-email")?.focus();
  };

  /** @param {import("../state/auth.js").AuthState} state */
  const render = (state) => {
    profileCopy(state);
    const signedIn = Boolean(state.user);
    if (recoveryForm) recoveryForm.hidden = !state.recovering;
    if (guestView) guestView.hidden = signedIn || state.recovering;
    if (memberView) memberView.hidden = !signedIn || state.recovering;
    if (memberEmail) memberEmail.textContent = state.user?.email || "";
    if (memberSync) memberSync.textContent = syncLine(state);
    renderImports(imports);
    if (state.recovering) {
      open();
      document.getElementById("account-new-password")?.focus();
    }
  };

  onAuthChange(render);
  opener.addEventListener("click", open);
  document.addEventListener("v2-open-account", (event) => {
    open();
    showSignIn(/** @type {CustomEvent} */ (event).detail?.mode === "signin");
  });

  signinOpen?.addEventListener("click", () => showSignIn(signinForm?.hidden ?? false));
  document.getElementById("account-signin-back")?.addEventListener("click", () => {
    showSignIn(false);
    document.getElementById("account-email")?.focus();
  });
  dialog.addEventListener("close", () => showSignIn(false));

  signinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(/** @type {HTMLInputElement | null} */ (document.getElementById("account-signin-email"))?.value || "").trim();
    const passwordField = /** @type {HTMLInputElement | null} */ (document.getElementById("account-signin-password"));
    const password = String(passwordField?.value || "");
    if (!isPlausibleEmail(email)) {
      if (signinStatus) signinStatus.textContent = "Enter the email you signed up with.";
      return;
    }
    if (!password) {
      if (signinStatus) signinStatus.textContent = "Enter your password.";
      return;
    }
    const submit = signinForm.querySelector('button[type="submit"]');
    setBusy(/** @type {HTMLButtonElement} */ (submit), true);
    if (signinStatus) signinStatus.textContent = "Signing in…";
    const result = await signIn(email, password);
    setBusy(/** @type {HTMLButtonElement} */ (submit), false);
    if (!result.ok) {
      if (signinStatus) signinStatus.textContent = result.message || "Could not sign in.";
      return;
    }
    if (passwordField) passwordField.value = "";
    acknowledge();
    if (signinStatus) {
      signinStatus.textContent = result.keptGuest
        ? "Signed in. Your guest roadmap moved onto the account. Opening it…"
        : "Signed in. Opening your roadmap…";
    }
    reloadApp();
  });

  document.getElementById("account-forgot")?.addEventListener("click", async () => {
    const email = String(/** @type {HTMLInputElement | null} */ (document.getElementById("account-signin-email"))?.value || "").trim();
    if (!isPlausibleEmail(email)) {
      if (signinStatus) signinStatus.textContent = "Type your email above, then choose Forgot password.";
      return;
    }
    if (signinStatus) signinStatus.textContent = "Sending a reset link…";
    const result = await requestPasswordReset(email);
    if (signinStatus) {
      signinStatus.textContent = result.ok
        ? "If an account uses that email, a reset link is on its way. Check spam too."
        : result.message || "Could not send the reset link.";
    }
  });

  guestForm?.addEventListener("submit", () => {
    writeSession({ mode: "guest", userId: ensureGuestUserId() });
    acknowledge();
    profileCopy(authState());
    if (status) status.textContent = "";
  });

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(/** @type {HTMLInputElement | null} */ (document.getElementById("account-email"))?.value || "").trim();
    const passwordField = /** @type {HTMLInputElement | null} */ (document.getElementById("account-password"));
    const password = String(passwordField?.value || "");
    if (!isPlausibleEmail(email)) {
      if (status) status.textContent = "Enter an email address.";
      return;
    }
    if (password.length < 8) {
      if (status) status.textContent = "Use at least 8 characters.";
      return;
    }
    const submit = createForm.querySelector('button[type="submit"]');
    setBusy(/** @type {HTMLButtonElement} */ (submit), true);
    if (status) status.textContent = "Creating your account…";
    const result = await createAccount(email, password);
    setBusy(/** @type {HTMLButtonElement} */ (submit), false);
    if (!result.ok) {
      if (status) status.textContent = result.message || "Could not create the account.";
      if (result.duplicate) {
        showSignIn(true);
        const field = /** @type {HTMLInputElement | null} */ (document.getElementById("account-signin-email"));
        if (field) field.value = email;
        if (signinStatus) signinStatus.textContent = result.message || "";
      }
      return;
    }
    if (passwordField) passwordField.value = "";
    acknowledge();
    if (result.needsConfirmation) {
      if (status) {
        status.textContent =
          "Check your email to confirm the account. This roadmap stays here and moves onto the account when you open the link or sign in.";
      }
      return;
    }
    if (status) {
      status.textContent = result.replacedLive
        ? "Account created. This roadmap is now on your account."
        : "Account created. Your account already had a roadmap, so this one was saved beside it with today's date.";
    }
    reloadApp();
  });

  recoveryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = /** @type {HTMLInputElement | null} */ (document.getElementById("account-new-password"));
    const password = String(field?.value || "");
    if (password.length < 8) {
      if (recoveryStatus) recoveryStatus.textContent = "Use at least 8 characters.";
      return;
    }
    if (recoveryStatus) recoveryStatus.textContent = "Saving…";
    const result = await updatePassword(password);
    if (!result.ok) {
      if (recoveryStatus) recoveryStatus.textContent = result.message || "Could not save the password.";
      return;
    }
    if (field) field.value = "";
    acknowledge();
    if (recoveryStatus) recoveryStatus.textContent = "Password saved. Opening your roadmap…";
    reloadApp();
  });

  document.getElementById("account-sync-now")?.addEventListener("click", () => void syncNow());
  document.getElementById("account-signout")?.addEventListener("click", async (event) => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    setBusy(button, true);
    const result = await signOut();
    if (!result.synced && memberSync) memberSync.textContent = "Signed out. The last changes are still on this device.";
    reloadApp();
  });

  let acknowledged = false;
  try {
    acknowledged = window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    acknowledged = true;
  }
  if (!acknowledged && !appStore.journey?.id && readSession()?.mode !== "account") open();
}
