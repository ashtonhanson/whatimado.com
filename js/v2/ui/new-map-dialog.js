/**
 * Shared confirm dialog (new map, intake edit ripple, etc.).
 * @param {{
 *   message: string,
 *   title?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   returnFocus?: HTMLElement | null
 * }} options
 * @returns {Promise<boolean>}
 */
export function confirmStartNewMap({
  message,
  title = "Start a new map?",
  confirmLabel = "Start New Map",
  cancelLabel = "Cancel",
  returnFocus = null
}) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("new-map-dialog"));
  const titleEl = document.getElementById("new-map-confirm-title");
  const body = document.getElementById("new-map-confirm-body");
  const cancelBtn = document.getElementById("new-map-cancel");
  const confirmBtn = document.getElementById("new-map-confirm-btn");
  if (!dialog || !body || !cancelBtn || !confirmBtn) return Promise.resolve(false);

  const previousTitle = titleEl?.textContent || "";
  const previousConfirm = confirmBtn.textContent || "";
  const previousCancel = cancelBtn.textContent || "";
  if (titleEl) titleEl.textContent = title;
  body.textContent = message;
  confirmBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      dialog.removeEventListener("cancel", onCancelEvent);
      if (dialog.open) dialog.close();
      if (titleEl) titleEl.textContent = previousTitle || "Start a new map?";
      confirmBtn.textContent = previousConfirm || "Start New Map";
      cancelBtn.textContent = previousCancel || "Cancel";
      resolve(confirmed);
      if (!confirmed && returnFocus) {
        requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
      }
    };

    const onCancel = () => finish(false);
    const onConfirm = () => finish(true);
    const onCancelEvent = (event) => {
      event.preventDefault();
      finish(false);
    };

    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    dialog.addEventListener("cancel", onCancelEvent);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else finish(true);
    confirmBtn.focus();
  });
}
