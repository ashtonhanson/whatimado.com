import test from "node:test";
import assert from "node:assert/strict";
import {
  formatYearlyIncomeRange,
  goalIncomeRange,
  readExistingIncomeRange,
  rolePayBand
} from "./goal-income.js";

test("yearly pay is always a range, never one number", () => {
  const text = formatYearlyIncomeRange(55000, 55000, "$");
  assert.match(text, /–/);
  assert.match(text, /per year$/);
  const [left, right] = text.replace(" per year", "").split("–");
  assert.notEqual(left, right);
});

test("dental assistant in a US city uses a dollar range", () => {
  const text = goalIncomeRange(
    { title: "Become a dental assistant" },
    { city: "Austin", region: "Texas", country: "United States" }
  );
  assert.equal(text, "$38k–$62k per year");
});

test("the same role in London uses pounds and a city bump", () => {
  const text = goalIncomeRange({ title: "Dental assistant" }, { city: "London", country: "United Kingdom" });
  assert.match(text, /^£/);
  assert.match(text, /–/);
  assert.match(text, /per year$/);
  assert.notEqual(text, goalIncomeRange({ title: "Dental assistant" }, { country: "United Kingdom" }));
});

test("an existing yearly range on the path is kept and normalized", () => {
  assert.equal(readExistingIncomeRange("$55k-$75k a year"), "$55k–$75k per year");
  assert.equal(goalIncomeRange({ title: "Nurse", income: "$55k–$75k per year" }, null), "$55k–$75k per year");
});

test("hourly and monthly ranges keep their unit instead of becoming yearly k", () => {
  assert.equal(readExistingIncomeRange("$14-18/hr"), "$14–$18/hr");
  assert.equal(readExistingIncomeRange("$13-16/hr"), "$13–$16/hr");
  assert.equal(readExistingIncomeRange("$400-$800/mo"), "$400–$800/mo");
  assert.equal(readExistingIncomeRange("$18–$22 per hour"), "$18–$22/hr");
  assert.equal(readExistingIncomeRange("$2500-$3200/month"), "$2500–$3200/mo");
  assert.equal(goalIncomeRange({ title: "Cashier", income: "$14-18/hr" }, null), "$14–$18/hr");
});

test("role bands stay ordered low to high", () => {
  const band = rolePayBand("software engineer");
  assert.ok(band.low < band.high);
});
