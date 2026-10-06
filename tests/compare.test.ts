import { describe, expect, it } from "vitest";
import {
  bestIndices, categoryShares, COMPARE_METRICS, compareValues, generateCategoryFact, generateComparisonFacts,
  indexedRevenueTrend, parseStoreSelection, type CompareMetricKey, type CompareStore,
} from "@/lib/analytics/compare";
import { computeKpis } from "@/lib/analytics/aggregate";
import type { MonthFact, StoreDTO } from "@/lib/analytics/types";

const blank = (): Record<CompareMetricKey, number | null> =>
  Object.fromEntries(COMPARE_METRICS.map((m) => [m.key, null])) as Record<CompareMetricKey, number | null>;
const store = (id: string, name: string, v: Partial<Record<CompareMetricKey, number | null>>): CompareStore => ({ id, name, values: { ...blank(), ...v } });

describe("generateComparisonFacts", () => {
  it("states the relative difference in revenue per m² between highest and lowest", () => {
    const facts = generateComparisonFacts([
      store("a", "Wien Donaustadt", { revenuePerSqm: 591 }),
      store("b", "Graz Lend", { revenuePerSqm: 500 }),
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.text).toBe("Wien Donaustadt generates 18.2% more revenue per m² than Graz Lend.");
    expect(facts[0]!.formula).toContain("× 100 = 18.2%");
  });
  it("orders by value, not by position, and notes the scope for more than two stores", () => {
    const facts = generateComparisonFacts([
      store("a", "A", { averageBasket: 10 }),
      store("b", "B", { averageBasket: 15 }),
      store("c", "C", { averageBasket: 12 }),
    ]);
    expect(facts[0]!.text).toBe("B has a 50.0% higher average basket than A. Highest vs lowest of 3 stores.");
  });
  it("uses percentage points for metrics that are already percentages", () => {
    const facts = generateComparisonFacts([
      store("a", "A", { grossMarginPct: 31.4 }),
      store("b", "B", { grossMarginPct: 29.3 }),
    ]);
    expect(facts[0]!.text).toBe("Gross margin is 2.1 points higher at A (31.4%) than at B (29.3%).");
  });
  it("produces nothing for missing data, a single value or equal values", () => {
    expect(generateComparisonFacts([store("a", "A", { revenue: 100 }), store("b", "B", {})])).toEqual([]);
    expect(generateComparisonFacts([store("a", "A", { revenue: 100 }), store("b", "B", { revenue: 100 })])).toEqual([]);
    expect(generateComparisonFacts([])).toEqual([]);
  });
  it("never explains why", () => {
    const facts = generateComparisonFacts([
      store("a", "A", { revenue: 2, customersPerDay: 3, averageBasket: 4, revenuePerSqm: 5, revenuePerEmployee: 6, yoyGrowthPct: 4, grossMarginPct: 30, costRatioPct: 20 }),
      store("b", "B", { revenue: 1, customersPerDay: 2, averageBasket: 3, revenuePerSqm: 4, revenuePerEmployee: 5, yoyGrowthPct: -2, grossMarginPct: 28, costRatioPct: 25 }),
    ]);
    expect(facts).toHaveLength(8);
    for (const f of facts) expect(f.text).not.toMatch(/because|due to|thanks to|caused|will /i);
  });
});

describe("bestIndices", () => {
  it("marks the highest or lowest, ignoring missing values", () => {
    expect(bestIndices([1, null, 3], "higher")).toEqual([2]);
    expect(bestIndices([1, null, 3], "lower")).toEqual([0]);
  });
  it("marks ties and nothing when there is nothing to compare", () => {
    expect(bestIndices([3, 3, 1], "higher")).toEqual([0, 1]);
    expect(bestIndices([3, 3], "higher")).toEqual([]);
    expect(bestIndices([3, null], "higher")).toEqual([]);
    expect(bestIndices([1, 2], "none")).toEqual([]);
  });
});

describe("indexedRevenueTrend", () => {
  const data: Record<string, Record<string, number>> = {
    a: { "2026-01": 200, "2026-02": 220, "2026-03": 210 },
    b: { "2026-02": 50, "2026-03": 60 },
  };
  const rev = (id: string, m: string) => data[id]?.[m] ?? null;
  it("indexes every store to 100 in the first month all stores have data", () => {
    const t = indexedRevenueTrend(["2026-01", "2026-02", "2026-03"], ["a", "b"], rev);
    expect(t.baseMonth).toBe("2026-02");
    expect(t.rows.map((r) => r.month)).toEqual(["2026-02", "2026-03"]);
    expect(t.rows[0]!.values).toEqual({ a: 100, b: 100 });
    expect(t.rows[1]!.values.a).toBeCloseTo(95.4545, 3);
    expect(t.rows[1]!.values.b).toBeCloseTo(120, 10);
  });
  it("has no base month when the stores never overlap", () => {
    expect(indexedRevenueTrend(["2026-01"], ["a", "b"], rev)).toEqual({ baseMonth: null, rows: [] });
  });
});

describe("categoryShares", () => {
  const facts = [
    { storeId: "a", categoryName: "Bakery", revenue: 30 },
    { storeId: "a", categoryName: "Dairy", revenue: 70 },
    { storeId: "b", categoryName: "Bakery", revenue: 10 },
    { storeId: "b", categoryName: "Dairy", revenue: 90 },
  ];
  it("computes each category's share of the store's category revenue", () => {
    const rows = categoryShares(facts, ["a", "b", "c"]);
    expect(rows[0]).toEqual({ categoryName: "Bakery", shares: { a: 30, b: 10, c: null } });
  });
  it("finds the widest category gap", () => {
    const f = generateCategoryFact(categoryShares(facts, ["a", "b"]), [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    expect(f!.text).toContain("Bakery accounts for 30.0% of revenue at A and 10.0% at B");
    expect(generateCategoryFact([], [])).toBeNull();
  });
});

describe("compareValues", () => {
  const s: StoreDTO = { id: "a", name: "A", code: "A", address: "", city: "", latitude: null, longitude: null, openingDate: null, areaSqm: 100, employees: 5, parkingSpaces: null, type: "SUPERMARKET", opensAt: null, closesAt: null, openDaysPerWeek: null, isDemo: false };
  const f = (month: string, revenue: number): MonthFact => ({ storeId: "a", month, revenue, transactions: null, customers: null, grossMarginPct: null, openDays: null, costs: {}, operatingCosts: null });
  it("computes YoY only when both windows are complete", () => {
    const cur = computeKpis([f("2026-01", 110), f("2026-02", 110)], [s]);
    const prevFull = computeKpis([f("2025-01", 100), f("2025-02", 100)], [s]);
    const prevPartial = computeKpis([f("2025-02", 100)], [s]);
    expect(compareValues(cur, prevFull, 2).yoyGrowthPct).toBeCloseTo(10, 10);
    expect(compareValues(cur, prevPartial, 2).yoyGrowthPct).toBeNull();
    expect(compareValues(cur, null, 2).yoyGrowthPct).toBeNull();
    expect(compareValues(cur, prevFull, 2).averageBasket).toBeNull();
  });
});

describe("parseStoreSelection", () => {
  const ids = ["a", "b", "c", "d", "e"];
  it("defaults to the first three stores", () => expect(parseStoreSelection(undefined, ids)).toEqual(["a", "b", "c"]));
  it("keeps known ids, drops unknown and duplicate ids, caps at four", () => {
    expect(parseStoreSelection("e,x,e,a,b,c,d", ids)).toEqual(["e", "a", "b", "c"]);
    expect(parseStoreSelection("", ids)).toEqual([]);
  });
});
