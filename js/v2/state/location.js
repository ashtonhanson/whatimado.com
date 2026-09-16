/** Structured location for local resources (Slice 2). */

/** @typedef {{ city: string, region: string, country: string, postal: string, raw: string }} UserLocation */
/** @typedef {{ country: string, region: string, city: string, postal: string }} LocationDraft */

/** @returns {UserLocation} */
export function emptyUserLocation() {
  return { city: "", region: "", country: "", postal: "", raw: "" };
}

/** @returns {LocationDraft} */
export function emptyLocationDraft() {
  return { country: "", region: "", city: "", postal: "" };
}

/**
 * @param {unknown} value
 * @returns {UserLocation}
 */
export function normalizeUserLocation(value) {
  const source = value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};
  return {
    city: String(source.city || "").trim(),
    region: String(source.region || "").trim(),
    country: String(source.country || "").trim(),
    postal: String(source.postal || "").trim(),
    raw: String(source.raw || "").trim()
  };
}

/**
 * @param {unknown} value
 * @returns {LocationDraft}
 */
export function normalizeLocationDraft(value) {
  const source = value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};
  return {
    country: String(source.country || "").trim(),
    region: String(source.region || "").trim(),
    city: String(source.city || "").trim(),
    postal: String(source.postal || "").trim()
  };
}

export function isLocationSkip(text) {
  return /^(skip|n\/a|na|none|not applicable|pass)$/i.test(String(text || "").trim());
}

/**
 * @param {string} text
 * @returns {UserLocation}
 */
export function parseLocationAnswer(text) {
  const trimmed = String(text || "").trim();
  const postalMatch = trimmed.match(/\b(\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const postal = postalMatch ? postalMatch[1].toUpperCase() : "";
  const withoutPostal = postal ? trimmed.replace(postalMatch[0], "").replace(/,\s*,/g, ",").trim() : trimmed;
  const parts = withoutPostal
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      city: parts[0],
      region: parts[1],
      country: parts.slice(2).join(", "),
      postal,
      raw: trimmed
    };
  }
  if (parts.length === 2) {
    return { city: parts[0], region: parts[1], country: "", postal, raw: trimmed };
  }
  return { city: "", region: "", country: trimmed, postal, raw: trimmed };
}

/**
 * @param {LocationDraft} draft
 * @returns {UserLocation}
 */
export function locationFromDraft(draft) {
  const country = String(draft.country || "").trim();
  const region = isLocationSkip(draft.region) ? "" : String(draft.region || "").trim();
  const city = String(draft.city || "").trim();
  const postal = isLocationSkip(draft.postal) ? "" : String(draft.postal || "").trim();
  const parts = [city, region, country].filter(Boolean);
  const raw = postal ? `${parts.join(", ")} ${postal}`.trim() : parts.join(", ");
  return { city, region, country, postal, raw };
}

/** @param {UserLocation} location */
export function formatUserLocation(location) {
  const loc = normalizeUserLocation(location);
  if (loc.raw) return loc.raw;
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  const joined = parts.join(", ");
  return loc.postal ? `${joined} ${loc.postal}`.trim() : joined;
}

export function hasUsableLocation(location) {
  const loc = normalizeUserLocation(location);
  return Boolean(loc.city || (loc.country && loc.region) || loc.raw);
}
