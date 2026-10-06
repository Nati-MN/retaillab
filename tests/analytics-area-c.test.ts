import { describe, expect, it } from "vitest";
import { aggregateCategories, categoryMatrix } from "@/lib/analytics/categories";
import { cellValue, costComparison, costTable, costTrend } from "@/lib/analytics/costs";
import { calendarContext, easterSunday, fullYears, indexToPct, yoyPivot } from "@/lib/analytics/seasonality";
import { criticalR, leaveOneOutRange, openingHoursPerWeek, parseClock, patternCell, patternMatrix, storeAttributes, type PatternStore } from "@/lib/analytics/patterns";
import { anomalyGuidance, metricSeries, typicalChange } from "@/lib/analytics/anomalyContext";
import type { CategoryFact, MonthFact, StoreDTO } from "@/lib/analytics/types";

const cat = (o: Partial<CategoryFact> & Pick<CategoryFact, "storeId" | "categoryId" | "month" | "revenue">): CategoryFact => ({
  categoryName: o.categoryId.toUpperCase(), marginPct: null, wasteValue: null, stockoutRatePct: null, areaSqm: null, ...o,
});

const store = (id: string, o: Partial<StoreDTO> = {}): StoreDTO => ({
  id, name: `Store ${id}`, code: id, address: "", city: "", latitude: null, longitude: null, openingDate: null,
  areaSqm: 100, employees: 10, parkingSpaces: 5, type: "SUPERMARKET", opensAt: "08:00", closesAt: "18:00", openDaysPerWeek: 6, isDemo: false, ...o,
});

const fact = (storeId: string, month: string, revenue: number, costs: MonthFact["costs"], o: Partial<MonthFact> = {}): MonthFact => ({
  storeId, month, revenue, transactions: 100, customers: 50, grossMarginPct: 30, openDays: 25, costs,
  operatingCosts: Object.keys(costs).length ? Object.values(costs).reduce((a, b) => a + (b ?? 0), 0) : null, ...o,
});

describe("aggregateCategories", () => {
  const current = [
    cat({ storeId: "a", categoryId: "dairy", month: "2026-01", revenue: 1000, marginPct: 30, wasteValue: 20, stockoutRatePct: 2, areaSqm: 10 }),
    cat({ storeId: "a", categoryId: "dairy", month: "2026-02", revenue: 1000, marginPct: 20, wasteValue: 40, stockoutRatePct: 4, areaSqm: 10 }),
    cat({ storeId: "b", categoryId: "dairy", month: "2026-01", revenue: 2000, areaSqm: 20 }),
    cat({ storeId: "a", categoryId: "meat", month: "2026-01", revenue: 4000, marginPct: 10 }),
  ];
  const previous = [
    cat({ storeId: "a", categoryId: "dairy", month: "2025-01", revenue: 800 }),
    cat({ storeId: "b", categoryId: "dairy", month: "2025-01", revenue: 2000 }),
    cat({ storeId: "a", categoryId: "meat", month: "2025-01", revenue: 5000 }),
  ];
  const a = aggregateCategories(current, previous);
  const dairy = a.rows.find((r) => r.categoryId === "dairy")!;
  const meat = a.rows.find((r) => r.categoryId === "meat")!;

  it("sums revenue, shares and sorts by revenue", () => {
    expect(a.totalRevenue).toBe(8000);
    expect(a.rows.map((r) => r.categoryId)).toEqual(["dairy", "meat"]);
    expect(dairy.revenue).toBe(4000);
    expect(dairy.sharePct).toBe(50);
  });
  it("weights margin by revenue over rows that have one", () => {
    expect(dairy.marginPct).toBe(25); // store b has no margin and is left out of both sums
    expect(a.totalMarginPct).toBeCloseTo((1000 * 30 + 1000 * 20 + 4000 * 10) / 6000, 10);
  });
  it("computes growth on matched store-months only", () => {
    // matched: a/Jan (1000 vs 800) + b/Jan (2000 vs 2000); a/Feb has no counterpart
    expect(dairy.growthPct).toBeCloseTo(((3000 - 2800) / 2800) * 100, 10);
    expect(dairy.growthMatched).toBe(2);
    expect(dairy.growthTotal).toBe(3);
    expect(meat.growthPct).toBe(-20);
    expect(a.totalGrowthPct).toBeCloseTo(((7000 - 7800) / 7800) * 100, 10);
  });
  it("revenue per m² uses Σ revenue ÷ Σ area-months", () => {
    expect(dairy.revenuePerSqm).toBe(4000 / 40);
    expect(meat.revenuePerSqm).toBeNull();
  });
  it("waste and stockouts only over rows that recorded them", () => {
    expect(dairy.wasteValue).toBe(60);
    expect(dairy.wastePct).toBe(3); // 60 / 2000 — store b's revenue is not in the denominator
    expect(dairy.stockoutRatePct).toBe(3);
    expect(meat.wasteValue).toBeNull();
    expect(meat.wastePct).toBeNull();
    expect(meat.stockoutRatePct).toBeNull();
  });
  it("reports which stores lack a field", () => {
    expect(a.coverage.margin).toEqual({ full: ["a"], partial: [], none: ["b"] });
    expect(a.coverage.waste.partial).toEqual(["a"]);
    expect(a.coverage.waste.none).toEqual(["b"]);
  });
  it("returns nulls without data", () => {
    const e = aggregateCategories([], []);
    expect(e.rows).toEqual([]);
    expect(e.totalRevenue).toBeNull();
    expect(e.totalGrowthPct).toBeNull();
    expect(aggregateCategories(current, []).rows[0]!.growthPct).toBeNull();
  });
  it("builds the matrix against the selection's own averages", () => {
    const m = categoryMatrix(a);
    expect(m.growthDivider).toBe(a.totalGrowthPct);
    expect(m.marginDivider).toBe(a.totalMarginPct);
    expect(m.points.find((p) => p.categoryId === "dairy")!.quadrant).toBe("HIGH_GROWTH_HIGH_MARGIN");
    expect(m.points.find((p) => p.categoryId === "meat")!.quadrant).toBe("LOW_GROWTH_LOW_MARGIN");
    const none = categoryMatrix(aggregateCategories(current, []));
    expect(none.points).toEqual([]);
    expect(none.omitted).toHaveLength(2);
  });
});

describe("costTable", () => {
  const stores = [store("a"), store("b", { areaSqm: 300 })];
  const facts = [
    fact("a", "2026-01", 1000, { PERSONNEL: 100, WASTE: 10 }),
    fact("a", "2026-02", 1000, { PERSONNEL: 100, WASTE: 30 }),
    fact("b", "2026-01", 3000, { PERSONNEL: 300 }),
    fact("b", "2026-02", 3000, { PERSONNEL: 300 }),
  ];
  const t = costTable(facts, stores);

  it("computes a fully recorded line over everything", () => {
    const p = t.byType.PERSONNEL;
    expect(p.amount).toBe(800);
    expect(p.sharePct).toBe(10);
    expect(p.perCustomer).toBe(4);
    expect(p.perSqmMonthly).toBe(800 / (100 * 2 + 300 * 2));
    expect(p.missingStoreIds).toEqual([]);
  });
  it("computes a partly recorded line only over the stores that recorded it", () => {
    const w = t.byType.WASTE;
    expect(w.amount).toBe(40);
    expect(w.sharePct).toBe(2); // 40 / 2000 — store b's revenue is not in the denominator
    expect(w.perSqmMonthly).toBe(40 / 200);
    expect(w.missingStoreIds).toEqual(["b"]);
    expect(t.excludedTypes).toEqual(["WASTE"]);
  });
  it("types nobody recorded are null, never 0", () => {
    expect(t.byType.RENT.amount).toBeNull();
    expect(t.byType.RENT.sharePct).toBeNull();
    expect(t.excludedTypes).not.toContain("RENT");
  });
  it("total is the sum of recorded lines", () => {
    expect(t.total.amount).toBe(840);
    expect(t.total.sharePct).toBe(10.5);
    expect(t.revenue).toBe(8000);
  });
  it("per-customer and per-m² are null when a denominator is missing", () => {
    const x = costTable([fact("a", "2026-01", 1000, { RENT: 50 }, { customers: null })], [store("a", { areaSqm: null })]);
    expect(x.byType.RENT.perCustomer).toBeNull();
    expect(x.byType.RENT.perSqmMonthly).toBeNull();
    expect(x.byType.RENT.sharePct).toBe(5);
  });
  it("flags partial months", () => {
    const x = costTable([fact("a", "2026-01", 1000, { RENT: 50 }), fact("a", "2026-02", 1000, {})], [store("a")]);
    expect(x.byType.RENT.partialStoreIds).toEqual(["a"]);
    expect(x.byType.RENT.sharePct).toBe(5);
    expect(x.total.partialStoreIds).toEqual(["a"]);
  });
  it("comparison and metric accessor", () => {
    const cmp = costComparison(facts, stores);
    expect(cmp.map((c) => c.storeId)).toEqual(["a", "b"]);
    expect(cellValue(cmp[0]!.table.byType.WASTE, "share")).toBe(2);
    expect(cellValue(cmp[1]!.table.byType.WASTE, "abs")).toBeNull();
    expect(cmp[1]!.table.byType.WASTE.missingStoreIds).toEqual(["b"]);
    expect(cellValue(cmp[1]!.table.byType.PERSONNEL, "perSqm")).toBe(1);
    expect(cellValue(cmp[1]!.table.byType.PERSONNEL, "perCustomer")).toBe(6);
  });
  it("trend keeps gaps as null", () => {
    const tr = costTrend(facts, "2026-01", "2026-03");
    expect(tr.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(tr[0]!.amounts.PERSONNEL).toBe(400);
    expect(tr[0]!.sharePct.WASTE).toBe(1);
    expect(tr[1]!.sharePct.WASTE).toBe(3);
    expect(tr[2]!.amounts.PERSONNEL).toBeNull();
    expect(tr[2]!.sharePct.PERSONNEL).toBeNull();
  });
});

describe("seasonality helpers", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2019)).toBe("2019-04-21");
    expect(easterSunday(2008)).toBe("2008-03-23");
    expect(easterSunday(2038)).toBe("2038-04-25");
    expect(easterSunday(1961)).toBe("1961-04-02");
  });
  it("pivots months by year", () => {
    const p = yoyPivot([
      { month: "2024-12", value: 5 }, { month: "2025-01", value: 6 }, { month: "2025-12", value: 7 }, { month: "2026-01", value: null },
    ]);
    expect(p.years).toEqual([2024, 2025]);
    expect(p.rows).toHaveLength(12);
    expect(p.rows[11]!.values).toEqual({ 2024: 5, 2025: 7 });
    expect(p.rows[0]!.values).toEqual({ 2024: null, 2025: 6 });
  });
  it("index to percent", () => {
    expect(indexToPct(1.08)).toBeCloseTo(8, 10);
    expect(indexToPct(null)).toBeNull();
  });
  it("calendar context places Easter by computed date and only inside the data window", () => {
    const idx = Array.from({ length: 12 }, (_, k) => ({ month: k + 1, index: 1 + k / 100, observations: 2 }));
    const months = ["2024-03", "2025-03", "2025-04", "2025-07", "2025-08", "2025-12", "2026-01"];
    const rows = calendarContext(idx, months, "Summer holidays");
    const march = rows.find((r) => r.key === "easter-3")!;
    const april = rows.find((r) => r.key === "easter-4")!;
    expect(march.context).toContain("2024-03-31");
    expect(march.note).toContain("1 of the 2");
    expect(april.context).toContain("2025-04-20");
    expect(april.context).not.toContain("2026"); // April 2026 is not in the window
    expect(april.index).toBeCloseTo(1.03, 10);
    const summer = rows.find((r) => r.key === "summer")!;
    expect(summer.index).toBeCloseTo((1.06 + 1.07) / 2, 10);
    expect(summer.context).toBe("Summer holidays");
    expect(rows.find((r) => r.key === "christmas")!.index).toBeCloseTo(1.11, 10);
  });
  it("calendar context yields null index when a month has none", () => {
    const idx = Array.from({ length: 12 }, (_, k) => ({ month: k + 1, index: k === 7 ? null : 1, observations: k === 7 ? 0 : 1 }));
    const summer = calendarContext(idx, ["2025-07"]).find((r) => r.key === "summer")!;
    expect(summer.index).toBeNull();
    expect(summer.observations).toBe(0);
  });
  it("full years", () => {
    expect(fullYears(24)).toBe(2);
    expect(fullYears(23)).toBe(1);
    expect(fullYears(11)).toBe(0);
  });
});

describe("patterns", () => {
  it("parses clock strings and opening hours", () => {
    expect(parseClock("07:30")).toBe(7.5);
    expect(parseClock("7am")).toBeNull();
    expect(parseClock(null)).toBeNull();
    expect(openingHoursPerWeek({ opensAt: "07:30", closesAt: "20:00", openDaysPerWeek: 6 })).toBe(75);
    expect(openingHoursPerWeek({ opensAt: "07:30", closesAt: null, openDaysPerWeek: 6 })).toBeNull();
    expect(openingHoursPerWeek({ opensAt: "20:00", closesAt: "07:00", openDaysPerWeek: 6 })).toBeNull();
  });
  it("derives attributes; unknown stays null", () => {
    const a = storeAttributes(store("a", { employees: 19, areaSqm: 720, parkingSpaces: null }), null);
    expect(a.staffDensity).toBeCloseTo(2.6389, 4);
    expect(a.parking).toBeNull();
    expect(a.competitors).toBeNull();
    expect(storeAttributes(store("a"), 0).competitors).toBe(0);
  });
  const mk = (id: string, parking: number | null, rev: number | null): PatternStore => ({
    storeId: id, storeName: id,
    attributes: { parking, hours: 60, staffDensity: 2, area: 500, competitors: 1 },
    outcomes: { revenuePerSqm: rev, averageBasket: 20, customersPerDay: 900, grossMarginPct: 30 },
  });
  const stores = [mk("a", 10, 100), mk("b", 20, 200), mk("c", 30, 300), mk("d", null, 50), mk("e", 40, null)];
  it("correlates only stores with both values and lists the rest", () => {
    const c = patternCell(stores, "parking", "revenuePerSqm");
    expect(c.n).toBe(3);
    expect(c.r).toBeCloseTo(1, 10);
    expect(c.excluded).toEqual(["d", "e"]);
  });
  it("returns null r for constant values or too few stores", () => {
    expect(patternCell(stores, "hours", "revenuePerSqm").r).toBeNull();
    expect(patternCell(stores.slice(0, 2), "parking", "revenuePerSqm").r).toBeNull();
  });
  it("builds a 5 × 4 matrix", () => {
    const m = patternMatrix(stores);
    expect(m).toHaveLength(5);
    expect(m[0]).toHaveLength(4);
    expect(m[0]![0]!.attribute).toBe("parking");
    expect(m[0]![3]!.outcome).toBe("grossMarginPct");
  });
  it("leave-one-out shows how one store drives r", () => {
    const pts = [
      { storeName: "a", x: 1, y: 2 }, { storeName: "b", x: 2, y: 1 }, { storeName: "c", x: 3, y: 2 }, { storeName: "d", x: 2, y: 3 },
      { storeName: "outlier", x: 20, y: 20 },
    ];
    const full = patternCell(pts.map((p) => mk(p.storeName, p.x, p.y)), "parking", "revenuePerSqm").r!;
    expect(full).toBeGreaterThan(0.95);
    const loo = leaveOneOutRange(pts)!;
    expect(loo.minWithout).toBe("outlier");
    expect(loo.min).toBeCloseTo(0, 10);
    expect(loo.max).toBeGreaterThan(0.95);
    expect(leaveOneOutRange(pts.slice(0, 3))).toBeNull();
  });
  it("critical r table", () => {
    expect(criticalR(6)).toBe(0.811);
    expect(criticalR(2)).toBeNull();
    expect(criticalR(40)).toBeNull();
  });
});

describe("anomaly context", () => {
  const facts = [
    fact("a", "2026-01", 1000, { ENERGY: 70 }),
    fact("a", "2026-03", 1200, {}, { transactions: null, grossMarginPct: 28 }),
    fact("b", "2026-02", 9999, { ENERGY: 1 }),
  ];
  it("builds the series with gaps", () => {
    expect(metricSeries(facts, "a", "revenue", "2026-01", "2026-03").map((p) => p.value)).toEqual([1000, null, 1200]);
    expect(metricSeries(facts, "a", "cost:ENERGY", "2026-01", "2026-03").map((p) => p.value)).toEqual([70, null, null]);
    expect(metricSeries(facts, "a", "averageBasket", "2026-01", "2026-03").map((p) => p.value)).toEqual([10, null, null]);
    expect(metricSeries(facts, "a", "grossMarginPct", "2026-03", "2026-03")[0]!.value).toBe(28);
    expect(metricSeries(facts, "a", "customers", "2026-01", "2026-01")[0]!.value).toBe(50);
  });
  it("has guidance for every analysed metric and a generic fallback", () => {
    for (const m of ["revenue", "customers", "averageBasket", "grossMarginPct", "cost:ENERGY", "cost:WASTE", "cost:PERSONNEL"] as const) {
      const g = anomalyGuidance(m);
      expect(g.internal.length).toBeGreaterThan(0);
      expect(g.missing.length).toBeGreaterThan(0);
    }
    expect(anomalyGuidance("cost:RENT").internal.length).toBeGreaterThan(0);
    expect(anomalyGuidance("cost:ENERGY").external).toContain("Tariff change");
  });
  it("typical change is the median change on the detection basis", () => {
    expect(typicalChange([100, 110, 121, 133.1, 146.41], "mom")).toBeCloseTo(10, 8);
    expect(typicalChange([100, 110, 121], "mom")).toBeNull();
    const twoYears = [...Array.from({ length: 12 }, () => 100), ...Array.from({ length: 12 }, (_, i) => (i === 3 ? 50 : 104))];
    expect(typicalChange(twoYears, "yoy")).toBeCloseTo(4, 8);
    expect(typicalChange([100, null, 110, 121, 133.1, 146.41, 161.051], "mom")).toBeCloseTo(10, 8);
  });
});
