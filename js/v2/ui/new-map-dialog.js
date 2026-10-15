/**
 * Confirmation before starting a fresh journey.
 * @param {{ message: string, returnFocus?: HTMLElement | null }} options
 * @returns {Promise<boolean>}
 */
export function confirmStartNewMap({ message, returnFocus = null }) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("new-map-dialog"));
  const body = document.getElementById("new-map-confirm-body");
  const cancelBtn = document.getElementById("new-map-cancel");
  const confirmBtn = document.getElementById("new-map-confirm-btn");
  if (!dialog || !body || !cancelBtn || !confirmBtn) return Promise.resolve(false);

  body.textContent = message;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      dialog.removeEventListener("cancel", onCancelEvent);
      if (dialog.open) dialog.close();
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
