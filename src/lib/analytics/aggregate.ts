import {
  calculateAverageBasket,
  calculateGrossProfit,
  calculateGrowthRate,
  calculateOperatingProfit,
  calculatePerDay,
  calculateRevenuePerCustomer,
  calculateRevenuePerEmployee,
  calculateRevenuePerSqm,
  calculateShare,
  calculateWeightedMargin,
  sumOrNull,
  sumStrict,
} from "@/lib/calc";
import type { MonthKey } from "@/lib/period";
import { COST_TYPES, type CostTypeKey, type KpiKey, type Kpis, type MonthFact, type StoreDTO } from "./types";

export function inRange(month: MonthKey, r: { from: MonthKey; to: MonthKey }): boolean {
  return month >= r.from && month <= r.to;
}

export function filterFacts<T extends { month: MonthKey; storeId: string }>(
  facts: readonly T[],
  r: { from: MonthKey; to: MonthKey },
  storeIds?: readonly string[],
): T[] {
  return facts.filter((f) => inRange(f.month, r) && (!storeIds || storeIds.includes(f.storeId)));
}

/**
 * KPIs for a set of facts belonging to the given stores.
 *
 * Rules that keep partial data honest:
 * - Sums of volumes (transactions, customers, open days) are STRICT: if any
 *   fact in the set lacks the value, the total — and every KPI derived from
 *   it — is null. A basket computed from all revenue but only some
 *   transactions would be wrong.
 * - Area and employees are strict across stores for the same reason.
 * - Gross margin is revenue-weighted over facts that have a margin; gross
 *   profit is only reported when EVERY fact has a margin.
 */
export function computeKpis(facts: readonly MonthFact[], stores: readonly StoreDTO[]): Kpis {
  const months = new Set(facts.map((f) => f.month)).size;
  const revenue = sumOrNull(facts.map((f) => f.revenue));
  const transactions = sumStrict(facts.map((f) => f.transactions));
  const customers = sumStrict(facts.map((f) => f.customers));
  const openDays = sumStrict(facts.map((f) => f.openDays));
  const involved = new Set(facts.map((f) => f.storeId));
  const involvedStores = stores.filter((s) => involved.has(s.id));
  const areaSqm = sumStrict(involvedStores.map((s) => s.areaSqm));
  const employees = sumStrict(involvedStores.map((s) => s.employees));
  const monthlyRevenue = revenue !== null && months > 0 ? revenue / months : null;

  const allHaveMargin = facts.length > 0 && facts.every((f) => f.grossMarginPct !== null);
  const grossMarginPct = calculateWeightedMargin(facts);
  const grossProfit = allHaveMargin ? calculateGrossProfit(revenue, grossMarginPct) : null;
  const operatingCosts = sumStrict(facts.map((f) => f.operatingCosts));

  // Per-day figures: open days are summed across stores, so for a multi-store
  // set this is the average per store-day.
  return {
    months,
    revenue,
    monthlyRevenue,
    transactions,
    customers,
    openDays,
    customersPerDay: calculatePerDay(customers, openDays),
    transactionsPerDay: calculatePerDay(transactions, openDays),
    averageBasket: calculateAverageBasket(revenue, transactions),
    revenuePerCustomer: calculateRevenuePerCustomer(revenue, customers),
    revenuePerSqm: calculateRevenuePerSqm(monthlyRevenue, areaSqm),
    revenuePerEmployee: calculateRevenuePerEmployee(monthlyRevenue, employees),
    grossMarginPct,
    grossProfit,
    operatingCosts,
    operatingProfit: calculateOperatingProfit(grossProfit, operatingCosts),
    costRatioPct: calculateShare(operatingCosts, revenue),
    areaSqm,
    employees,
  };
}

/** Percentage change per KPI between two KPI sets. Margin and cost ratio are compared in points. */
export function compareKpis(current: Kpis, previous: Kpis): Record<KpiKey, number | null> {
  const out = {} as Record<KpiKey, number | null>;
  const keys = Object.keys(current).filter((k) => k !== "months") as KpiKey[];
  for (const k of keys) {
    const c = current[k];
    const p = previous[k];
    if (k === "grossMarginPct" || k === "costRatioPct") {
      out[k] = c !== null && p !== null ? c - p : null;
    } else {
      out[k] = calculateGrowthRate(c, p);
    }
  }
  return out;
}

export interface MonthlyPoint extends Kpis {
  month: MonthKey;
}

/** One KPI set per month (across the given facts), sorted ascending. */
export function seriesByMonth(facts: readonly MonthFact[], stores: readonly StoreDTO[]): MonthlyPoint[] {
  const byMonth = new Map<MonthKey, MonthFact[]>();
  for (const f of facts) {
    const arr = byMonth.get(f.month) ?? [];
    arr.push(f);
    byMonth.set(f.month, arr);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, fs]) => ({ month, ...computeKpis(fs, stores) }));
}

export function kpisByStore(facts: readonly MonthFact[], stores: readonly StoreDTO[]): Map<string, Kpis> {
  const out = new Map<string, Kpis>();
  for (const s of stores) {
    out.set(s.id, computeKpis(facts.filter((f) => f.storeId === s.id), [s]));
  }
  return out;
}

export interface CostLine {
  type: CostTypeKey;
  amount: number;
  /** % of revenue */
  shareOfRevenuePct: number | null;
  perCustomer: number | null;
  /** per m² per month */
  perSqmMonthly: number | null;
}

export function costBreakdown(facts: readonly MonthFact[], stores: readonly StoreDTO[]): CostLine[] {
  const k = computeKpis(facts, stores);
  return COST_TYPES.flatMap((type) => {
    const amount = sumOrNull(facts.map((f) => f.costs[type]));
    if (amount === null) return [];
    return [
      {
        type,
        amount,
        shareOfRevenuePct: calculateShare(amount, k.revenue),
        perCustomer: k.customers ? amount / k.customers : null,
        perSqmMonthly: k.areaSqm && k.months ? amount / k.months / k.areaSqm : null,
      },
    ];
  });
}
