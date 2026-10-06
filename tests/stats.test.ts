import { describe, expect, it } from "vitest";
import {
  calculateDataQuality,
  detectAnomalies,
  forecastSeries,
  linearRegression,
  mean,
  median,
  pearson,
  seasonalIndices,
  stdev,
} from "@/lib/calc";

describe("basic statistics", () => {
  it("mean/median/stdev", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(mean([])).toBeNull();
    expect(stdev([1])).toBeNull();
  });
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("linear regression", () => {
    const f = linearRegression([0, 1, 2, 3], [5, 7, 9, 11])!;
    expect(f.slope).toBeCloseTo(2, 10);
    expect(f.intercept).toBeCloseTo(5, 10);
  });
});

describe("anomaly detection", () => {
  const flat = Array.from({ length: 24 }, (_, i) => 100 + (i % 3));
  it("flags a sudden drop and nothing else", () => {
    const s = [...flat];
    s[20] = 80;
    const a = detectAnomalies(s);
    expect(a.map((x) => x.index)).toEqual([20]);
    expect(a[0]!.direction).toBe("down");
    expect(a[0]!.basis).toBe("yoy");
  });
  it("does not flag steady growth", () => {
    const s = Array.from({ length: 24 }, (_, i) => 100 * 1.01 ** i);
    expect(detectAnomalies(s)).toEqual([]);
  });
  it("uses month-over-month for short series", () => {
    const s = [100, 101, 100, 102, 101, 130, 101, 100];
    const a = detectAnomalies(s, { zThreshold: 1.5 });
    expect(a.some((x) => x.index === 5 && x.basis === "mom")).toBe(true);
  });
  it("handles missing values without inventing them", () => {
    expect(detectAnomalies([null, null, 3])).toEqual([]);
  });
});

describe("seasonality and forecast", () => {
  // Two years: flat 100 with December at 150.
  const hist = Array.from({ length: 24 }, (_, i) => ({ month: (i % 12) + 1, value: (i % 12) + 1 === 12 ? 150 : 100 }));
  it("december index stands out", () => {
    const idx = seasonalIndices(hist);
    expect(idx[11]!.index!).toBeGreaterThan(1.35);
    expect(idx[0]!.index!).toBeLessThan(1);
    expect(idx[11]!.observations).toBe(2);
  });
  it("needs 12 points", () => {
    expect(seasonalIndices(hist.slice(0, 6)).every((x) => x.index === null)).toBe(true);
    expect(forecastSeries(hist.slice(0, 6), 3)).toBeNull();
  });
  it("forecast repeats the seasonal shape with an interval around it", () => {
    const f = forecastSeries(hist, 12)!;
    expect(f.model).toBe("linear-trend × seasonal-index");
    expect(f.points).toHaveLength(12);
    const dec = f.points[11]!;
    const jan = f.points[0]!;
    expect(dec.value).toBeGreaterThan(jan.value * 1.3);
    for (const p of f.points) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
    expect(f.assumptions.length).toBeGreaterThan(2);
  });
  it("linear data is forecast exactly by the trend model", () => {
    const lin = Array.from({ length: 14 }, (_, i) => ({ month: (i % 12) + 1, value: 10 + 2 * i }));
    const f = forecastSeries(lin, 2)!;
    expect(f.model).toBe("linear-trend");
    expect(f.points[0]!.value).toBeCloseTo(38, 6);
    expect(f.points[1]!.value).toBeCloseTo(40, 6);
    expect(f.residualStdev).toBeCloseTo(0, 6);
  });
});

describe("data quality", () => {
  it("is plain completeness", () => {
    const q = calculateDataQuality([
      { key: "a", label: "A", present: true, impact: "" },
      { key: "b", label: "B", present: true, impact: "" },
      { key: "c", label: "C", present: false, impact: "x" },
      { key: "d", label: "D", present: true, impact: "" },
    ]);
    expect(q.scorePct).toBe(75);
    expect(q.missing.map((m) => m.key)).toEqual(["c"]);
  });
});
