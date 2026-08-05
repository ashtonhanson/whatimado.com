import { applyBrand } from "../../brand/apply-brand.js";

const FALLBACK_PROMPTS = [
  "Share what's going on…",
  "Lost my job — need a plan…",
  "Explore a career change…",
  "Stuck — what path fits me?",
  "Training options near me…"
];

/** @type {Record<string, unknown>|null} */
let brand = null;

/** @returns {Record<string, unknown>|null} */
export function getBrand() {
  return brand;
}

/** @returns {string[]} */
export function getExamplePrompts() {
  const composer = /** @type {{ examplePrompts?: string[] }|undefined} */ (brand?.composer);
  const prompts = composer?.examplePrompts;
  return Array.isArray(prompts) && prompts.length ? prompts : FALLBACK_PROMPTS;
}

/**
 * Load brand JSON and apply to the document shell.
 * @param {Document} [doc]
 */
export async function initBrand(doc = document) {
  const res = await fetch("/brand/whatimado.default.json");
  if (!res.ok) throw new Error(`Brand config failed (${res.status})`);
  brand = await res.json();
  applyBrand(brand, doc);
  return brand;
}
