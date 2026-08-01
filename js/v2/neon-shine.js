/** Ambient cinematic shine — border outlines only, long pauses between passes */
export function initNeonShine() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const SWEEP_MS = 5200;

  const targets = () =>
    Array.from(
      document.querySelectorAll(
        "whatimado-frame .whatimado-frame__inner, .v2-rail--left, .v2-rail--right:not(.hidden)"
      )
    );

  const runSweep = () => {
    const list = targets();
    if (!list.length) return;

    const el = list[Math.floor(Math.random() * list.length)];
    el.classList.remove("v2-neon-sweep-active");
    // Force reflow so repeated sweeps on the same element restart cleanly
    void el.offsetWidth;
    el.classList.add("v2-neon-sweep-active");
    window.setTimeout(() => el.classList.remove("v2-neon-sweep-active"), SWEEP_MS);
  };

  const schedule = () => {
    const delay = 16000 + Math.random() * 14000;
    window.setTimeout(() => {
      runSweep();
      schedule();
    }, delay);
  };

  window.setTimeout(runSweep, 8000);
  schedule();
}
