import { escapeHtml } from "../ui.js";
import { formatUserLocation } from "../state/location.js";
import { shouldBlockJobBoards } from "../intake/stability-gates.js";

/** @typedef {{ name: string, org: string, kind: string, place: string, why: string, offers: string, nextStep: string, details: string, url: string, email: string, phone: string, address: string, contact: string, notes: string, emailDraft: string, phoneDraft: string, draft: string }} LocalResource */

/**
 * @param {unknown} value
 * @returns {string}
 */
/** @param {unknown} value */
function safeEmail(value) {
  const raw = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw.slice(0, 80) : "";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.href;
  } catch {
    return "";
  }
}

/**
 * @param {unknown} raw
 * @returns {LocalResource[]}
 */
export function normalizeResources(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {LocalResource[]} */
  const list = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = /** @type {Record<string, unknown>} */ (item);
    const name = String(record.name || record.org || "").trim().slice(0, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      name,
      org: String(record.org || "").trim().slice(0, 80),
      kind: String(record.kind || record.type || "organization").trim().slice(0, 40),
      place: String(record.place || record.location || "").trim().slice(0, 80),
      why: String(record.why || record.details || record.desc || "").trim().slice(0, 320),
      offers: String(record.offers || "").trim().slice(0, 320),
      nextStep: String(record.nextStep || record.next || "").trim().slice(0, 200),
      details: String(record.details || record.why || record.desc || record.text || "").trim().slice(0, 320),
      url: safeHttpUrl(record.url || record.href),
      email: safeEmail(record.email),
      phone: String(record.phone || "").trim().slice(0, 40),
      address: String(record.address || "").trim().slice(0, 160),
      contact: String(record.contact || "").trim().slice(0, 120),
      notes: String(record.notes || "").trim().slice(0, 2000),
      emailDraft: String(record.emailDraft || "").trim().slice(0, 2500),
      phoneDraft: String(record.phoneDraft || "").trim().slice(0, 2500),
      draft: String(record.draft || "").trim().slice(0, 2500)
    });
    if (list.length >= 6) break;
  }
  return list;
}

/**
 * @param {string} raw
 * @returns {LocalResource[]}
 */
export function parseResourcesResponse(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return normalizeResources(parsed?.resources);
  } catch {
    return [];
  }
}

/** @type {LocalResource[]} */
const STABILITY_RESOURCES = [
  {
    name: "211",
    org: "211",
    details: "Tell them your city and whether you need a bed, food, or help replacing ID tonight. Write down who to call next.",
    url: "https://www.211.org/",
    phone: "211"
  },
  {
    name: "Findhelp",
    org: "Findhelp",
    details: "Search your ZIP, then open the listing that names a real office and a phone number.",
    url: "https://www.findhelp.org/",
    phone: ""
  }
];

/**
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 * @returns {LocalResource[]}
 */
export function fallbackResources(_location, profile) {
  if (shouldBlockJobBoards(profile)) return STABILITY_RESOURCES.map((item) => ({ ...item }));
  return [];
}

/**
 * Prefer the roadmap's organizations, then fill from the location pack.
 * @param {LocalResource[]} primary
 * @param {LocalResource[]} extra
 */
export function mergeResources(primary, extra) {
  return normalizeResources([...(primary || []), ...(extra || [])]);
}

/**
 * The list the desktop rail shows for this roadmap.
 * @param {LocalResource[]} resources
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 * @returns {LocalResource[]}
 */
export function resourcesForRail(resources, location, profile) {
  const own = normalizeResources(resources);
  if (own.length) return own;
  return fallbackResources(location, profile);
}

/** @param {import("../state/location.js").UserLocation | null | undefined} location */
export function resourcePlaceLabel(location) {
  const place = formatUserLocation(location);
  return place ? `Local resources in ${place}` : "Resources near you";
}

/** @param {string} label @param {string} kind @param {string} name */
function actionButton(label, kind, name) {
  return `<button type="button" class="v2-resource-action" data-resource-action="${kind}" data-resource-name="${escapeHtml(name)}" aria-expanded="false">
    <span>${label}</span>
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
}

/** @param {LocalResource[]} items */
export function renderResourceListHtml(items) {
  return (items || [])
    .map((item) => {
      const title = item.org && item.org.toLowerCase() !== item.name.toLowerCase() ? `${item.name} — ${item.org}` : item.name;
      const key = escapeHtml(item.name);
      const emailBtn = item.email ? actionButton("Email Draft", "email", item.name) : "";
      const phoneBtn = item.phone ? actionButton("Phone Script", "phone", item.name) : "";
      const notesBtn = actionButton("Notes", "notes", item.name);
      const contact = [
        item.email ? `Email ${escapeHtml(item.email)}${item.contact ? ` (${escapeHtml(item.contact)})` : ""}` : "",
        item.phone ? `Phone ${escapeHtml(item.phone)}` : "",
        !item.email && !item.phone && item.url ? `Use the official contact form` : ""
      ].filter(Boolean);
      return `<li class="v2-resource-item" data-resource-name="${key}">
        <span class="v2-resource-kind">${escapeHtml(item.kind || "Resource")}${item.place ? ` · ${escapeHtml(item.place)}` : ""}</span>
        <span class="v2-resource-name">${escapeHtml(title)}</span>
        ${item.why || item.details ? `<p class="v2-resource-desc">${escapeHtml(item.why || item.details)}</p>` : ""}
        ${item.offers ? `<p class="v2-resource-offers">${escapeHtml(item.offers)}</p>` : ""}
        ${item.nextStep ? `<p class="v2-resource-next"><strong>Next step.</strong> ${escapeHtml(item.nextStep)}</p>` : ""}
        ${item.address ? `<p class="v2-resource-address">${escapeHtml(item.address)}</p>` : ""}
        ${contact.length ? `<p class="v2-resource-contact">${contact.join("<br>")}</p>` : ""}
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Official site</a>` : ""}
        <div class="v2-resource-actions">${emailBtn}${phoneBtn}${notesBtn}</div>
        <div class="v2-resource-panel hidden" data-resource-panel="${key}"></div>
      </li>`;
    })
    .join("");
}

/**
 * @param {LocalResource[]} resources
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 */
export function renderResourcesRail(resources, location, profile) {
  const list = document.getElementById("resources-list");
  const region = document.getElementById("resources-region");
  if (!list) return;
  if (region) region.textContent = resourcePlaceLabel(location);
  list.innerHTML = renderResourceListHtml(resourcesForRail(resources, location, profile));
}
