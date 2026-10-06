import { describe, expect, it } from "vitest";
import {
  calculateAverageBasket,
  calculateGrossProfit,
  calculateGrowthRate,
  calculateOperatingProfit,
  calculateRevenuePerCustomer,
  calculateRevenuePerEmployee,
  calculateRevenuePerSqm,
  calculateShare,
  calculateWeightedMargin,
  sumOrNull,
  sumStrict,
} from "@/lib/calc";

describe("KPI formulas", () => {
  it("average basket = revenue / transactions", () => {
    expect(calculateAverageBasket(440_200, 31_000)).toBeCloseTo(14.2, 10);
  });
  it("revenue per m², employee, customer", () => {
    expect(calculateRevenuePerSqm(487_000, 795.75)).toBeCloseTo(612, 0);
    expect(calculateRevenuePerEmployee(487_000, 28)).toBeCloseTo(17_392.857, 3);
    expect(calculateRevenuePerCustomer(450_000, 30_000)).toBe(15);
  });
  it("gross profit = revenue × margin%", () => {
    expect(calculateGrossProfit(3_692, 31)).toBeCloseTo(1_144.52, 10);
  });
  it("operating profit = gross profit − operating costs", () => {
    expect(calculateOperatingProfit(152_918, 121_000)).toBe(31_918);
    expect(calculateOperatingProfit(100, 250)).toBe(-150);
  });
  it("growth rate", () => {
    expect(calculateGrowthRate(110, 100)).toBeCloseTo(10, 10);
    expect(calculateGrowthRate(88, 100)).toBeCloseTo(-12, 10);
    expect(calculateGrowthRate(13_950, 12_400)).toBeCloseTo(12.5, 10);
  });
  it("share", () => {
    expect(calculateShare(25, 200)).toBe(12.5);
  });

  describe("missing data is never turned into a number", () => {
    it.each([
      ["null numerator", () => calculateAverageBasket(null, 100)],
      ["undefined denominator", () => calculateAverageBasket(100, undefined)],
      ["zero denominator", () => calculateAverageBasket(100, 0)],
      ["NaN", () => calculateRevenuePerSqm(Number.NaN, 10)],
      ["Infinity", () => calculateRevenuePerEmployee(Number.POSITIVE_INFINITY, 10)],
      ["margin missing", () => calculateGrossProfit(100, null)],
      ["costs missing", () => calculateOperatingProfit(100, null)],
      ["previous period zero", () => calculateGrowthRate(100, 0)],
      ["previous period missing", () => calculateGrowthRate(100, null)],
      ["share of zero total", () => calculateShare(5, 0)],
    ])("%s → null", (_name, fn) => {
      expect(fn()).toBeNull();
    });
    it("zero revenue is a real value, not missing", () => {
      expect(calculateAverageBasket(0, 10)).toBe(0);
      expect(calculateGrossProfit(0, 30)).toBe(0);
    });
  });

  it("weighted margin ignores rows without margin in both sums", () => {
    expect(
      calculateWeightedMargin([
        { revenue: 100, grossMarginPct: 30 },
        { revenue: 300, grossMarginPct: 20 },
        { revenue: 999, grossMarginPct: null },
      ]),
    ).toBeCloseTo(22.5, 10);
    expect(calculateWeightedMargin([{ revenue: 10, grossMarginPct: null }])).toBeNull();
  });

  it("sumOrNull vs sumStrict", () => {
    expect(sumOrNull([1, null, 2])).toBe(3);
    expect(sumOrNull([null, undefined])).toBeNull();
    expect(sumStrict([1, null, 2])).toBeNull();
    expect(sumStrict([1, 2])).toBe(3);
    expect(sumStrict([])).toBeNull();
  });
});
