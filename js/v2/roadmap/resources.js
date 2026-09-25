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
 * Published switchboard lines only. Fills a card when the model left the field blank.
 * @type {{ match: RegExp, phone: string, email: string, address: string, url: string }[]}
 */
const VERIFIED_CONTACTS = [
  {
    match: /austin chamber/i,
    phone: "(512) 478-9383",
    email: "join@austinchamber.com",
    address: "535 East 5th Street, Austin, TX 78701",
    url: "https://www.austinchamber.com/about/contact"
  }
];

/**
 * @param {LocalResource} item
 * @returns {LocalResource}
 */
function withVerifiedContact(item) {
  const hit = VERIFIED_CONTACTS.find((row) => row.match.test(item.name) || row.match.test(item.org || ""));
  if (!hit) return item;
  return {
    ...item,
    phone: item.phone || hit.phone,
    email: safeEmail(item.email || hit.email),
    address: item.address || hit.address,
    url: item.url || hit.url
  };
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
    list.push(withVerifiedContact({
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
    }));
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
/**
 * Real switchboards for an empty professional rail. Phone and email only where published.
 * @type {Record<string, LocalResource[]>}
 */
const COMMUNICATION_BY_CITY = {
  austin: [
    {
      name: "Austin Chamber of Commerce",
      org: "Austin Chamber of Commerce",
      kind: "organization",
      place: "Austin, TX",
      why: "Main desk for introductions to local businesses when you are building a design practice here.",
      offers: "General inquiries and membership.",
      nextStep: "Call the main line or email membership and name the introduction you want.",
      url: "https://www.austinchamber.com/about/contact",
      email: "join@austinchamber.com",
      phone: "(512) 478-9383",
      address: "535 East 5th Street, Austin, TX 78701",
      contact: "Membership",
      notes: "",
      emailDraft: "",
      phoneDraft: "",
      draft: ""
    },
    {
      name: "AIGA Austin",
      org: "AIGA Austin",
      kind: "organization",
      place: "Austin, TX",
      why: "The local design association. Reach the board through their contact form.",
      offers: "Community questions and event promotion.",
      nextStep: "Paste the message draft into the form on their contact page.",
      url: "https://austin.aiga.org/contact/",
      email: "",
      phone: "",
      address: "",
      contact: "Board",
      notes: "",
      emailDraft: "",
      phoneDraft: "",
      draft: ""
    }
  ]
};

/**
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 * @returns {LocalResource[]}
 */
export function fallbackResources(location, profile) {
  if (shouldBlockJobBoards(profile)) return STABILITY_RESOURCES.map((item) => ({ ...item }));
  const city = String(location?.city || "").trim().toLowerCase();
  const pack = COMMUNICATION_BY_CITY[city];
  return pack ? pack.map((item) => ({ ...item })) : [];
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
      const formBtn = actionButton(item.url ? "Contact form" : "Message", "message", item.name);
      const notesBtn = actionButton("Notes", "notes", item.name);
      const phoneHref = item.phone ? item.phone.replace(/[^\d+]/g, "") : "";
      const contact = [
        item.email ? `Email ${escapeHtml(item.email)}${item.contact ? ` (${escapeHtml(item.contact)})` : ""}` : "",
        item.phone ? `Phone ${escapeHtml(item.phone)}` : "",
        item.url ? `Official contact form` : ""
      ].filter(Boolean);
      return `<li class="v2-resource-item" data-resource-name="${key}">
        <span class="v2-resource-kind">${escapeHtml(item.kind || "Resource")}${item.place ? ` · ${escapeHtml(item.place)}` : ""}</span>
        <span class="v2-resource-name">${escapeHtml(title)}</span>
        ${item.why || item.details ? `<p class="v2-resource-desc">${escapeHtml(item.why || item.details)}</p>` : ""}
        ${item.offers ? `<p class="v2-resource-offers">${escapeHtml(item.offers)}</p>` : ""}
        ${item.nextStep ? `<p class="v2-resource-next"><strong>Next step.</strong> ${escapeHtml(item.nextStep)}</p>` : ""}
        ${item.address ? `<p class="v2-resource-address">${escapeHtml(item.address)}</p>` : ""}
        ${contact.length ? `<p class="v2-resource-contact">${contact.join("<br>")}</p>` : ""}
        <div class="v2-resource-meta">
          ${item.email ? `<a href="mailto:${escapeHtml(item.email)}">Email</a>` : ""}
          ${phoneHref ? `<a href="tel:${escapeHtml(phoneHref)}">Call</a>` : ""}
          ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Official site</a>` : ""}
        </div>
        <div class="v2-resource-actions">${emailBtn}${phoneBtn}${formBtn}${notesBtn}</div>
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
