import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatUsdt, truncateMiddle } from "./format";

describe("formatMoney", () => {
  it("formats USDT with two decimals", () => {
    assert.equal(formatUsdt(12.5), "12.50 USDT");
  });

  it("returns em dash for nullish", () => {
    assert.equal(formatMoney(null), "—");
    assert.equal(formatMoney(undefined), "—");
  });

  it("converts with local display rate", () => {
    const out = formatMoney(10, {
      code: "KES",
      rate: 100,
      source: "coinbase",
      preferredCurrency: "LOCAL",
      derivedFromCountry: "KE",
      localCurrencyCode: "KES",
    });
    assert.ok(out.includes("1,000") || out.includes("1000"));
  });
});

describe("truncateMiddle", () => {
  it("keeps short strings intact", () => {
    assert.equal(truncateMiddle("abc"), "abc");
  });

  it("truncates long addresses", () => {
    const value = "TXyzabcdefghijklmnopqrstuvwxyz123456";
    const out = truncateMiddle(value, 6, 4);
    assert.ok(out.startsWith("TXyzab"));
    assert.ok(out.endsWith("3456"));
    assert.ok(out.includes("…"));
  });
});
