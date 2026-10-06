import { detectAnomalies, calculateAverageBasket, type AnomalyPoint } from "@/lib/calc";
import { monthRange, type MonthKey } from "@/lib/period";
import { COST_LABELS, type CostTypeKey, type MonthFact, type StoreDTO } from "./types";

export type AnomalyMetric = "revenue" | "customers" | "averageBasket" | "grossMarginPct" | `cost:${CostTypeKey}`;

export const ANOMALY_METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  customers: "Customer traffic",
  averageBasket: "Average basket",
  grossMarginPct: "Gross margin",
  ...Object.fromEntries(Object.entries(COST_LABELS).map(([k, v]) => [`cost:${k}`, `${v} cost`])),
};

export interface KnownEventLike {
  storeId: string | null;
  date: string; // ISO date
  title: string;
  description: string | null;
}

export interface Anomaly extends AnomalyPoint {
  storeId: string;
  storeName: string;
  metric: AnomalyMetric;
  metricLabel: string;
  month: MonthKey;
  /** Events the organization recorded for this store in the same or the previous month. Empty = none on record. */
  knownEvents: KnownEventLike[];
}

/**
 * Runs the transparent anomaly rule (see detectAnomalies) over the main
 * metrics of every store. Returns observations only — a recorded event in the
 * same period is listed as a "known event", never asserted as the cause.
 */
export function findAnomalies(
  facts: readonly MonthFact[],
  stores: readonly StoreDTO[],
  events: readonly KnownEventLike[] = [],
  costTypes: readonly CostTypeKey[] = ["ENERGY", "WASTE", "PERSONNEL"],
): Anomaly[] {
  const out: Anomaly[] = [];
  for (const store of stores) {
    const own = facts.filter((f) => f.storeId === store.id).sort((a, b) => (a.month < b.month ? -1 : 1));
    if (own.length === 0) continue;
    const months = monthRange(own[0]!.month, own[own.length - 1]!.month);
    const byMonth = new Map(own.map((f) => [f.month, f]));
    const series: Record<string, (number | null)[]> = {
      revenue: months.map((m) => byMonth.get(m)?.revenue ?? null),
      customers: months.map((m) => byMonth.get(m)?.customers ?? null),
      averageBasket: months.map((m) => {
        const f = byMonth.get(m);
        return f ? calculateAverageBasket(f.revenue, f.transactions) : null;
      }),
      grossMarginPct: months.map((m) => byMonth.get(m)?.grossMarginPct ?? null),
    };
    for (const t of costTypes) series[`cost:${t}`] = months.map((m) => byMonth.get(m)?.costs[t] ?? null);

    for (const [metric, values] of Object.entries(series)) {
      // Margin is a percentage: flag smaller relative moves.
      const opts = metric === "grossMarginPct" ? { minChangePct: 3 } : {};
      for (const a of detectAnomalies(values, opts)) {
        const month = months[a.index]!;
        const prev = months[a.index - 1];
        out.push({
          ...a,
          storeId: store.id,
          storeName: store.name,
          metric: metric as AnomalyMetric,
          metricLabel: ANOMALY_METRIC_LABELS[metric] ?? metric,
          month,
          knownEvents: events.filter(
            (e) => (e.storeId === store.id || e.storeId === null) && (e.date.slice(0, 7) === month || e.date.slice(0, 7) === prev),
          ),
        });
      }
    }
  }
  return out.sort((a, b) => (a.month === b.month ? Math.abs(b.zScore) - Math.abs(a.zScore) : a.month < b.month ? 1 : -1));
}
