import { describe, expect, it } from "vitest";
import { CATEGORY_LABELS, getLibraryEntry, libraryByCategory, simulatorHref, STRATEGY_CATEGORIES, STRATEGY_LIBRARY } from "@/lib/strategy/library";

describe("strategy library", () => {
  it("has at least 16 entries with unique keys", () => {
    expect(STRATEGY_LIBRARY.length).toBeGreaterThanOrEqual(16);
    expect(new Set(STRATEGY_LIBRARY.map((e) => e.key)).size).toBe(STRATEGY_LIBRARY.length);
  });
  it("contains every key the rule engine references", () => {
    for (const key of ["expand-lunch-assortment", "change-opening-hours", "cross-selling", "local-promotions", "markdown-routine", "bakery-positioning", "improve-product-visibility"]) {
      expect(getLibraryEntry(key), key).not.toBeNull();
    }
    expect(getLibraryEntry("nope")).toBeNull();
    expect(getLibraryEntry(null)).toBeNull();
  });
  it("covers all 14 categories", () => {
    expect(STRATEGY_CATEGORIES.length).toBe(14);
    for (const c of STRATEGY_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
      expect(libraryByCategory(c).length, c).toBeGreaterThan(0);
    }
    expect(libraryByCategory(null).length).toBe(STRATEGY_LIBRARY.length);
  });
  it("every entry is complete", () => {
    for (const e of STRATEGY_LIBRARY) {
      for (const list of [e.dataRequired, e.possibleCosts, e.possibleBenefits, e.risks, e.metrics]) expect(list.length, e.key).toBeGreaterThanOrEqual(2);
      for (const s of [e.title, e.what, e.whyTested, e.hypothesisTemplate, e.testTemplate, e.simulator.note]) expect(s.length, e.key).toBeGreaterThan(10);
      expect(simulatorHref(e.simulator)).toMatch(/^\/strategies\?tab=(simulator&kind=[A-Z_]+|break-even|opportunity)$/);
    }
  });
  it("never words a benefit or hypothesis as a guaranteed outcome", () => {
    const hedge = /\b(may|could|might|potentially)\b/i;
    const banned = /\b(will|guarantee[sd]?|ensures?|always|proven)\b/i;
    for (const e of STRATEGY_LIBRARY) {
      for (const b of e.possibleBenefits) {
        // "Redemption data/counts show…" describes a measurement, not an outcome.
        if (!/^(Redemption|Coupon redemptions)/.test(b)) expect(b, `${e.key}: ${b}`).toMatch(hedge);
        expect(b, `${e.key}: ${b}`).not.toMatch(banned);
      }
      expect(e.hypothesisTemplate, e.key).toMatch(hedge);
      expect(e.hypothesisTemplate, e.key).not.toMatch(banned);
      // No currency amounts: the library must not suggest real-world cost figures.
      expect(JSON.stringify(e), e.key).not.toMatch(/[€$£]\s?\d/);
    }
  });
});
