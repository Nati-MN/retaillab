import { calculateGrowthRate, calculateShare } from "@/lib/calc";
import { computeKpis, costBreakdown, filterFacts, kpisByStore } from "@/lib/analytics/aggregate";
import { findAnomalies, type Anomaly, type KnownEventLike } from "@/lib/analytics/anomalies";
import { COST_LABELS, type Kpis, type MonthFact, type StoreDTO } from "@/lib/analytics/types";
import {
  DECISION_LABELS, fmtMetric, metricLift, primaryMetric, STATUS_LABELS, type ExperimentDTO,
} from "@/lib/experiments/model";
import {
  fmtDate, fmtMoney, fmtNumber, fmtPct, fmtSignedPct, fmtSignedPts, humanize, MISSING,
} from "@/lib/format";
import { addMonths, monthLabel, monthRange, periodLabel, resolvePeriod, type MonthKey } from "@/lib/period";
import { normalizeSections, sectionTitle, type ReportSectionKey } from "./sections";

/**
 * Deterministic report builder. Every sentence and every table cell in a
 * report is produced here from plain data — no free text, no model output.
 * The React layer only lays the returned blocks out.
 */

// ── Input ────────────────────────────────────────────────────────────────────

export interface ReportSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
  isDemo: boolean;
}

export interface ReportOpportunity {
  storeId: string;
  title: string;
  observation: string;
  hypothesis: string;
  impactScenario: string;
  estimatedCost: number | null;
  status: string;
  dataConfidence: string;
  suggestedExperiment: string;
}

export interface ReportStrategy {
  storeId: string | null;
  title: string;
  hypothesis: string;
  proposedTest: string;
  metricsToWatch: string[];
  dataConfidence: string;
}

export interface ReportInput {
  currency: string;
  /** ISO date the report is rendered on. */
  generatedAt: string;
  period: { from: MonthKey; to: MonthKey };
  sections: readonly string[];
  /** Stores covered by the report, sorted by name. */
  stores: StoreDTO[];
  /** Facts of those stores for all months up to period.to (history is needed for comparisons and the anomaly rule). */
  facts: MonthFact[];
  events: KnownEventLike[];
  competitors: { storeId: string; name: string; category: string; distanceM: number; sourceId: string }[];
  signals: { storeId: string; type: string; name: string; sourceId: string }[];
  sources: ReportSource[];
  experiments: ExperimentDTO[];
  opportunities: ReportOpportunity[];
  riskFindings: { storeId: string | null; text: string; sourceId: string | null }[];
  strategies: ReportStrategy[];
}

// ── Output ───────────────────────────────────────────────────────────────────

export type ReportLabel = "FACT" | "CALCULATED" | "HYPOTHESIS" | "SCENARIO" | "EXPERIMENT_RESULT" | "UNKNOWN" | "ASSUMPTION";

export interface ReportCellObj { text: string; sub?: string; cites?: number[]; strong?: boolean }
export type ReportCell = string | ReportCellObj;

export interface ReportColumn { label: string; align?: "right"; /** Method note letter, e.g. "a". */ note?: string }

export interface ReportItemLine { caption?: string; text: string; label?: ReportLabel; cites?: number[] }
export interface ReportItem { title: string; meta?: string; label?: ReportLabel; lines: ReportItemLine[] }

export type ReportBlock =
  | { type: "p"; text: string; cites?: number[]; muted?: boolean }
  | { type: "subhead"; text: string }
  | { type: "note"; text: string }
  | { type: "table"; columns: ReportColumn[]; rows: ReportCell[][]; footer?: ReportCell[]; label?: ReportLabel }
  | { type: "chart"; labels: string[]; series: { storeId: string; name: string; values: (number | null)[] }[]; summary: string }
  | { type: "items"; items: ReportItem[] };

export interface ReportSection {
  key: ReportSectionKey;
  number: number;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportModel {
  periodLabel: string;
  sections: ReportSection[];
  /** Sources in order of first citation; `n` is the number printed in the text. */
  sources: { n: number; source: ReportSource }[];
  methodNotes: { letter: string; text: string }[];
}

// ── Method notes ─────────────────────────────────────────────────────────────

export const METHOD_NOTES = {
  growth: "Change (%) = (current − comparison) / comparison × 100. Shown only when both periods contain the same number of months with data.",
  share: "Share (%) = store revenue / total revenue of the stores in this report × 100.",
  monthlyAvg: "Monthly average = period revenue / number of months with data.",
  perSqm: "Revenue per m² = average monthly revenue / store area.",
  perEmployee: "Revenue per employee = average monthly revenue / number of employees.",
  basket: "Average basket = revenue / transactions.",
  perDay: "Per-day figures = period total / open days in the period.",
  perCustomer: "Revenue per customer = revenue / customer count.",
  margin: "Gross margin = revenue-weighted average of the monthly gross margins.",
  opProfit: "Operating profit = revenue × gross margin − operating costs. Shown only when every month has a margin and cost rows.",
  costRatio: "Cost ratio (% of revenue) = cost / revenue × 100.",
  anomaly: "Anomaly rule: a month is flagged when its change (year-over-year if at least 16 months of history exist, otherwise month-over-month) deviates from the store's own median change by at least 2.5 robust standard deviations and at least 5 percentage points (3 for gross margin). It marks a value as unusual for that series; it says nothing about the cause.",
  lift: "Control-adjusted change (percentage points) = test store change (%) − control store change (%) over the same period. Descriptive arithmetic on one store pair; not a significance test.",
} as const;
export type MethodKey = keyof typeof METHOD_NOTES;

// ── Small pure helpers (exported for tests) ──────────────────────────────────

/** Growth between two KPI sets, only when both cover the same number of months. */
export function comparableGrowth(current: Kpis, comparison: Kpis): number | null {
  if (current.months === 0 || current.months !== comparison.months) return null;
  return calculateGrowthRate(current.revenue, comparison.revenue);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function changeSentence(opts: { what: string; label: string; current: Kpis; comparison: Kpis; currency: string }): string {
  const g = comparableGrowth(opts.current, opts.comparison);
  if (g === null) {
    return opts.comparison.months === 0
      ? `No revenue data is recorded for ${opts.what} (${opts.label}), so no comparison is made.`
      : `Data for ${opts.what} (${opts.label}) is incomplete (${plural(opts.comparison.months, "month")} of ${opts.current.months}), so no comparison is made.`;
  }
  const dir = Math.abs(g) < 0.05 ? "unchanged" : g > 0 ? `${fmtSignedPct(g)} higher` : `${fmtSignedPct(g)} lower`;
  return `Compared with ${opts.what} (${opts.label}, ${fmtMoney(opts.comparison.revenue, opts.currency)}), revenue was ${dir}.`;
}

export interface GrowthRank { storeId: string; name: string; growth: number }

/** Stores ranked by growth, highest first; stores without a comparable figure are left out. */
export function rankGrowth(stores: readonly StoreDTO[], current: Map<string, Kpis>, comparison: Map<string, Kpis>): GrowthRank[] {
  const out: GrowthRank[] = [];
  for (const s of stores) {
    const c = current.get(s.id);
    const p = comparison.get(s.id);
    const g = c && p ? comparableGrowth(c, p) : null;
    if (g !== null) out.push({ storeId: s.id, name: s.name, growth: g });
  }
  return out.sort((a, b) => b.growth - a.growth || a.name.localeCompare(b.name));
}

export function growthRankSentence(rank: readonly GrowthRank[], basis: string): string {
  if (rank.length < 2) return `A growth ranking is not possible: fewer than two stores have comparable revenue for ${basis}.`;
  const best = rank[0]!;
  const worst = rank[rank.length - 1]!;
  return `Revenue growth compared with ${basis} was highest in ${best.name} (${fmtSignedPct(best.growth)}) and lowest in ${worst.name} (${fmtSignedPct(worst.growth)}).`;
}

/** For cost metrics a rise is the unfavourable direction; for everything else a fall. */
export function isUnfavourable(a: Pick<Anomaly, "metric" | "direction">): boolean {
  return a.metric.startsWith("cost:") ? a.direction === "up" : a.direction === "down";
}

function anomalyValue(a: Anomaly, currency: string): string {
  if (a.metric === "customers") return fmtNumber(a.value);
  if (a.metric === "grossMarginPct") return fmtPct(a.value);
  return fmtMoney(a.value, currency, a.metric === "averageBasket" ? 2 : 0);
}

export function anomalySentence(a: Anomaly, currency: string): string {
  const basis = a.basis === "yoy" ? "the same month a year earlier" : "the previous month";
  return `${a.metricLabel} in ${monthLabel(a.month)} was ${anomalyValue(a, currency)}, ${fmtSignedPct(a.changePct)} against ${basis} — unusual compared with this store's own history.`;
}

export function anomalyCauseSentence(a: Pick<Anomaly, "knownEvents">): string {
  if (a.knownEvents.length === 0) return "Cause unknown — no event is on record for this store in that or the preceding month.";
  const list = a.knownEvents.map((e) => `“${e.title}” (${fmtDate(e.date)})`).join("; ");
  return `Event on record around that time: ${list}. It is listed as context; whether it caused the change has not been established.`;
}

export function experimentResultSentence(e: ExperimentDTO, currency: string): string {
  const pm = primaryMetric(e.metrics);
  if (!pm) return "No metric is defined for this experiment.";
  const lift = metricLift(pm, e.controlStore !== null);
  if (!lift) return `Results for the primary metric (${pm.name}) have not been entered.`;
  const base = `${pm.name}: ${fmtMetric(pm.testBefore, pm.unit, currency)} before, ${fmtMetric(pm.testAfter, pm.unit, currency)} after (${fmtSignedPct(lift.rawChangePct)}).`;
  if (lift.controlAdjustedPts !== null) {
    return `${base} The control store changed by ${fmtSignedPct(lift.controlChangePct)}; the control-adjusted change is ${fmtSignedPts(lift.controlAdjustedPts)}.`;
  }
  return `${base} ${e.controlStore ? "Control store values are missing" : "There was no control store"}, so the change is not control-adjusted.`;
}

export function experimentCountSentence(running: number, planned: number, generatedAt: string): string {
  if (running === 0 && planned === 0) return `As of ${fmtDate(generatedAt)}, no experiment is running or planned in the stores covered.`;
  const verb = running === 1 ? "is" : "are";
  return `As of ${fmtDate(generatedAt)}, ${plural(running, "experiment")} ${verb} running and ${planned} ${planned === 1 ? "is" : "are"} planned.`;
}

// ── Builder ──────────────────────────────────────────────────────────────────

const pct = (v: number | null, d = 1) => (v === null ? MISSING : fmtPct(v, d));
const spct = (v: number | null) => (v === null ? MISSING : fmtSignedPct(v));

export function buildReport(input: ReportInput): ReportModel {
  const { currency, period, stores } = input;
  const money = (v: number | null, d = 0) => fmtMoney(v, currency, d);
  const keys = normalizeSections(input.sections);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const label = periodLabel(period);
  const resolved = resolvePeriod(period.to, "custom", period);

  // Citation and method-note registries (numbered in order of first use).
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));
  const cited: ReportSource[] = [];
  const cite = (id: string | null | undefined): number[] => {
    const s = id ? sourceById.get(id) : undefined;
    if (!s) return [];
    let i = cited.indexOf(s);
    if (i === -1) { cited.push(s); i = cited.length - 1; }
    return [i + 1];
  };
  const usedNotes: MethodKey[] = [];
  const note = (k: MethodKey): string => {
    let i = usedNotes.indexOf(k);
    if (i === -1) { usedNotes.push(k); i = usedNotes.length - 1; }
    return String.fromCharCode(97 + i);
  };

  // Shared figures.
  const cur = filterFacts(input.facts, period);
  const prev = filterFacts(input.facts, resolved.previous);
  const prevYear = filterFacts(input.facts, resolved.previousYear);
  const total = computeKpis(cur, stores);
  const totalPrev = computeKpis(prev, stores);
  const totalPrevYear = computeKpis(prevYear, stores);
  const byStore = kpisByStore(cur, stores);
  const byStorePrev = kpisByStore(prev, stores);
  const byStorePrevYear = kpisByStore(prevYear, stores);
  const prevLabel = periodLabel(resolved.previous);
  const prevYearLabel = periodLabel(resolved.previousYear);
  const hasData = cur.length > 0;
  const noStores = stores.length === 0;
  const anomalies = findAnomalies(input.facts, stores, input.events).filter((a) => a.month >= period.from && a.month <= period.to);
  const running = input.experiments.filter((e) => e.status === "RUNNING");
  const planned = input.experiments.filter((e) => e.status === "PLANNED");
  const ended = input.experiments.filter((e) => e.status === "COMPLETED" || e.status === "STOPPED");
  const storesWithout = stores.filter((s) => (byStore.get(s.id)?.months ?? 0) === 0);
  const missingStoresSentence = storesWithout.length > 0
    ? `No data is recorded in the period for: ${storesWithout.map((s) => s.name).join(", ")}. These stores are shown with “${MISSING}” and are not part of the totals.`
    : null;
  const noData = (what: string): ReportBlock => ({
    type: "p", muted: true,
    text: noStores ? "No stores are covered by this report." : `No ${what} is recorded for the selected stores in ${label}.`,
  });

  const build: Record<ReportSectionKey, () => ReportBlock[]> = {
    summary: () => {
      if (!hasData) return [noData("revenue data")];
      const out: string[] = [
        `Revenue of the ${plural(stores.length - storesWithout.length, "store")} with data in ${label} was ${money(total.revenue)}.`,
        changeSentence({ what: "the previous period", label: prevLabel, current: total, comparison: totalPrev, currency }),
        changeSentence({ what: "the same period a year earlier", label: prevYearLabel, current: total, comparison: totalPrevYear, currency }),
      ];
      const yoy = rankGrowth(stores, byStore, byStorePrevYear);
      out.push(yoy.length >= 2
        ? growthRankSentence(yoy, "the same period a year earlier")
        : growthRankSentence(rankGrowth(stores, byStore, byStorePrev), "the previous period"));
      const flaggedStores = new Set(anomalies.map((a) => a.storeId)).size;
      out.push(anomalies.length === 0
        ? "The anomaly rule flagged no unusual monthly values in the period."
        : `The anomaly rule flagged ${plural(anomalies.length, "unusual monthly value")} in the period, in ${plural(flaggedStores, "store")}. An anomaly is an observation; its cause is not known unless an event is on record.`);
      out.push(experimentCountSentence(running.length, planned.length, input.generatedAt));
      const blocks: ReportBlock[] = out.map((text) => ({ type: "p", text }));
      if (missingStoresSentence) blocks.push({ type: "p", text: missingStoresSentence });
      blocks.push({ type: "note", text: "This summary states recorded and calculated figures. It does not explain why they changed." });
      void note("growth");
      return blocks;
    },

    revenue: () => {
      if (!hasData) return [noData("revenue data")];
      const g = note("growth");
      const blocks: ReportBlock[] = [{
        type: "table", label: "CALCULATED",
        columns: [
          { label: "Store" },
          { label: "Revenue", align: "right" },
          { label: "Share", align: "right", note: note("share") },
          { label: "Monthly avg.", align: "right", note: note("monthlyAvg") },
          { label: `vs ${prevLabel}`, align: "right", note: g },
          { label: `vs ${prevYearLabel}`, align: "right", note: g },
        ],
        rows: stores.map((s) => {
          const k = byStore.get(s.id)!;
          return [
            s.name, money(k.revenue), pct(calculateShare(k.revenue, total.revenue)), money(k.monthlyRevenue),
            spct(comparableGrowth(k, byStorePrev.get(s.id)!)), spct(comparableGrowth(k, byStorePrevYear.get(s.id)!)),
          ];
        }),
        footer: stores.length > 1
          ? ["Total", money(total.revenue), pct(total.revenue ? 100 : null), money(total.monthlyRevenue), spct(comparableGrowth(total, totalPrev)), spct(comparableGrowth(total, totalPrevYear))]
          : undefined,
      }];
      if (missingStoresSentence) blocks.push({ type: "p", text: missingStoresSentence });
      // Trend: the 12 months ending with the period (or the whole period when it is longer).
      const from = period.from < addMonths(period.to, -11) ? period.from : addMonths(period.to, -11);
      const months = monthRange(from, period.to);
      const series = stores.map((s) => {
        const own = new Map(input.facts.filter((f) => f.storeId === s.id).map((f) => [f.month, f.revenue]));
        return { storeId: s.id, name: s.name, values: months.map((m) => own.get(m) ?? null) };
      }).filter((s) => s.values.some((v) => v !== null));
      const withData = months.filter((_, i) => series.some((s) => s.values[i] !== null));
      if (withData.length >= 2) {
        blocks.push({
          type: "chart", labels: months.map(monthLabel), series,
          summary: `Monthly revenue per store, ${monthLabel(withData[0]!)} to ${monthLabel(withData[withData.length - 1]!)}. Months without recorded data are left empty.`,
        });
      } else {
        blocks.push({ type: "p", muted: true, text: "A trend chart needs at least two months of revenue data; fewer are recorded." });
      }
      return blocks;
    },

    comparison: () => {
      if (!hasData) return [noData("revenue data")];
      return [
        {
          type: "table", label: "CALCULATED",
          columns: [
            { label: "Store" },
            { label: "Revenue / m²", align: "right", note: note("perSqm") },
            { label: "Revenue / employee", align: "right", note: note("perEmployee") },
            { label: "Avg. basket", align: "right", note: note("basket") },
            { label: "Gross margin", align: "right", note: note("margin") },
            { label: "Cost ratio", align: "right", note: note("costRatio") },
            { label: "Operating profit", align: "right", note: note("opProfit") },
          ],
          rows: stores.map((s) => {
            const k = byStore.get(s.id)!;
            return [s.name, money(k.revenuePerSqm, 2), money(k.revenuePerEmployee), money(k.averageBasket, 2), pct(k.grossMarginPct), pct(k.costRatioPct), money(k.operatingProfit)];
          }),
        },
        { type: "p", text: `“${MISSING}” means the figure cannot be calculated from the data recorded (for example no store area, no transactions or no cost rows). It is never replaced by zero.` },
        { type: "note", text: "Differences between stores are observations. Stores differ in format, location and size; a gap between two stores does not by itself show what would happen if one were run like the other." },
      ];
    },

    customers: () => {
      if (!hasData) return [noData("customer data")];
      const any = stores.some((s) => { const k = byStore.get(s.id)!; return k.customers !== null || k.transactions !== null; });
      if (!any) return [{ type: "p", muted: true, text: `No customer or transaction counts are recorded for the selected stores in ${label}. Only revenue is available.` }];
      const g = note("growth");
      return [
        {
          type: "table", label: "CALCULATED",
          columns: [
            { label: "Store" },
            { label: "Customers", align: "right" },
            { label: `vs ${prevYearLabel}`, align: "right", note: g },
            { label: "Customers / day", align: "right", note: note("perDay") },
            { label: "Transactions", align: "right" },
            { label: "Avg. basket", align: "right", note: note("basket") },
            { label: "Revenue / customer", align: "right", note: note("perCustomer") },
          ],
          rows: stores.map((s) => {
            const k = byStore.get(s.id)!;
            const p = byStorePrevYear.get(s.id)!;
            const cg = k.months > 0 && k.months === p.months ? calculateGrowthRate(k.customers, p.customers) : null;
            return [s.name, fmtNumber(k.customers), spct(cg), fmtNumber(k.customersPerDay), fmtNumber(k.transactions), money(k.averageBasket, 2), money(k.revenuePerCustomer, 2)];
          }),
          footer: stores.length > 1
            ? ["All stores", fmtNumber(total.customers), spct(total.months === totalPrevYear.months ? calculateGrowthRate(total.customers, totalPrevYear.customers) : null), fmtNumber(total.customersPerDay), fmtNumber(total.transactions), money(total.averageBasket, 2), money(total.revenuePerCustomer, 2)]
            : undefined,
        },
        { type: "p", text: "Customer and transaction counts are the values recorded by the organization. For the “All stores” row, customers per day is the average per store and open day." },
      ];
    },

    costs: () => {
      const lines = costBreakdown(cur, stores);
      if (lines.length === 0) return [noData("cost data")];
      const ratio = note("costRatio");
      const costTotal = lines.reduce((a, l) => a + l.amount, 0);
      const partial = total.operatingCosts === null;
      const blocks: ReportBlock[] = [
        {
          type: "table", label: "CALCULATED",
          columns: [{ label: "Cost line" }, { label: "Amount", align: "right" }, { label: "% of revenue", align: "right", note: ratio }, { label: "Share of costs", align: "right" }],
          rows: lines.map((l) => [COST_LABELS[l.type], money(l.amount), pct(partial ? null : l.shareOfRevenuePct), pct(calculateShare(l.amount, costTotal))]),
          footer: ["Total recorded costs", money(costTotal), pct(partial ? null : calculateShare(costTotal, total.revenue)), pct(100)],
        },
      ];
      if (partial) {
        blocks.push({ type: "p", text: "Cost rows are missing for at least one store-month in the period. Percentages of revenue are therefore not shown for the total, because revenue would include months whose costs are not recorded." });
      }
      blocks.push({
        type: "table", label: "CALCULATED",
        columns: [{ label: "Store" }, { label: "Operating costs", align: "right" }, { label: "% of revenue", align: "right", note: ratio }, { label: "Largest cost line", align: "right" }],
        rows: stores.map((s) => {
          const k = byStore.get(s.id)!;
          const own = costBreakdown(cur.filter((f) => f.storeId === s.id), [s]).sort((a, b) => b.amount - a.amount)[0];
          return [s.name, money(k.operatingCosts), pct(k.costRatioPct), own ? `${COST_LABELS[own.type]} · ${money(own.amount)}` : MISSING];
        }),
      });
      return blocks;
    },

    location: () => {
      if (noStores) return [noData("location research")];
      const rows = stores.map((s) => {
        const comps = input.competitors.filter((c) => c.storeId === s.id).sort((a, b) => a.distanceM - b.distanceM);
        const sigs = input.signals.filter((x) => x.storeId === s.id);
        const byType = new Map<string, number>();
        for (const x of sigs) byType.set(x.type, (byType.get(x.type) ?? 0) + 1);
        const cites = [...new Set([...comps, ...sigs].flatMap((x) => cite(x.sourceId)))].sort((a, b) => a - b);
        const nearest = comps[0];
        return { s, comps, sigs, byType, cites, nearest };
      });
      if (rows.every((r) => r.comps.length === 0 && r.sigs.length === 0)) {
        return [{ type: "p", muted: true, text: "No location research is stored for the selected stores. Run research for a store to record competitors and surroundings with their sources." }];
      }
      return [
        {
          type: "table", label: "FACT",
          columns: [{ label: "Store" }, { label: "Competitors on record", align: "right" }, { label: "Nearest competitor" }, { label: "Signals on record" }, { label: "Sources" }],
          rows: rows.map((r): ReportCell[] => r.comps.length === 0 && r.sigs.length === 0
            ? [r.s.name, MISSING, "No research stored", "No research stored", MISSING]
            : [
                r.s.name,
                String(r.comps.length),
                r.nearest ? { text: r.nearest.name, sub: `${humanize(r.nearest.category)} · ${fmtNumber(r.nearest.distanceM)} m` } : "None on record",
                r.byType.size === 0 ? "None on record" : [...r.byType.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => `${humanize(t)} ${n}`).join(" · "),
                { text: "", cites: r.cites },
              ]),
        },
        { type: "p", text: "Counts are the entries stored in RetailLab from research runs, with the source they came from. A missing entry means nothing was found or researched — not that nothing exists. Population, footfall and competitor revenue are not available from any connected source." },
      ];
    },

    "experiments-active": () => {
      const list = [...running, ...planned];
      if (list.length === 0) return [{ type: "p", muted: true, text: `No experiment is running or planned in the stores covered, as of ${fmtDate(input.generatedAt)}.` }];
      return [
        { type: "p", text: experimentCountSentence(running.length, planned.length, input.generatedAt) },
        {
          type: "table",
          columns: [{ label: "Experiment" }, { label: "Test / control store" }, { label: "Period" }, { label: "Status" }, { label: "Primary metric" }],
          rows: list.map((e): ReportCell[] => [
            { text: e.title, strong: true },
            { text: e.testStore.name, sub: e.controlStore ? `control: ${e.controlStore.name}` : "no control store" },
            `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`,
            STATUS_LABELS[e.status],
            primaryMetric(e.metrics)?.name ?? MISSING,
          ]),
        },
        { type: "items", items: list.map((e) => ({ title: e.title, label: "HYPOTHESIS" as const, lines: [{ text: e.hypothesis }] })) },
        { type: "note", text: "Running and planned experiments have no result yet. Their hypotheses are untested." },
      ];
    },

    "experiments-completed": () => {
      if (ended.length === 0) return [{ type: "p", muted: true, text: "No experiment in the stores covered has been completed or stopped." }];
      const lift = note("lift");
      const inPeriod = ended.filter((e) => e.endDate && e.endDate.slice(0, 7) >= period.from && e.endDate.slice(0, 7) <= period.to).length;
      return [
        { type: "p", text: `${plural(ended.length, "experiment")} ${ended.length === 1 ? "has" : "have"} been completed or stopped to date; ${inPeriod === 0 ? "none" : inPeriod} ended within ${label}.` },
        {
          type: "table", label: "EXPERIMENT_RESULT",
          columns: [
            { label: "Experiment" }, { label: "Primary metric" },
            { label: "Test", align: "right" }, { label: "Control", align: "right" },
            { label: "Control-adjusted", align: "right", note: lift }, { label: "Decision" },
          ],
          rows: ended.map((e): ReportCell[] => {
            const pm = primaryMetric(e.metrics);
            const l = pm ? metricLift(pm, e.controlStore !== null) : null;
            return [
              { text: e.title, strong: true, sub: `${e.testStore.name}${e.controlStore ? ` vs ${e.controlStore.name}` : ", no control"} · ${fmtDate(e.startDate)} – ${fmtDate(e.endDate)} · ${STATUS_LABELS[e.status]}` },
              pm ? { text: pm.name, sub: l ? `${fmtMetric(pm.testBefore, pm.unit, currency)} → ${fmtMetric(pm.testAfter, pm.unit, currency)}` : "results not entered" } : MISSING,
              spct(l?.rawChangePct ?? null),
              e.controlStore ? spct(l?.controlChangePct ?? null) : "no control",
              l?.controlAdjustedPts != null ? { text: fmtSignedPts(l.controlAdjustedPts), strong: true } : MISSING,
              e.decision ? DECISION_LABELS[e.decision] : "No decision recorded",
            ];
          }),
        },
        {
          type: "items",
          items: ended.map((e) => ({
            title: e.title,
            lines: [
              { caption: "Result", label: "EXPERIMENT_RESULT" as const, text: experimentResultSentence(e, currency) },
              { caption: "Decision", text: e.decision ? `${DECISION_LABELS[e.decision]}${e.decisionNote ? ` — ${e.decisionNote}` : "."}` : "No decision recorded." },
            ],
          })),
        },
        { type: "note", text: "Limitation: each result compares one test store with at most one control store. It is descriptive arithmetic, not a significance test, and does not establish that the change caused the difference." },
      ];
    },

    opportunities: () => {
      const list = input.opportunities.filter((o) => o.status !== "REJECTED");
      if (list.length === 0) return [{ type: "p", muted: true, text: "No open entries are on the opportunity board for the stores covered." }];
      return [
        { type: "p", text: `${plural(list.length, "entry", "entries")} on the opportunity board for the stores covered. Each is a hypothesis; the scenario text shows what would follow if its assumptions held, not what will happen.` },
        {
          type: "items",
          items: list.map((o) => ({
            title: o.title,
            meta: `${storeName.get(o.storeId) ?? "Store"} · ${humanize(o.status)} · data confidence ${o.dataConfidence.toLowerCase()}${o.estimatedCost !== null ? ` · cost assumption ${money(o.estimatedCost)}` : ""}`,
            label: "HYPOTHESIS" as const,
            lines: [
              { caption: "Observation", text: o.observation },
              { caption: "Hypothesis", text: o.hypothesis },
              { caption: "Scenario", label: "SCENARIO" as const, text: o.impactScenario },
              { caption: "Suggested experiment", text: o.suggestedExperiment },
            ],
          })),
        },
      ];
    },

    risks: () => {
      const blocks: ReportBlock[] = [{ type: "subhead", text: "Anomalies observed in the period" }];
      const bad = anomalies.filter(isUnfavourable);
      if (noStores || input.facts.length === 0) {
        blocks.push({ type: "p", muted: true, text: "No data is recorded, so the anomaly rule could not be applied." });
      } else if (anomalies.length === 0) {
        blocks.push({ type: "p", text: `The anomaly rule flagged no unusual monthly values in ${label}. This means no value stood out against each store's own history; it is not a statement that no risk exists.` });
      } else {
        const n = note("anomaly");
        blocks.push({
          type: "p",
          text: `${plural(anomalies.length, "value")} flagged in ${label} (method ${n}); ${bad.length === 0 ? "none" : bad.length} in an unfavourable direction${bad.length < anomalies.length ? `, ${anomalies.length - bad.length} favourable (not listed)` : ""}.`,
        });
        if (bad.length > 0) {
          blocks.push({
            type: "items",
            items: bad.map((a) => ({
              title: `${a.storeName} — ${a.metricLabel}`,
              label: "CALCULATED" as const,
              lines: [
                { text: anomalySentence(a, currency) },
                { caption: "Cause", label: a.knownEvents.length === 0 ? ("UNKNOWN" as const) : undefined, text: anomalyCauseSentence(a) },
              ],
            })),
          });
        }
      }
      blocks.push({ type: "subhead", text: "Risk findings from location research" });
      if (input.riskFindings.length === 0) {
        blocks.push({ type: "p", muted: true, text: "No risk findings are stored from location research for the stores covered." });
      } else {
        blocks.push({
          type: "items",
          items: input.riskFindings.map((f) => {
            const c = cite(f.sourceId);
            return {
              title: f.storeId ? storeName.get(f.storeId) ?? "Store" : "Organization",
              lines: [{ text: f.text, cites: c, label: c.length === 0 ? ("UNKNOWN" as const) : undefined }, ...(c.length === 0 ? [{ text: "No source is recorded for this finding." }] : [])],
            };
          }),
        });
        blocks.push({ type: "note", text: "A sourced finding states what the source says exists near the store. Its effect on the store has not been measured." });
      }
      return blocks;
    },

    tests: () => {
      if (input.strategies.length === 0) return [{ type: "p", muted: true, text: "No untested hypotheses are on record for the stores covered, so there are no tests to consider." }];
      return [
        { type: "subhead", text: "Tests worth considering" },
        { type: "p", text: `${plural(input.strategies.length, "hypothesis", "hypotheses")} ${input.strategies.length === 1 ? "has" : "have"} not been tested yet. Each could be tested as described; none comes with an expected result.` },
        {
          type: "items",
          items: input.strategies.map((s) => ({
            title: s.title,
            meta: `${s.storeId ? storeName.get(s.storeId) ?? "Store" : "All stores"} · data confidence ${s.dataConfidence.toLowerCase()}`,
            label: "HYPOTHESIS" as const,
            lines: [
              { caption: "Hypothesis", text: s.hypothesis },
              { caption: "Possible test", text: s.proposedTest },
              ...(s.metricsToWatch.length > 0 ? [{ caption: "Metrics to watch", text: s.metricsToWatch.join(", ") }] : []),
            ],
          })),
        },
        { type: "note", text: "These are candidates for an experiment, not recommendations with a predicted effect. Whether a test is worth running depends on its cost and on what the organization would do with the result." },
      ];
    },

    sources: () => [],
  };

  const sections: ReportSection[] = keys.map((key, i) => ({ key, number: i + 1, title: sectionTitle(key), blocks: build[key]() }));
  const sources = cited.map((source, i) => ({ n: i + 1, source }));
  const srcSection = sections.find((s) => s.key === "sources");
  if (srcSection) {
    srcSection.blocks = sources.length === 0
      ? [{ type: "p", muted: true, text: "No external source is cited in this report. All figures come from the organization's own recorded data." }]
      : [
          { type: "p", text: `${plural(sources.length, "source")} cited in this report, in order of first citation.${sources.some((s) => s.source.isDemo) ? " Sources marked “fictional” were invented for the demo; their addresses do not exist." : ""}` },
        ];
  }
  return {
    periodLabel: label,
    sections,
    sources,
    methodNotes: usedNotes.map((k, i) => ({ letter: String.fromCharCode(97 + i), text: METHOD_NOTES[k] })),
  };
}
