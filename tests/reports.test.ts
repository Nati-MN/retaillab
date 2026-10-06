import { describe, expect, it } from "vitest";
import type { MonthFact, StoreDTO } from "@/lib/analytics/types";
import type { ExperimentDTO } from "@/lib/experiments/model";
import { addMonths, monthRange } from "@/lib/period";
import { lineGeometry, niceCeil } from "@/lib/reports/chart";
import {
  anomalyCauseSentence, buildReport, changeSentence, experimentCountSentence, experimentResultSentence,
  growthRankSentence, isUnfavourable, type ReportBlock, type ReportInput,
} from "@/lib/reports/model";
import { DEFAULT_SECTIONS, defaultReportTitle, normalizeSections } from "@/lib/reports/sections";
import { computeKpis } from "@/lib/analytics/aggregate";

const NB = " ";
const store = (id: string, name: string): StoreDTO => ({
  id, name, code: id, address: "", city: "", latitude: null, longitude: null, openingDate: null, areaSqm: 1000, employees: 20,
  parkingSpaces: null, type: "SUPERMARKET", opensAt: null, closesAt: null, openDaysPerWeek: 6, isDemo: false,
});
const A = store("a", "Alpha");
const B = store("b", "Beta");
const fact = (storeId: string, month: string, revenue: number): MonthFact => ({
  storeId, month, revenue, transactions: revenue / 20, customers: revenue / 25, grossMarginPct: 30, openDays: 26,
  costs: { PERSONNEL: revenue * 0.12, RENT: revenue * 0.05 }, operatingCosts: revenue * 0.17,
});
// 24 months to 2026-09; Alpha grows 10% year over year, Beta shrinks 5%.
const months = monthRange("2024-10", "2026-09");
const facts: MonthFact[] = months.flatMap((m, i) => [
  fact("a", m, i < 12 ? 100_000 : 110_000),
  fact("b", m, i < 12 ? 200_000 : 190_000),
]);

const experiment = (o: Partial<ExperimentDTO>): ExperimentDTO => ({
  id: "e1", title: "Bakery entrance placement", hypothesis: "May increase bakery sales.", status: "COMPLETED",
  startDate: "2025-09-01", endDate: "2025-10-12", cost: 1800, notes: null, decision: "REPEAT", decisionNote: "Repeat in a second store.",
  isDemo: false, testStore: { id: "a", name: "Alpha" }, controlStore: { id: "b", name: "Beta" }, strategy: null,
  metrics: [{ id: "m", name: "Bakery revenue / month", unit: "EUR", isPrimary: true, testBefore: 12_400, testAfter: 13_950, controlBefore: 10_000, controlAfter: 10_210 }],
  ...o,
});

const base: ReportInput = {
  currency: "EUR", generatedAt: "2026-10-02", period: { from: "2026-09", to: "2026-09" }, sections: DEFAULT_SECTIONS,
  stores: [A, B], facts, events: [], competitors: [], signals: [], sources: [], experiments: [], opportunities: [], riskFindings: [], strategies: [],
};
const texts = (blocks: ReportBlock[]) => blocks.flatMap((b) => (b.type === "p" || b.type === "note" || b.type === "subhead" ? [b.text] : []));
const section = (input: ReportInput, key: string) => buildReport(input).sections.find((s) => s.key === key)!;

describe("sections", () => {
  it("normalizes to canonical order without unknown keys or duplicates", () => {
    expect(normalizeSections(["sources", "bogus", "summary", "summary", 3])).toEqual(["summary", "sources"]);
    expect(DEFAULT_SECTIONS).toHaveLength(12);
    expect(DEFAULT_SECTIONS[0]).toBe("summary");
    expect(DEFAULT_SECTIONS[11]).toBe("sources");
  });
  it("builds the default title", () => {
    expect(defaultReportTitle("2026-09")).toBe("Monthly Store Performance Report — September 2026");
  });
});

describe("sentences", () => {
  const k = (rev: number, n = 1) => computeKpis(Array.from({ length: n }, (_, i) => fact("a", addMonths("2026-01", i), rev)), [A]);
  it("states a change with both figures", () => {
    expect(changeSentence({ what: "the previous period", label: "August 2026", current: k(110), comparison: k(100), currency: "EUR" }))
      .toBe(`Compared with the previous period (August 2026, €${NB}100), revenue was +10.0% higher.`);
    expect(changeSentence({ what: "the previous period", label: "x", current: k(90), comparison: k(100), currency: "EUR" })).toContain("−10.0% lower");
  });
  it("refuses to compare missing or incomplete periods", () => {
    expect(changeSentence({ what: "the previous period", label: "x", current: k(110), comparison: computeKpis([], [A]), currency: "EUR" })).toContain("No revenue data");
    expect(changeSentence({ what: "the previous period", label: "x", current: k(110, 3), comparison: k(100, 2), currency: "EUR" })).toContain("incomplete (2 months of 3)");
  });
  it("ranks growth and handles too few stores", () => {
    expect(growthRankSentence([{ storeId: "a", name: "Alpha", growth: 10 }, { storeId: "b", name: "Beta", growth: -5 }], "last year"))
      .toBe("Revenue growth compared with last year was highest in Alpha (+10.0%) and lowest in Beta (−5.0%).");
    expect(growthRankSentence([], "last year")).toContain("not possible");
  });
  it("counts experiments", () => {
    expect(experimentCountSentence(1, 2, "2026-10-02")).toBe("As of 02 Oct 2026, 1 experiment is running and 2 are planned.");
    expect(experimentCountSentence(0, 0, "2026-10-02")).toContain("no experiment is running or planned");
  });
  it("describes an experiment result without claiming causation", () => {
    const s = experimentResultSentence(experiment({}), "EUR");
    expect(s).toContain(`€${NB}12,400 before, €${NB}13,950 after (+12.5%)`);
    expect(s).toContain(`+2.1%; the control-adjusted change is +10.4${NB}pts`);
    expect(s).not.toMatch(/caused|because|will /i);
    expect(experimentResultSentence(experiment({ controlStore: null }), "EUR")).toContain("no control store");
    expect(experimentResultSentence(experiment({ metrics: [] }), "EUR")).toContain("No metric");
  });
  it("says cause unknown unless an event is on record, and never asserts it as the cause", () => {
    expect(anomalyCauseSentence({ knownEvents: [] })).toMatch(/^Cause unknown/);
    const s = anomalyCauseSentence({ knownEvents: [{ storeId: "a", date: "2026-03-02", title: "Competitor opened", description: null }] });
    expect(s).toContain("“Competitor opened” (02 Mar 2026)");
    expect(s).toContain("has not been established");
  });
  it("knows which direction is unfavourable", () => {
    expect(isUnfavourable({ metric: "revenue", direction: "down" })).toBe(true);
    expect(isUnfavourable({ metric: "revenue", direction: "up" })).toBe(false);
    expect(isUnfavourable({ metric: "cost:ENERGY", direction: "up" })).toBe(true);
  });
});

describe("buildReport", () => {
  it("numbers the selected sections in canonical order", () => {
    const m = buildReport({ ...base, sections: ["risks", "summary"] });
    expect(m.sections.map((s) => [s.number, s.key])).toEqual([[1, "summary"], [2, "risks"]]);
    expect(m.periodLabel).toBe("September 2026");
  });

  it("writes a factual executive summary", () => {
    const t = texts(section(base, "summary").blocks);
    expect(t[0]).toBe(`Revenue of the 2 stores with data in September 2026 was €${NB}300,000.`);
    expect(t[1]).toContain("unchanged");
    expect(t[2]).toBe(`Compared with the same period a year earlier (September 2025, €${NB}300,000), revenue was unchanged.`);
    expect(t[3]).toBe("Revenue growth compared with the same period a year earlier was highest in Alpha (+10.0%) and lowest in Beta (−5.0%).");
    expect(t.some((x) => x.includes("anomaly rule flagged"))).toBe(true);
    expect(t.join(" ")).not.toMatch(/will increase|will improve|guarantee/i);
  });

  it("builds the revenue table with shares, totals and a chart", () => {
    const blocks = section(base, "revenue").blocks;
    const table = blocks.find((b) => b.type === "table")!;
    if (table.type !== "table") throw new Error();
    expect(table.rows[0]).toEqual(["Alpha", `€${NB}110,000`, "36.7%", `€${NB}110,000`, "±0.0%", "+10.0%"]);
    expect(table.footer![1]).toBe(`€${NB}300,000`);
    expect(table.columns[2]!.note).toBeDefined();
    const chart = blocks.find((b) => b.type === "chart")!;
    if (chart.type !== "chart") throw new Error();
    expect(chart.labels).toHaveLength(12);
    expect(chart.series).toHaveLength(2);
  });

  it("lists the method notes that were referenced", () => {
    const m = buildReport(base);
    expect(m.methodNotes[0]!.letter).toBe("a");
    expect(m.methodNotes.some((n) => n.text.startsWith("Average basket"))).toBe(true);
    expect(new Set(m.methodNotes.map((n) => n.letter)).size).toBe(m.methodNotes.length);
  });

  it("says so explicitly when a section has no data", () => {
    const empty = buildReport({ ...base, facts: [] });
    for (const s of empty.sections) {
      expect(s.blocks.length, s.key).toBeGreaterThan(0);
    }
    expect(texts(section({ ...base, facts: [] }, "summary").blocks)[0]).toBe("No revenue data is recorded for the selected stores in September 2026.");
    expect(texts(section(base, "location").blocks)[0]).toContain("No location research is stored");
    expect(texts(section(base, "experiments-active").blocks)[0]).toContain("No experiment is running or planned");
    expect(texts(section(base, "experiments-completed").blocks)[0]).toContain("No experiment");
    expect(texts(section(base, "opportunities").blocks)[0]).toContain("No open entries");
    expect(texts(section(base, "tests").blocks)[0]).toContain("No untested hypotheses");
    expect(texts(section(base, "sources").blocks)[0]).toContain("No external source is cited");
    expect(texts(section(base, "risks").blocks).some((x) => x.includes("No risk findings"))).toBe(true);
    expect(texts(section({ ...base, stores: [], facts: [] }, "costs").blocks)[0]).toBe("No stores are covered by this report.");
  });

  it("shows — instead of zero for a store without data and excludes it from the count", () => {
    const input = { ...base, facts: facts.filter((f) => f.storeId === "a") };
    const t = texts(section(input, "summary").blocks);
    expect(t[0]).toContain("Revenue of the 1 store with data");
    expect(t.some((x) => x.includes("No data is recorded in the period for: Beta"))).toBe(true);
    const table = section(input, "revenue").blocks[0]!;
    if (table.type !== "table") throw new Error();
    expect(table.rows[1]!.slice(1, 3)).toEqual(["—", "—"]);
  });

  it("numbers sources in order of first citation and reuses numbers", () => {
    const src = (id: string) => ({ id, title: `Source ${id}`, url: `https://example.invalid/${id}`, publisher: "P", accessedAt: "2026-09-30T00:00:00.000Z", isDemo: true });
    const m = buildReport({
      ...base,
      sources: [src("s1"), src("s2"), src("unused")],
      competitors: [{ storeId: "b", name: "Rival", category: "DISCOUNT", distanceM: 400, sourceId: "s2" }],
      signals: [{ storeId: "a", type: "PUBLIC_TRANSPORT", name: "Stop", sourceId: "s1" }, { storeId: "a", type: "OFFICE", name: "Office", sourceId: "s1" }],
      riskFindings: [{ storeId: "b", text: "A discount competitor opened 400 m away.", sourceId: "s2" }, { storeId: null, text: "Unsourced", sourceId: null }],
    });
    expect(m.sources.map((s) => [s.n, s.source.id])).toEqual([[1, "s1"], [2, "s2"]]);
    const loc = m.sections.find((s) => s.key === "location")!.blocks[0]!;
    if (loc.type !== "table") throw new Error();
    expect(loc.rows[0]![4]).toEqual({ text: "", cites: [1] });
    expect(loc.rows[1]![2]).toEqual({ text: "Rival", sub: "Discount · 400 m" });
    const risk = m.sections.find((s) => s.key === "risks")!.blocks.find((b) => b.type === "items")!;
    if (risk.type !== "items") throw new Error();
    expect(risk.items[0]!.lines[0]!.cites).toEqual([2]);
    expect(risk.items[1]!.lines[1]!.text).toBe("No source is recorded for this finding.");
    expect(texts(m.sections.find((s) => s.key === "sources")!.blocks)[0]).toContain("2 sources cited");
  });

  it("reports anomalies with cause unknown", () => {
    const shocked = facts.map((f) => (f.storeId === "b" && f.month === "2026-09" ? { ...f, revenue: 120_000 } : f));
    // Give the series some ordinary variation so the rule has a spread to compare against.
    const noisy = shocked.map((f, i) => (f.month === "2026-09" ? f : { ...f, revenue: f.revenue * (1 + ((i % 5) - 2) / 100) }));
    const s = section({ ...base, facts: noisy }, "risks");
    const items = s.blocks.find((b) => b.type === "items");
    if (!items || items.type !== "items") throw new Error("expected anomaly items");
    const beta = items.items.find((i) => i.title === "Beta — Revenue")!;
    expect(beta.lines[0]!.text).toContain("Revenue in Sep 26 was");
    expect(beta.lines[1]!.text).toMatch(/^Cause unknown/);
    expect(beta.lines[1]!.label).toBe("UNKNOWN");
  });

  it("presents experiments, opportunities and tests as hypotheses and results with limitations", () => {
    const m = buildReport({
      ...base,
      experiments: [experiment({}), experiment({ id: "e2", title: "Lunch", status: "RUNNING", decision: null, decisionNote: null, startDate: "2026-09-07", endDate: "2026-10-18" })],
      opportunities: [{ storeId: "a", title: "Basket", observation: "Basket below peers.", hypothesis: "Pairing may help.", impactScenario: "Assumes +1% / +2% / +4%.", estimatedCost: 300, status: "NEW", dataConfidence: "MEDIUM", suggestedExperiment: "Test pairing." }],
      strategies: [{ storeId: "b", title: "Later closing", hypothesis: "Demand may continue.", proposedTest: "Open one hour longer for six weeks.", metricsToWatch: ["Transactions"], dataConfidence: "LOW" }],
    });
    const done = m.sections.find((s) => s.key === "experiments-completed")!;
    const table = done.blocks.find((b) => b.type === "table")!;
    if (table.type !== "table") throw new Error();
    expect(table.label).toBe("EXPERIMENT_RESULT");
    expect(table.rows[0]![4]).toEqual({ text: `+10.4${NB}pts`, strong: true });
    expect(table.rows[0]![5]).toBe("Repeat");
    expect(texts(done.blocks).some((t) => t.startsWith("Limitation:") && t.includes("not a significance test"))).toBe(true);
    const active = m.sections.find((s) => s.key === "experiments-active")!;
    expect(texts(active.blocks)[0]).toBe("As of 02 Oct 2026, 1 experiment is running and 0 are planned.");
    const opp = m.sections.find((s) => s.key === "opportunities")!.blocks.find((b) => b.type === "items")!;
    if (opp.type !== "items") throw new Error();
    expect(opp.items[0]!.label).toBe("HYPOTHESIS");
    expect(opp.items[0]!.lines.find((l) => l.caption === "Scenario")!.label).toBe("SCENARIO");
    const tests = m.sections.find((s) => s.key === "tests")!;
    expect(texts(tests.blocks)[0]).toBe("Tests worth considering");
    expect(texts(tests.blocks).join(" ")).toContain("none comes with an expected result");
    expect(JSON.stringify(m)).not.toMatch(/will increase|will improve|guaranteed|proven/i);
  });
});

describe("chart geometry", () => {
  it("picks a nice axis maximum", () => {
    expect(niceCeil(683_000)).toBe(1_000_000);
    expect(niceCeil(420_000)).toBe(500_000);
    expect(niceCeil(200)).toBe(200);
    expect(niceCeil(0)).toBe(1);
  });
  it("breaks lines at gaps and never plots null as zero", () => {
    const g = lineGeometry([[10, null, 20, 30]], 4, { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 });
    expect(g.paths[0]!.match(/M/g)).toHaveLength(2);
    expect(g.max).toBe(50);
    expect(g.y(0)).toBe(100);
    expect(g.x(3)).toBe(100);
  });
});
