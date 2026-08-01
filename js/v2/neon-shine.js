/** Ambient cinematic shine sweeps across neon frames and hero title */
export function initNeonShine() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const targets = () =>
    Array.from(
      document.querySelectorAll(
        "whatimado-frame .whatimado-frame__inner, .v2-rail--left, .v2-rail--right:not(.hidden), .v2-kicker-brand"
      )
    );

  const runSweep = () => {
    const list = targets();
    if (!list.length) return;

    const el = list[Math.floor(Math.random() * list.length)];
    el.classList.add("v2-neon-sweep-active");
    window.setTimeout(() => el.classList.remove("v2-neon-sweep-active"), 2800);
  };

  const schedule = () => {
    const delay = 9000 + Math.random() * 11000;
    window.setTimeout(() => {
      runSweep();
      if (Math.random() > 0.55) {
        window.setTimeout(runSweep, 3200 + Math.random() * 2000);
      }
      schedule();
    }, delay);
  };

  window.setTimeout(runSweep, 4000);
  schedule();
}
