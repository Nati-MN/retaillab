import { calculateShare, isNum, sumStrict } from "@/lib/calc";
import { monthRange, type MonthKey } from "@/lib/period";
import { COST_TYPES, type CostTypeKey, type MonthFact, type StoreDTO } from "./types";

export type CostMetric = "abs" | "share" | "perCustomer" | "perSqm";

export const COST_METRIC_LABELS: Record<CostMetric, string> = {
  share: "% of revenue",
  perCustomer: "Per customer",
  perSqm: "Per m² / month",
  abs: "Absolute",
};

export interface CostCell {
  /** Σ of the recorded amounts; null when no store-month in the selection recorded this type. */
  amount: number | null;
  /** amount ÷ revenue of the store-months that recorded this type × 100 */
  sharePct: number | null;
  /** amount ÷ customers of those store-months (null if any of them lacks a customer count) */
  perCustomer: number | null;
  /** amount ÷ Σ(store area × months) of those store-months (null if any store lacks an area) */
  perSqmMonthly: number | null;
  /** Stores in the selection with revenue but no record of this cost type at all. */
  missingStoreIds: string[];
  /** Stores that recorded it in some months only. */
  partialStoreIds: string[];
}

export interface CostTable {
  byType: Record<CostTypeKey, CostCell>;
  /** Sum of every recorded line. `excludedTypes` lists the lines that are missing for at least one store. */
  total: CostCell;
  excludedTypes: CostTypeKey[];
  revenue: number | null;
}

function cell(facts: readonly MonthFact[], areaOf: Map<string, number | null>, amountOf: (f: MonthFact) => number | null): CostCell {
  const covered: MonthFact[] = [];
  const perStore = new Map<string, { n: number; have: number }>();
  let amount = 0;
  for (const f of facts) {
    const e = perStore.get(f.storeId) ?? { n: 0, have: 0 };
    e.n += 1;
    const a = amountOf(f);
    if (isNum(a)) {
      e.have += 1;
      amount += a;
      covered.push(f);
    }
    perStore.set(f.storeId, e);
  }
  const missingStoreIds = [...perStore].filter(([, e]) => e.have === 0).map(([id]) => id);
  const partialStoreIds = [...perStore].filter(([, e]) => e.have > 0 && e.have < e.n).map(([id]) => id);
  if (covered.length === 0) return { amount: null, sharePct: null, perCustomer: null, perSqmMonthly: null, missingStoreIds, partialStoreIds };
  const revenue = covered.reduce((a, f) => a + f.revenue, 0);
  const customers = sumStrict(covered.map((f) => f.customers));
  const areaMonths = sumStrict(covered.map((f) => areaOf.get(f.storeId) ?? null));
  return {
    amount,
    sharePct: calculateShare(amount, revenue),
    perCustomer: customers ? amount / customers : null,
    perSqmMonthly: areaMonths ? amount / areaMonths : null,
    missingStoreIds,
    partialStoreIds,
  };
}

/**
 * Cost breakdown for a set of store-months.
 *
 * A cost type that a store never recorded is NOT treated as zero: the line is
 * computed over the store-months that recorded it (ratios use the revenue,
 * customers and area of those same store-months) and the stores left out are
 * returned in `missingStoreIds`. The total is the sum of the recorded lines and
 * `excludedTypes` names the lines it is incomplete for.
 */
export function costTable(facts: readonly MonthFact[], stores: readonly StoreDTO[]): CostTable {
  const areaOf = new Map(stores.map((s) => [s.id, s.areaSqm]));
  const byType = {} as Record<CostTypeKey, CostCell>;
  for (const t of COST_TYPES) byType[t] = cell(facts, areaOf, (f) => f.costs[t] ?? null);
  const total = cell(facts, areaOf, (f) => f.operatingCosts);
  const excludedTypes = COST_TYPES.filter((t) => byType[t].amount !== null && (byType[t].missingStoreIds.length > 0 || byType[t].partialStoreIds.length > 0));
  return { byType, total, excludedTypes, revenue: facts.length > 0 ? facts.reduce((a, f) => a + f.revenue, 0) : null };
}

export function cellValue(c: CostCell, metric: CostMetric): number | null {
  switch (metric) {
    case "abs": return c.amount;
    case "share": return c.sharePct;
    case "perCustomer": return c.perCustomer;
    case "perSqm": return c.perSqmMonthly;
  }
}

export interface StoreCostColumn {
  storeId: string;
  storeName: string;
  table: CostTable;
}

/** One cost table per store, in the order given (rows = cost types, columns = stores). */
export function costComparison(facts: readonly MonthFact[], stores: readonly StoreDTO[]): StoreCostColumn[] {
  return stores.map((s) => ({ storeId: s.id, storeName: s.name, table: costTable(facts.filter((f) => f.storeId === s.id), [s]) }));
}

export interface CostTrendPoint {
  month: MonthKey;
  /** Σ recorded amount per type in that month; null when nobody recorded it. */
  amounts: Record<CostTypeKey, number | null>;
  /** amount ÷ revenue of the stores that recorded the type that month × 100 */
  sharePct: Record<CostTypeKey, number | null>;
}

/** Monthly cost per type across the given facts, with gaps (null) for months without records. */
export function costTrend(facts: readonly MonthFact[], from: MonthKey, to: MonthKey): CostTrendPoint[] {
  return monthRange(from, to).map((month) => {
    const fs = facts.filter((f) => f.month === month);
    const amounts = {} as Record<CostTypeKey, number | null>;
    const sharePct = {} as Record<CostTypeKey, number | null>;
    for (const t of COST_TYPES) {
      const have = fs.filter((f) => isNum(f.costs[t]));
      const amount = have.length > 0 ? have.reduce((a, f) => a + (f.costs[t] ?? 0), 0) : null;
      amounts[t] = amount;
      sharePct[t] = calculateShare(amount, have.reduce((a, f) => a + f.revenue, 0));
    }
    return { month, amounts, sharePct };
  });
}
