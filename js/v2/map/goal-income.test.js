import test from "node:test";
import assert from "node:assert/strict";
import {
  formatYearlyIncomeRange,
  goalIncomeRange,
  readExistingIncomeRange,
  rolePayBand
} from "./goal-income.js";

test("yearly pay is always a range with /yr, never one number or per year", () => {
  const text = formatYearlyIncomeRange(55000, 55000, "$");
  assert.match(text, /–/);
  assert.match(text, /\/yr$/);
  assert.doesNotMatch(text, /per year/i);
  const [left, right] = text.replace("/yr", "").split("–");
  assert.notEqual(left, right);
});

test("dental assistant in a US city uses a dollar range", () => {
  const text = goalIncomeRange(
    { title: "Become a dental assistant" },
    { city: "Austin", region: "Texas", country: "United States" }
  );
  assert.equal(text, "$38k–$62k/yr");
});

test("the same role in London uses pounds and a city bump", () => {
  const text = goalIncomeRange({ title: "Dental assistant" }, { city: "London", country: "United Kingdom" });
  assert.match(text, /^£/);
  assert.match(text, /–/);
  assert.match(text, /\/yr$/);
  assert.notEqual(text, goalIncomeRange({ title: "Dental assistant" }, { country: "United Kingdom" }));
});

test("an existing yearly range on the path is kept and normalized", () => {
  assert.equal(readExistingIncomeRange("$55k-$75k a year"), "$55k–$75k/yr");
  assert.equal(goalIncomeRange({ title: "Nurse", income: "$55k–$75k per year" }, null), "$55k–$75k/yr");
});

test("hourly and monthly ranges keep their unit instead of becoming yearly k", () => {
  assert.equal(readExistingIncomeRange("$14-18/hr"), "$14–$18/hr");
  assert.equal(readExistingIncomeRange("$13-16/hr"), "$13–$16/hr");
  assert.equal(readExistingIncomeRange("$400-$800/mo"), "$400–$800/mo");
  assert.equal(readExistingIncomeRange("$18–$22 per hour"), "$18–$22/hr");
  assert.equal(readExistingIncomeRange("$2500-$3200/month"), "$2500–$3200/mo");
  assert.equal(goalIncomeRange({ title: "Cashier", income: "$14-18/hr" }, null), "$14–$18/hr");
});

test("comma amounts parse as full dollars, not truncated", () => {
  assert.equal(readExistingIncomeRange("$2,000-$3,000/mo"), "$2000–$3000/mo");
  assert.equal(readExistingIncomeRange("$1,200–$1,800/wk"), "$1200–$1800/wk");
});

test("bare word hours does not turn a weekly amount into hourly", () => {
  assert.equal(readExistingIncomeRange("$400/wk for 10 hours"), "$400/wk");
  assert.equal(readExistingIncomeRange("$400-$600/wk (~20 hours)"), "$400–$600/wk");
});

test("role bands stay ordered low to high", () => {
  const band = rolePayBand("software engineer");
  assert.ok(band.low < band.high);
});
