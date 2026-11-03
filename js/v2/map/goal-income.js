/**
 * Pay ranges for the future-path star. Keep the source unit (/hr, /mo, year, …).
 */

/** @typedef {{ city?: string, region?: string, country?: string, raw?: string }} GoalLocation */

const ROLE_BANDS = [
  { test: /\b(dentist|orthodont)\b/i, low: 120000, high: 210000 },
  { test: /\b(dental|hygienist)\b/i, low: 38000, high: 62000 },
  { test: /\b(registered nurse|rn\b|nurse practitioner)\b/i, low: 70000, high: 120000 },
  { test: /\b(nurs|cna|lpn)\b/i, low: 36000, high: 68000 },
  { test: /\b(software|engineer|developer|programmer|coder)\b/i, low: 85000, high: 145000 },
  { test: /\b(data|analyst|scientist)\b/i, low: 65000, high: 115000 },
  { test: /\b(teacher|teaching|educator)\b/i, low: 42000, high: 72000 },
  { test: /\b(truck|cdl|driver)\b/i, low: 42000, high: 78000 },
  { test: /\b(electric|plumber|hvac|carpenter|welder|trade)\b/i, low: 48000, high: 88000 },
  { test: /\b(clean|janitor|custod|housekeep)\b/i, low: 28000, high: 46000 },
  { test: /\b(cook|chef|restaurant|food)\b/i, low: 30000, high: 52000 },
  { test: /\b(retail|cashier|store)\b/i, low: 26000, high: 40000 },
  { test: /\b(sales|account exec)\b/i, low: 45000, high: 95000 },
  { test: /\b(design|ux|ui|product)\b/i, low: 55000, high: 110000 },
  { test: /\b(writer|edit|content)\b/i, low: 38000, high: 72000 },
  { test: /\b(assist|admin|office|reception)\b/i, low: 32000, high: 52000 },
  { test: /\b(business|own|founder|startup)\b/i, low: 35000, high: 90000 }
];

const DEFAULT_BAND = { low: 36000, high: 64000 };

/**
 * @param {string} role
 * @returns {{ low: number, high: number }}
 */
export function rolePayBand(role) {
  const text = String(role || "");
  const match = ROLE_BANDS.find((entry) => entry.test.test(text));
  return { ...(match || DEFAULT_BAND) };
}

/**
 * @param {GoalLocation | null | undefined} location
 */
export function locationPayContext(location) {
  const blob = [location?.city, location?.region, location?.country, location?.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(united kingdom|great britain|\buk\b|england|scotland|wales)\b/.test(blob)) {
    return { currency: "£", scale: 0.78, col: cityCol(blob, 1.18) };
  }
  if (/\b(australia|\bau\b)\b/.test(blob)) {
    return { currency: "A$", scale: 1.12, col: cityCol(blob, 1.12) };
  }
  if (/\b(new zealand|\bnz\b)\b/.test(blob)) {
    return { currency: "NZ$", scale: 1.2, col: cityCol(blob, 1.08) };
  }
  if (/\b(canada|\bca\b|ontario|quebec|british columbia)\b/.test(blob)) {
    return { currency: "C$", scale: 1.18, col: cityCol(blob, 1.12) };
  }
  if (/\b(ireland|\bie\b)\b/.test(blob) || /\b(germany|france|spain|italy|netherlands|sweden|norway|denmark|finland|austria|belgium|portugal)\b/.test(blob)) {
    return { currency: "€", scale: 0.92, col: cityCol(blob, 1.1) };
  }
  return { currency: "$", scale: 1, col: cityCol(blob, 1.22) };
}

/**
 * @param {string} blob
 * @param {number} highCol
 */
function cityCol(blob, highCol) {
  if (
    /\b(new york|nyc|san francisco|bay area|seattle|boston|los angeles|washington|dc|london|sydney|toronto|vancouver)\b/.test(
      blob
    )
  ) {
    return highCol;
  }
  return 1;
}

/**
 * @param {number} value
 * @param {string} currency
 */
export function formatPayAmount(value, currency = "$") {
  const rounded = Math.max(1000, Math.round(value / 1000) * 1000);
  const thousands = Math.round(rounded / 1000);
  return `${currency}${thousands}k`;
}

/**
 * @param {number} low
 * @param {number} high
 * @param {string} [currency]
 */
export function formatYearlyIncomeRange(low, high, currency = "$") {
  let a = Number(low);
  let b = Number(high);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    a = DEFAULT_BAND.low;
    b = DEFAULT_BAND.high;
  }
  if (a > b) [a, b] = [b, a];
  if (a === b) {
    a = Math.max(1000, a * 0.85);
    b = b * 1.15;
  }
  return `${formatPayAmount(a, currency)}–${formatPayAmount(b, currency)} per year`;
}

/**
 * @param {number} low
 * @param {number} high
 * @param {string} currency
 * @param {string} suffix  e.g. "/hr", "/mo", "/wk"
 */
function formatUnitIncomeRange(low, high, currency, suffix) {
  let a = Number(low);
  let b = Number(high);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  if (a > b) [a, b] = [b, a];
  const fmt = (n) => {
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 100) / 100);
  };
  return `${currency}${fmt(a)}–${currency}${fmt(b)}${suffix}`;
}

/**
 * Detect pay period from labels like /hr, hour, /mo, month, /wk, week, year.
 * @param {string} raw
 * @returns {"hour" | "month" | "week" | "year" | ""}
 */
function detectIncomeUnit(raw) {
  if (/\/\s*hr\b|per\s*hour|\bhourly\b|\bhours?\b/i.test(raw)) return "hour";
  if (/\/\s*mo\b|per\s*month|\bmonthly\b|\bmonths?\b/i.test(raw)) return "month";
  if (/\/\s*wk\b|per\s*week|\bweekly\b|\bweeks?\b/i.test(raw)) return "week";
  if (/\/\s*yr\b|per\s*year|\byearly\b|\bannual(?:ly)?\b|\byears?\b/i.test(raw)) return "year";
  return "";
}

/**
 * Reuse a path income string, preserving /hr /mo /wk or normalizing yearly ranges.
 * @param {string} text
 */
export function readExistingIncomeRange(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const unit = detectIncomeUnit(raw);
  const range = raw.match(
    /([\$£€]|A\$|C\$|NZ\$)?\s*(\d+(?:\.\d+)?)\s*(k)?\s*[–—-]\s*([\$£€]|A\$|C\$|NZ\$)?\s*(\d+(?:\.\d+)?)\s*(k)?/i
  );
  if (!range) return "";

  const currency = range[1] || range[4] || "$";
  const lowRaw = Number(range[2]);
  const highRaw = Number(range[5]);
  if (!Number.isFinite(lowRaw) || !Number.isFinite(highRaw)) return "";
  const lowIsK = Boolean(range[3]);
  const highIsK = Boolean(range[6]);

  if (unit === "hour") return formatUnitIncomeRange(lowRaw, highRaw, currency, "/hr");
  if (unit === "month") return formatUnitIncomeRange(lowRaw, highRaw, currency, "/mo");
  if (unit === "week") return formatUnitIncomeRange(lowRaw, highRaw, currency, "/wk");

  /* Yearly (explicit or implied by k / mid figures without another unit). */
  const looksYearly =
    unit === "year" || lowIsK || highIsK || (!unit && (lowRaw >= 10 || highRaw >= 10));
  if (!looksYearly) return "";

  /* "55k" → 55000; bare "55" in a yearly context → 55000; already "55000" stays. */
  const toYearly = (n, hasK) => (hasK || n < 1000 ? n * 1000 : n);
  return formatYearlyIncomeRange(toYearly(lowRaw, lowIsK), toYearly(highRaw, highIsK), currency);
}

/**
 * @param {{ title?: string, label?: string, income?: string } | null | undefined} role
 * @param {GoalLocation | null | undefined} location
 */
export function goalIncomeRange(role, location) {
  const existing = readExistingIncomeRange(role?.income || "");
  if (existing) return existing;
  const band = rolePayBand(`${role?.title || ""} ${role?.label || ""}`);
  const { currency, scale, col } = locationPayContext(location);
  return formatYearlyIncomeRange(band.low * scale * col, band.high * scale * col, currency);
}
