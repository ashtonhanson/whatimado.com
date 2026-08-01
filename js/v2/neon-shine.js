/** Ambient cinematic shine — border outlines only, slow with long pauses */
export function initNeonShine() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const SWEEP_MS = 6800;

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
    void el.offsetWidth;
    el.classList.add("v2-neon-sweep-active");
    window.setTimeout(() => el.classList.remove("v2-neon-sweep-active"), SWEEP_MS);
  };

  const schedule = () => {
    const delay = 22000 + Math.random() * 18000;
    window.setTimeout(() => {
      runSweep();
      schedule();
    }, delay);
  };

  window.setTimeout(runSweep, 12000);
  schedule();
}
