import { escapeHtml } from "../ui.js";
import { formatUserLocation } from "../state/location.js";
import { shouldBlockJobBoards } from "../intake/stability-gates.js";

/** @typedef {{ name: string, org: string, details: string, url: string, phone: string }} LocalResource */

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
      details: String(record.details || record.desc || record.text || "").trim().slice(0, 240),
      url: safeHttpUrl(record.url || record.href),
      phone: String(record.phone || "").trim().slice(0, 32)
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
const AUSTIN_RESOURCES = [
  {
    name: "SBA Local Assistance",
    org: "U.S. Small Business Administration",
    details: "A district office or SCORE advisor for someone who already runs client work and wants a local sounding board.",
    url: "https://www.sba.gov/local-assistance",
    phone: ""
  },
  {
    name: "Austin Community Foundation",
    org: "Austin Community Foundation",
    details: "Which Central Texas funders and program officers meet with people doing community or creative work.",
    url: "https://www.austincf.org/",
    phone: "512-472-4486"
  },
  {
    name: "Mission Capital",
    org: "Mission Capital",
    details: "Peer rooms for people already leading mission-driven organizations in Austin.",
    url: "https://missioncapital.org/",
    phone: "512-477-5955"
  },
  {
    name: "Austin Public Library",
    org: "Austin Public Library",
    details: "Research databases and a quiet branch when you need a place to work a plan.",
    url: "https://library.austintexas.gov/",
    phone: "512-974-7400"
  }
];

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

/** @type {LocalResource[]} */
const GENERAL_RESOURCES = [
  {
    name: "211",
    org: "211",
    details: "Name your city and the specific kind of help you need. Write down the program that has a person attached to it.",
    url: "https://www.211.org/",
    phone: "211"
  },
  {
    name: "SBA Local Assistance",
    org: "U.S. Small Business Administration",
    details: "A district office or partner advisor for someone who already has a practice, not a first-business class.",
    url: "https://www.sba.gov/local-assistance",
    phone: ""
  }
];

/**
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 * @returns {LocalResource[]}
 */
export function fallbackResources(location, profile) {
  if (shouldBlockJobBoards(profile)) return STABILITY_RESOURCES.map((item) => ({ ...item }));
  const place = `${location?.city || ""} ${location?.raw || ""}`.toLowerCase();
  if (place.includes("austin")) return AUSTIN_RESOURCES.map((item) => ({ ...item }));
  return GENERAL_RESOURCES.map((item) => ({ ...item }));
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
  return mergeResources(resources, fallbackResources(location, profile));
}

/** @param {import("../state/location.js").UserLocation | null | undefined} location */
export function resourcePlaceLabel(location) {
  const place = formatUserLocation(location);
  return place ? `Local resources in ${place}` : "Resources near you";
}

/** @param {LocalResource[]} items */
export function renderResourceListHtml(items) {
  return (items || [])
    .map((item) => {
      const title = item.org && item.org.toLowerCase() !== item.name.toLowerCase() ? `${item.name} — ${item.org}` : item.name;
      const link = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Website</a>`
        : "";
      const phone = item.phone ? `<span class="v2-resource-phone">${escapeHtml(item.phone)}</span>` : "";
      const meta = link || phone ? `<div class="v2-resource-meta">${link}${phone}</div>` : "";
      return `<li class="v2-resource-item">
        <span class="v2-resource-name">${escapeHtml(title)}</span>
        ${item.details ? `<p class="v2-resource-desc">${escapeHtml(item.details)}</p>` : ""}
        ${meta}
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
