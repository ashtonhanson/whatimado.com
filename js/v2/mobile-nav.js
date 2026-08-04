/** Mobile hamburger drawer — nav lives off-canvas at ≤900px */
const MOBILE_MQ = window.matchMedia("(max-width: 900px)");

/** @param {boolean} open */
function setMobileMenuOpen(open) {
  const rail = document.getElementById("nav-rail");
  const toggle = document.getElementById("mobile-menu-toggle");
  const backdrop = document.getElementById("mobile-menu-backdrop");
  if (!rail || !toggle) return;

  rail.classList.toggle("is-mobile-menu-open", open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("v2-mobile-menu-open", open);

  if (backdrop) {
    backdrop.classList.toggle("hidden", !open);
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
}

function closeMobileMenu() {
  setMobileMenuOpen(false);
  window.dispatchEvent(new Event("resize"));
}

export function initMobileNav() {
  const rail = document.getElementById("nav-rail");
  const toggle = document.getElementById("mobile-menu-toggle");
  const backdrop = document.getElementById("mobile-menu-backdrop");
  if (!rail || !toggle) return;

  if (MOBILE_MQ.matches) {
    rail.classList.remove("is-collapsed");
  }

  toggle.addEventListener("click", () => {
    const opening = !rail.classList.contains("is-mobile-menu-open");
    setMobileMenuOpen(opening);
    if (!opening) window.dispatchEvent(new Event("resize"));
  });

  backdrop?.addEventListener("click", closeMobileMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });

  rail.querySelectorAll(".v2-nav-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (MOBILE_MQ.matches) closeMobileMenu();
    });
  });

  MOBILE_MQ.addEventListener("change", (event) => {
    if (!event.matches) closeMobileMenu();
  });
}
