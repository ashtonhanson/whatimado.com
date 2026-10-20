/**
 * Same-browser composer draft persistence, scoped to session owner + journey id.
 */
import { appStore } from "./store.js";
import { ensureGuestUserId, readSession } from "./guest-account.js";

const STORAGE_KEY = "whatimado_v2_composer_draft";
const DEBOUNCE_MS = 300;

let saveTimer = 0;
let lifecycleBound = false;

/** @returns {string} */
export function getComposerDraftScopeKey() {
  const session = readSession();
  const owner =
    session?.mode === "account" && session.userId
      ? `account:${session.userId}`
      : `guest:${ensureGuestUserId()}`;
  const journeyId = appStore.journey?.id || "pre-journey";
  return `${owner}:${journeyId}`;
}

/** @returns {{ scope: string, text: string, savedAt: number } | null} */
function readRecord() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      scope: String(parsed.scope || ""),
      text: String(parsed.text ?? ""),
      savedAt: Number(parsed.savedAt) || 0
    };
  } catch {
    return null;
  }
}

/** @returns {string} */
export function readComposerDraftForCurrentScope() {
  const record = readRecord();
  if (!record || record.scope !== getComposerDraftScopeKey()) return "";
  return record.text;
}

export function cancelPendingComposerDraftSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
  }
}

/** @param {string} text */
function writeComposerDraftNow(text) {
  const scope = getComposerDraftScopeKey();
  if (!text) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ scope, text, savedAt: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

/** @param {string} text */
export function scheduleComposerDraftSave(text) {
  cancelPendingComposerDraftSave();
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    writeComposerDraftNow(text);
  }, DEBOUNCE_MS);
}

export function flushComposerDraftSave(text) {
  cancelPendingComposerDraftSave();
  writeComposerDraftNow(text);
}

export function clearComposerDraft() {
  cancelPendingComposerDraftSave();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function bindComposerDraftLifecycle() {
  if (lifecycleBound) return;
  lifecycleBound = true;
  const flushFromDom = () => {
    const el = document.querySelector(".whatimado-frame__composer-input");
    const value = el instanceof HTMLTextAreaElement ? el.value : "";
    flushComposerDraftSave(value);
  };
  window.addEventListener("pagehide", flushFromDom);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushFromDom();
  });
}
