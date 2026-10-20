import test from "node:test";
import assert from "node:assert/strict";
import { countryKey, countryResources } from "./country-resources.js";
import { fallbackResources, resourcesMatchingFirstMissions } from "./resources.js";

const stable = { idStatus: "has", housingStatus: "has" };
const unstable = { idStatus: "needs", housingStatus: "needs" };

test("countryKey reads names, codes, accents, and US state codes", () => {
  assert.equal(countryKey({ country: "U.S.A." }), "us");
  assert.equal(countryKey({ country: "United Kingdom" }), "uk");
  assert.equal(countryKey({ country: "Scotland" }), "uk");
  assert.equal(countryKey({ country: "México" }), "mx");
  assert.equal(countryKey({ country: "", region: "TX" }), "us");
  assert.equal(countryKey({ country: "Narnia" }), "");
});

test("stability fallback uses the person's country, not US 211", () => {
  const uk = fallbackResources({ country: "UK", city: "Leeds" }, unstable);
  assert.ok(uk.some((item) => item.name === "Citizens Advice"));
  assert.ok(!uk.some((item) => item.name === "211"));

  const unknownCountry = fallbackResources({ country: "Narnia", city: "Cair Paravel" }, unstable);
  assert.deepEqual(unknownCountry, []);

  const noLocation = fallbackResources(null, unstable);
  assert.ok(noLocation.some((item) => item.name === "211"));
});

test("work fallback keeps the Austin pack and adds national services", () => {
  const austin = fallbackResources({ country: "USA", region: "TX", city: "Austin" }, stable);
  assert.ok(austin.some((item) => /Austin Chamber/.test(item.name)));
  assert.ok(austin.some((item) => item.name === "American Job Centers"));

  const berlin = fallbackResources({ country: "Germany", city: "Austin" }, stable);
  assert.ok(!berlin.some((item) => /Austin/.test(item.name)));
  assert.equal(berlin[0].name, "Bundesagentur für Arbeit");
  assert.equal(berlin[0].place, "Germany");
});

test("first-mission resources top up from the country when the model returns too few", () => {
  const stages = [{ missions: [{ title: "Call a local studio", text: "Ask about openings." }] }];
  const own = [{ name: "Studio One", url: "https://example.com/" }];
  const merged = resourcesMatchingFirstMissions(stages, own, { country: "Australia", city: "Perth" }, stable);
  assert.equal(merged[0].name, "Studio One");
  assert.ok(merged.some((item) => item.name === "Workforce Australia"));
  assert.equal(countryResources({ country: "Australia" }, "work").length >= 1, true);
});
