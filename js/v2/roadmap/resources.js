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
    details: "District offices and partner centers for coaching near Austin.",
    url: "https://www.sba.gov/local-assistance",
    phone: ""
  },
  {
    name: "Austin Community Foundation",
    org: "Austin Community Foundation",
    details: "Community funding and local nonprofit programs in Central Texas.",
    url: "https://www.austincf.org/",
    phone: "512-472-4486"
  },
  {
    name: "Mission Capital",
    org: "Mission Capital",
    details: "Nonprofit capacity support for mission-driven work in Austin.",
    url: "https://missioncapital.org/",
    phone: "512-477-5955"
  },
  {
    name: "Austin Public Library",
    org: "Austin Public Library",
    details: "Free learning, community programs, and job help at local branches.",
    url: "https://library.austintexas.gov/",
    phone: "512-974-7400"
  }
];

/** @type {LocalResource[]} */
const STABILITY_RESOURCES = [
  {
    name: "211",
    org: "211",
    details: "Ask for shelter, food, ID help, and what to bring. Search or call by city.",
    url: "https://www.211.org/",
    phone: "211"
  },
  {
    name: "Findhelp",
    org: "Findhelp",
    details: "Search housing, documents, and basic-needs programs near you.",
    url: "https://www.findhelp.org/",
    phone: ""
  }
];

/** @type {LocalResource[]} */
const GENERAL_RESOURCES = [
  {
    name: "211",
    org: "211",
    details: "Local programs for work, training, and basic needs. Search by city.",
    url: "https://www.211.org/",
    phone: "211"
  },
  {
    name: "SBA Local Assistance",
    org: "U.S. Small Business Administration",
    details: "Find a district office or partner center for free business coaching.",
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
 * @param {LocalResource[]} resources
 * @param {import("../state/location.js").UserLocation | null | undefined} location
 * @param {import("../state/user-profile.js").UserProfile | null | undefined} profile
 */
export function renderResourcesRail(resources, location, profile) {
  const list = document.getElementById("resources-list");
  const region = document.getElementById("resources-region");
  if (!list) return;
  const place = formatUserLocation(location);
  if (region) {
    region.textContent = place ? `Local resources in ${place}` : "Resources near you";
  }
  const items = mergeResources(resources, fallbackResources(location, profile));
  list.innerHTML = items
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
