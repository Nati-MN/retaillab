import { describe, expect, it } from "vitest";
import { buildStoreQualityChecks, storeDataQuality, type StoreQualityInput } from "@/lib/analytics/quality";
import { compareWithPeers } from "@/lib/analytics/peerComparison";
import { comparePeriods } from "@/lib/analytics/periodCompare";
import { storeCategoryBreakdown } from "@/lib/analytics/storeCategories";
import { computeKpis } from "@/lib/analytics/aggregate";
import type { CategoryFact, Kpis, MonthFact, StoreDTO } from "@/lib/analytics/types";
import { parseMonthlyCsv } from "@/lib/onboarding/csv";
import { addMonths, monthRange, resolvePeriod } from "@/lib/period";

const store = (over: Partial<StoreDTO> = {}): StoreDTO => ({
  id: "s1", name: "Store 1", code: "S1", address: "A", city: "C", latitude: 48, longitude: 16,
  openingDate: null, areaSqm: 1000, employees: 20, parkingSpaces: 10, type: "SUPERMARKET",
  opensAt: "07:00", closesAt: "20:00", openDaysPerWeek: 6, isDemo: false, ...over,
});

const full: StoreQualityInput = {
  store: store(),
  revenueMonths: 24, monthsWithTransactions: 24, monthsWithCustomers: 24, monthsWithMargin: 24,
  monthsWithCosts: 24, monthsWithWasteCost: 24, categoryRevenueRows: 240, categoryMarginRows: 240,
  categoryWasteRows: 240, hourlyRows: 80, researchItems: 3,
};

describe("storeDataQuality", () => {
  it("scores 100% when every input exists", () => {
    const q = storeDataQuality(full);
    expect(q.checks).toHaveLength(16);
    expect(q.scorePct).toBe(100);
    expect(q.missing).toEqual([]);
  });

  it("lists exactly the missing inputs and explains each gap", () => {
    const q = storeDataQuality({ ...full, hourlyRows: 0, categoryMarginRows: 0, categoryWasteRows: 0, monthsWithWasteCost: 0 });
    expect(q.missing.map((c) => c.key)).toEqual(["categoryMargins", "waste", "hourlyTraffic"]);
    expect(q.scorePct).toBeCloseTo((13 / 16) * 100);
    for (const c of q.missing) expect(c.impact.length).toBeGreaterThan(20);
  });

  it("treats 0 parking spaces as provided and null as missing", () => {
    const key = (i: StoreQualityInput) => buildStoreQualityChecks(i).find((c) => c.key === "parking")!.present;
    expect(key({ ...full, store: store({ parkingSpaces: 0 }) })).toBe(true);
    expect(key({ ...full, store: store({ parkingSpaces: null }) })).toBe(false);
  });

  it("counts waste as present from either category waste or a waste cost line", () => {
    const waste = (i: StoreQualityInput) => buildStoreQualityChecks(i).find((c) => c.key === "waste")!.present;
    expect(waste({ ...full, categoryWasteRows: 0 })).toBe(true);
    expect(waste({ ...full, monthsWithWasteCost: 0 })).toBe(true);
    expect(waste({ ...full, monthsWithWasteCost: 0, categoryWasteRows: 0 })).toBe(false);
  });

  it("separates the 12- and 24-month history thresholds and needs both coordinates", () => {
    const q = storeDataQuality({ ...full, revenueMonths: 13, store: store({ longitude: null, opensAt: null }) });
    const by = Object.fromEntries(q.checks.map((c) => [c.key, c.present]));
    expect(by.revenue12).toBe(true);
    expect(by.revenue24).toBe(false);
    expect(by.coordinates).toBe(false);
    expect(by.openingHours).toBe(false);
  });

  it("an empty store scores 0% without throwing", () => {
    const q = storeDataQuality({
      store: { latitude: null, longitude: null, areaSqm: null, employees: null, opensAt: null, closesAt: null, parkingSpaces: null },
      revenueMonths: 0, monthsWithTransactions: 0, monthsWithCustomers: 0, monthsWithMargin: 0, monthsWithCosts: 0,
      monthsWithWasteCost: 0, categoryRevenueRows: 0, categoryMarginRows: 0, categoryWasteRows: 0, hourlyRows: 0, researchItems: 0,
    });
    expect(q.scorePct).toBe(0);
    expect(q.missing).toHaveLength(16);
  });
});

const fact = (storeId: string, month: string, revenue: number, over: Partial<MonthFact> = {}): MonthFact => ({
  storeId, month, revenue, transactions: null, customers: null, grossMarginPct: null, openDays: null, costs: {}, operatingCosts: null, ...over,
});

describe("compareWithPeers", () => {
  const kp = (revenue: number | null, margin: number | null): Kpis => ({ ...computeKpis([], []), revenue, grossMarginPct: margin });
  const map = new Map<string, Kpis>([["a", kp(120, 30)], ["b", kp(100, 28)], ["c", kp(80, null)], ["d", kp(200, 33)]]);

  it("uses the median of the OTHER stores and a relative difference", () => {
    const [rev] = compareWithPeers("a", map, ["revenue"]);
    expect(rev!.peerMedian).toBe(100);
    expect(rev!.peers).toBe(3);
    expect(rev!.difference).toBeCloseTo(20);
    expect(rev!.unit).toBe("%");
  });

  it("compares percentages in points and skips peers without a value", () => {
    const [m] = compareWithPeers("a", map, ["grossMarginPct"]);
    expect(m!.peers).toBe(2);
    expect(m!.peerMedian).toBeCloseTo(30.5);
    expect(m!.difference).toBeCloseTo(-0.5);
    expect(m!.unit).toBe("pts");
  });

  it("returns null when the store or all peers lack the value", () => {
    expect(compareWithPeers("c", map, ["grossMarginPct"])[0]!.difference).toBeNull();
    const solo = new Map([["a", kp(120, 30)]]);
    const r = compareWithPeers("a", solo, ["revenue"])[0]!;
    expect(r.peerMedian).toBeNull();
    expect(r.difference).toBeNull();
  });
});

describe("comparePeriods", () => {
  const s = [store()];
  const months = monthRange("2024-10", "2026-09");
  const facts = months.map((m, i) => fact("s1", m, 100 + i));

  it("reports both comparisons when the comparison periods are fully covered", () => {
    const c = comparePeriods(facts, s, resolvePeriod("2026-09", "3m"));
    expect(c.current.revenue).toBe(121 + 122 + 123);
    expect(c.vsPrevious.revenue).toBeCloseTo(((366 - 357) / 357) * 100);
    expect(c.vsPreviousYear.revenue).toBeCloseTo(((366 - 330) / 330) * 100);
    expect(c.referencesCoincide).toBe(false);
    expect(comparePeriods(facts, s, resolvePeriod("2026-09", "12m")).referencesCoincide).toBe(true);
  });

  it("returns null deltas when the comparison period has fewer months of data", () => {
    const c = comparePeriods(facts.filter((f) => f.month >= addMonths("2026-09", -14)), s, resolvePeriod("2026-09", "12m"));
    expect(c.previousComparable).toBe(false);
    expect(c.vsPrevious.revenue).toBeNull();
    expect(c.vsPreviousYear.revenue).toBeNull();
    expect(c.current.revenue).not.toBeNull();
  });

  it("has nothing to compare when there is no data at all", () => {
    const c = comparePeriods([], s, resolvePeriod("2026-09", "1m"));
    expect(c.current.revenue).toBeNull();
    expect(c.vsPrevious.revenue).toBeNull();
  });
});

describe("storeCategoryBreakdown", () => {
  const cf = (categoryId: string, month: string, revenue: number, over: Partial<CategoryFact> = {}): CategoryFact => ({
    storeId: "s1", categoryId, categoryName: categoryId.toUpperCase(), month, revenue,
    marginPct: null, wasteValue: null, stockoutRatePct: null, areaSqm: null, ...over,
  });

  it("computes share, weighted margin, growth, waste and revenue per m²", () => {
    const cur = [
      cf("bak", "2026-08", 100, { marginPct: 40, wasteValue: 5, stockoutRatePct: 2, areaSqm: 10 }),
      cf("bak", "2026-09", 300, { marginPct: 50, wasteValue: 7, stockoutRatePct: 4, areaSqm: 10 }),
      cf("bev", "2026-08", 300), cf("bev", "2026-09", 300),
    ];
    const prev = [cf("bak", "2025-08", 100), cf("bak", "2025-09", 100), cf("bev", "2025-09", 250)];
    const rows = storeCategoryBreakdown(cur, prev);
    expect(rows.map((r) => r.categoryId)).toEqual(["bev", "bak"]);
    const bak = rows[1]!;
    expect(bak.sharePct).toBeCloseTo(40);
    expect(bak.marginPct).toBeCloseTo(47.5);
    expect(bak.growthPct).toBeCloseTo(100);
    expect(bak.wasteValue).toBe(12);
    expect(bak.wasteSharePct).toBeCloseTo(3);
    expect(bak.stockoutRatePct).toBe(3);
    expect(bak.revenuePerSqm).toBe(20);
  });

  it("keeps missing inputs as null and withholds growth when last year is incomplete", () => {
    const rows = storeCategoryBreakdown(
      [cf("bev", "2026-08", 300), cf("bev", "2026-09", 300, { wasteValue: 2 })],
      [cf("bev", "2025-09", 250)],
    );
    const bev = rows[0]!;
    expect(bev.marginPct).toBeNull();
    expect(bev.growthPct).toBeNull();
    expect(bev.wasteValue).toBeNull();
    expect(bev.stockoutRatePct).toBeNull();
    expect(bev.revenuePerSqm).toBeNull();
  });

  it("returns an empty list for no data", () => {
    expect(storeCategoryBreakdown([])).toEqual([]);
  });
});

describe("parseMonthlyCsv", () => {
  it("parses full and partial lines, decimal commas, tabs, comments and a header", () => {
    const r = parseMonthlyCsv("month;revenue;transactions;customers;margin\n# history\n2026-07;412500,50;21400;19800;29,4\n2026-08;398000\n\n2026-09\t405000\t\t20100\t");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { month: "2026-07", revenue: 412500.5, transactions: 21400, customers: 19800, grossMarginPct: 29.4 },
      { month: "2026-08", revenue: 398000, transactions: undefined, customers: undefined, grossMarginPct: undefined },
      { month: "2026-09", revenue: 405000, transactions: undefined, customers: 20100, grossMarginPct: undefined },
    ]);
  });

  it("reports every bad line with its line number", () => {
    const r = parseMonthlyCsv("2026-13;100\n2026-08;abc\n2026-09;100;1.5\n2026-09;100;;;140\n2026-07\n2026-06;1;2;3;4;5");
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.errors[0]!.message).toMatch(/YYYY-MM/);
    expect(r.errors[1]!.message).toMatch(/revenue "abc" is not a number/);
    expect(r.errors[2]!.message).toMatch(/whole number/);
    expect(r.errors[3]!.message).toMatch(/margin must be between/);
    expect(r.errors[5]!.message).toMatch(/Too many fields/);
  });

  it("rejects duplicate months, thousands separators and empty input", () => {
    const d = parseMonthlyCsv("2026-08;100\n2026-08;200");
    expect(d.errors).toEqual([{ line: 2, message: "month 2026-08 already appears on line 1" }]);
    expect(parseMonthlyCsv("2026-08;412.500,00").errors).toHaveLength(1);
    expect(parseMonthlyCsv("  \n").errors[0]!.message).toMatch(/Nothing to import/);
  });
});
