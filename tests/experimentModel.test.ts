import { describe, expect, it } from "vitest";
import {
  canTransition, durationDays, endDateAfterWeeks, experimentLimitations, fmtMetric, fmtMetricDelta, guessMetricUnit,
  liftLines, orderMetrics, seasonOf, seasonSpan, strategyStatusForDecision, timelineLayout, type ExperimentMetricDTO,
} from "@/lib/experiments/model";

const NB = " ";
const metric = (o: Partial<ExperimentMetricDTO>): ExperimentMetricDTO => ({
  id: "m", name: "Bakery revenue / month", unit: "EUR", isPrimary: true,
  testBefore: null, testAfter: null, controlBefore: null, controlAfter: null, ...o,
});
const bakery = metric({ testBefore: 12_400, testAfter: 13_950, controlBefore: 10_000, controlAfter: 10_210 });

describe("liftLines (spec example)", () => {
  const lines = liftLines(bakery, { hasControl: true })!;
  const by = (k: string) => lines.find((l) => l.key === k)!;
  it("shows before/after and every derived figure", () => {
    expect(by("before").result).toBe(`€${NB}12,400`);
    expect(by("after").result).toBe(`€${NB}13,950`);
    expect(by("rawAbs").result).toBe(`+€${NB}1,550`);
    expect(by("rawPct").result).toBe("+12.5%");
    expect(by("controlPct").result).toBe("+2.1%");
    expect(by("adjusted").result).toBe(`+10.4${NB}pts`);
    expect(by("expected").result).toBe(`€${NB}12,660`);
    expect(by("absDiff").result).toBe(`+€${NB}1,290`);
    expect(by("relDiff").result).toBe("+10.2%");
  });
  it("writes the formula with the actual numbers", () => {
    expect(by("rawPct").expr).toBe("(13,950 − 12,400) / 12,400 × 100");
    expect(by("controlPct").expr).toBe("(10,210 − 10,000) / 10,000 × 100");
    expect(by("adjusted").expr).toBe("+12.5% − (+2.1%)");
    expect(by("expected").expr).toBe("12,400 × (1 + 2.1%)");
  });
  it("keeps the control rows but leaves them empty without a control store", () => {
    const l = liftLines(bakery, { hasControl: false })!;
    expect(l.find((x) => x.key === "adjusted")!.result).toBe("—");
    expect(l.find((x) => x.key === "controlPct")!.note).toBe("No control store");
    expect(l.find((x) => x.key === "rawPct")!.result).toBe("+12.5%");
  });
  it("returns null when results are not entered", () => {
    expect(liftLines(metric({ testBefore: 283 }), { hasControl: true })).toBeNull();
  });
});

describe("formatting by unit", () => {
  it("formats money, counts and percentages", () => {
    expect(fmtMetric(15.42, "EUR")).toBe(`€${NB}15.42`);
    expect(fmtMetric(20_650, "count")).toBe("20,650");
    expect(fmtMetric(34.6, "pct")).toBe("34.6%");
    expect(fmtMetric(null, "EUR")).toBe("—");
  });
  it("percent metrics change in points", () => {
    expect(fmtMetricDelta(0.2, "pct")).toBe(`+0.2${NB}pts`);
    expect(fmtMetricDelta(-25, "count")).toBe("−25");
  });
});

describe("status and decisions", () => {
  it("allows the sensible transitions only", () => {
    expect(canTransition("PLANNED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransition("PLANNED", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "RUNNING")).toBe(true);
    expect(canTransition("COMPLETED", "STOPPED")).toBe(false);
  });
  it("maps decisions to strategy status", () => {
    expect(strategyStatusForDecision("ADOPT")).toBe("VALIDATED");
    expect(strategyStatusForDecision("REJECT")).toBe("REJECTED");
    expect(strategyStatusForDecision("INCONCLUSIVE")).toBeNull();
    expect(strategyStatusForDecision("REPEAT")).toBeNull();
  });
  it("orders the primary metric first", () => {
    const ms = [metric({ id: "a", isPrimary: false }), metric({ id: "b", isPrimary: true })];
    expect(orderMetrics(ms).map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("dates and seasons", () => {
  it("computes week-based end dates inclusive of the start day", () => {
    expect(endDateAfterWeeks("2025-09-01", 6)).toBe("2025-10-12");
    expect(endDateAfterWeeks("2026-02-02", 4)).toBe("2026-03-01");
    expect(endDateAfterWeeks("", 4)).toBeNull();
  });
  it("counts days inclusively", () => {
    expect(durationDays("2025-09-01", "2025-10-12")).toBe(42);
    expect(durationDays("2025-09-02", "2025-09-01")).toBeNull();
    expect(durationDays(null, "2025-09-01")).toBeNull();
  });
  it("names seasons by months", () => {
    expect(seasonOf("2025-12-15")).toBe("Dec–Feb");
    expect(seasonOf("2025-02-01")).toBe("Dec–Feb");
    expect(seasonOf("2025-07-01")).toBe("Jun–Aug");
  });
  it("flags a baseline in another season", () => {
    expect(seasonSpan("2025-09-01", "2025-10-12")).toEqual({ before: ["Jun–Aug"], during: ["Sep–Nov"], differs: true });
    expect(seasonSpan("2025-10-15", "2025-11-11")!.differs).toBe(false);
  });
});

describe("experimentLimitations", () => {
  const base = { status: "COMPLETED" as const, startDate: "2025-10-15", endDate: "2025-11-11", controlStore: { id: "c", name: "C" }, metrics: [bakery] };
  it("always includes the general limitations", () => {
    const l = experimentLimitations(base);
    expect(l.filter((x) => x.scope === "case")).toHaveLength(0);
    expect(l.filter((x) => x.scope === "general")).toHaveLength(4);
  });
  it("adds no-control, season, short-window, stopped and missing-value limitations", () => {
    const l = experimentLimitations({
      status: "STOPPED", startDate: "2026-05-25", endDate: "2026-06-07", controlStore: null,
      metrics: [bakery, metric({ id: "x", name: "Voucher redemptions", isPrimary: false })],
    }).filter((x) => x.scope === "case").map((x) => x.text);
    expect(l.some((t) => t.startsWith("No control store"))).toBe(true);
    expect(l.some((t) => t.includes("different seasons"))).toBe(true);
    expect(l.some((t) => t.includes("14 days"))).toBe(true);
    expect(l.some((t) => t.includes("stopped early"))).toBe(true);
    expect(l.some((t) => t.includes("Voucher redemptions"))).toBe(true);
  });
  it("reports missing control values when a control store exists", () => {
    const l = experimentLimitations({ ...base, metrics: [metric({ testBefore: 1, testAfter: 2 })] });
    expect(l.some((x) => x.text.startsWith("Missing control-store values"))).toBe(true);
  });
});

describe("guessMetricUnit", () => {
  it("guesses from the name", () => {
    expect(guessMetricUnit("Gross margin")).toBe("pct");
    expect(guessMetricUnit("Waste % of revenue")).toBe("pct");
    expect(guessMetricUnit("Transactions 11:00–14:00")).toBe("count");
    expect(guessMetricUnit("Bakery revenue")).toBe("EUR");
    expect(guessMetricUnit("Something else")).toBe("count");
  });
});

describe("timelineLayout", () => {
  const items = [
    { id: "a", startDate: "2025-09-01", endDate: "2025-10-12" },
    { id: "b", startDate: "2026-11-02", endDate: "2026-12-13" },
    { id: "c", startDate: null, endDate: null },
  ];
  it("spans whole months and places bars and today", () => {
    const l = timelineLayout(items, "2026-10-02")!;
    expect(l.from).toBe("2025-09-01");
    expect(l.to).toBe("2027-01-01");
    expect(l.months).toHaveLength(16);
    expect(l.bars.find((b) => b.id === "a")!.leftPct).toBe(0);
    expect(l.undated).toEqual(["c"]);
    expect(l.todayPct).toBeGreaterThan(l.bars.find((b) => b.id === "a")!.leftPct);
    expect(l.todayPct).toBeLessThan(l.bars.find((b) => b.id === "b")!.leftPct);
    const last = l.bars.find((b) => b.id === "b")!;
    expect(last.leftPct + last.widthPct).toBeLessThanOrEqual(100);
  });
  it("omits today when it is far outside the axis and returns null without dated items", () => {
    expect(timelineLayout([items[0]!], "2026-10-02")!.todayPct).toBeNull();
    expect(timelineLayout([items[2]!], "2026-10-02")).toBeNull();
  });
});
