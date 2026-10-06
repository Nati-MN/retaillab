import { calculateGrowthRate, calculateRelativeDifference, calculateShare, isNum, type Num } from "@/lib/calc";
import { fmtMoney, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/format";
import type { MonthKey } from "@/lib/period";
import type { Kpis } from "./types";

/**
 * Pure helpers for the store comparison page: metric definitions, best-value
 * marking, indexed trends and the deterministic FACT sentences. Nothing here
 * explains WHY stores differ — that is deliberately left to the reader.
 */

export type CompareUnit = "money" | "money2" | "pct" | "signedPct" | "number" | "number1";
export type CompareDirection = "higher" | "lower" | "none";

export type CompareMetricKey =
  | "revenue" | "monthlyRevenue" | "yoyGrowthPct" | "customersPerDay" | "averageBasket"
  | "revenuePerSqm" | "revenuePerEmployee" | "grossMarginPct" | "operatingCosts" | "costRatioPct" | "operatingProfit";

export interface CompareMetricDef {
  key: CompareMetricKey;
  label: string;
  unit: CompareUnit;
  /** Which direction is marked as "best". "none" = size-dependent, no marker. */
  direction: CompareDirection;
  formula: string;
}

export const COMPARE_METRICS: readonly CompareMetricDef[] = [
  { key: "revenue", label: "Revenue", unit: "money", direction: "higher", formula: "Σ monthly revenue in the period" },
  { key: "monthlyRevenue", label: "Revenue / month", unit: "money", direction: "higher", formula: "Revenue / months" },
  { key: "yoyGrowthPct", label: "Growth (YoY)", unit: "signedPct", direction: "higher", formula: "(Revenue − revenue same months last year) / revenue same months last year × 100" },
  { key: "customersPerDay", label: "Customers / day", unit: "number", direction: "higher", formula: "Customers / open days" },
  { key: "averageBasket", label: "Average basket", unit: "money2", direction: "higher", formula: "Revenue / transactions" },
  { key: "revenuePerSqm", label: "Revenue / m² · month", unit: "money", direction: "higher", formula: "Revenue per month / store area" },
  { key: "revenuePerEmployee", label: "Revenue / employee · month", unit: "money", direction: "higher", formula: "Revenue per month / employees" },
  { key: "grossMarginPct", label: "Gross margin", unit: "pct", direction: "higher", formula: "Σ(revenue × margin) / Σ revenue" },
  { key: "operatingCosts", label: "Operating costs", unit: "money", direction: "none", formula: "Σ all cost types in the period" },
  { key: "costRatioPct", label: "Cost ratio", unit: "pct", direction: "lower", formula: "Operating costs / revenue × 100" },
  { key: "operatingProfit", label: "Operating profit", unit: "money", direction: "higher", formula: "Revenue × gross margin − operating costs" },
];

export interface CompareStore {
  id: string;
  name: string;
  values: Record<CompareMetricKey, number | null>;
}

/** Builds the comparable value set of one store from its KPIs and the KPIs of the same months one year earlier. */
export function compareValues(current: Kpis, previousYear: Kpis | null, expectedMonths: number): Record<CompareMetricKey, number | null> {
  // YoY is only meaningful when both windows are complete; a partial prior year would overstate growth.
  const complete = current.months === expectedMonths && previousYear !== null && previousYear.months === expectedMonths;
  return {
    revenue: current.revenue,
    monthlyRevenue: current.monthlyRevenue,
    yoyGrowthPct: complete ? calculateGrowthRate(current.revenue, previousYear.revenue) : null,
    customersPerDay: current.customersPerDay,
    averageBasket: current.averageBasket,
    revenuePerSqm: current.revenuePerSqm,
    revenuePerEmployee: current.revenuePerEmployee,
    grossMarginPct: current.grossMarginPct,
    operatingCosts: current.operatingCosts,
    costRatioPct: current.costRatioPct,
    operatingProfit: current.operatingProfit,
  };
}

export function formatCompareValue(v: Num, unit: CompareUnit, currency = "EUR"): string {
  switch (unit) {
    case "money": return fmtMoney(v, currency);
    case "money2": return fmtMoney(v, currency, 2);
    case "pct": return fmtPct(v);
    case "signedPct": return fmtSignedPct(v);
    case "number": return fmtNumber(v);
    case "number1": return fmtNumber(v, 1);
  }
}

/**
 * Indices of the best value(s). Empty when the direction is "none", when
 * fewer than two values exist, or when all existing values are equal (there
 * is no "best" among equals).
 */
export function bestIndices(values: readonly Num[], direction: CompareDirection): number[] {
  if (direction === "none") return [];
  const present = values.filter(isNum);
  if (present.length < 2) return [];
  const best = direction === "higher" ? Math.max(...present) : Math.min(...present);
  if (present.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

export interface IndexedTrend {
  /** First month in which every store has revenue > 0; null when no such month exists. */
  baseMonth: MonthKey | null;
  rows: Array<{ month: MonthKey; values: Record<string, number | null> }>;
}

/**
 * Indexed revenue: every store = 100 in the base month, so stores of different
 * size can be compared by their trajectory. Index = revenue / revenue in base month × 100.
 * Months before the base month are dropped; a store's missing month stays null.
 */
export function indexedRevenueTrend(
  months: readonly MonthKey[],
  storeIds: readonly string[],
  revenue: (storeId: string, month: MonthKey) => Num,
): IndexedTrend {
  const baseMonth = months.find((m) => storeIds.length > 0 && storeIds.every((id) => { const v = revenue(id, m); return isNum(v) && v > 0; })) ?? null;
  if (baseMonth === null) return { baseMonth, rows: [] };
  return {
    baseMonth,
    rows: months.filter((m) => m >= baseMonth).map((month) => ({
      month,
      values: Object.fromEntries(storeIds.map((id) => [id, calculateShare(revenue(id, month), revenue(id, baseMonth))])),
    })),
  };
}

// ── FACT sentences ───────────────────────────────────────────────────────────

export interface ComparisonFact {
  key: string;
  text: string;
  /** The arithmetic behind the sentence, with the actual numbers. */
  formula: string;
}

type RelTemplate = { kind: "relative"; sentence: (hi: string, pct: string, lo: string) => string };
type PtsTemplate = { kind: "points"; sentence: (hi: string, pts: string, lo: string, hiV: string, loV: string) => string };

const TEMPLATES: Partial<Record<CompareMetricKey, RelTemplate | PtsTemplate>> = {
  revenue: { kind: "relative", sentence: (a, p, b) => `${a} recorded ${p} more revenue than ${b} in the period.` },
  customersPerDay: { kind: "relative", sentence: (a, p, b) => `${a} serves ${p} more customers per open day than ${b}.` },
  averageBasket: { kind: "relative", sentence: (a, p, b) => `${a} has a ${p} higher average basket than ${b}.` },
  revenuePerSqm: { kind: "relative", sentence: (a, p, b) => `${a} generates ${p} more revenue per m² than ${b}.` },
  revenuePerEmployee: { kind: "relative", sentence: (a, p, b) => `${a} generates ${p} more revenue per employee than ${b}.` },
  yoyGrowthPct: { kind: "points", sentence: (a, pts, b, av, bv) => `Year-over-year revenue change is ${av} at ${a} and ${bv} at ${b} — a gap of ${pts} points.` },
  grossMarginPct: { kind: "points", sentence: (a, pts, b, av, bv) => `Gross margin is ${pts} points higher at ${a} (${av}) than at ${b} (${bv}).` },
  costRatioPct: { kind: "points", sentence: (a, pts, b, av, bv) => `Operating costs take ${pts} points more of revenue at ${a} (${av}) than at ${b} (${bv}).` },
};

/**
 * One FACT per metric: the store with the highest value against the store with
 * the lowest. Purely descriptive — computed with calculateRelativeDifference
 * (or a difference in percentage points for metrics that are already percentages).
 * Metrics with fewer than two values, or with no difference, produce nothing.
 */
export function generateComparisonFacts(stores: readonly CompareStore[], currency = "EUR"): ComparisonFact[] {
  const out: ComparisonFact[] = [];
  for (const def of COMPARE_METRICS) {
    const tpl = TEMPLATES[def.key];
    if (!tpl) continue;
    const present = stores.flatMap((s) => { const v = s.values[def.key]; return isNum(v) ? [{ name: s.name, v }] : []; });
    if (present.length < 2) continue;
    const hi = present.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = present.reduce((a, b) => (b.v < a.v ? b : a));
    if (hi.v === lo.v) continue;
    const scope = present.length > 2 ? ` Highest vs lowest of ${present.length} stores.` : "";
    const hiV = formatCompareValue(hi.v, def.unit, currency);
    const loV = formatCompareValue(lo.v, def.unit, currency);
    if (tpl.kind === "relative") {
      const diff = calculateRelativeDifference(hi.v, lo.v);
      // A relative difference against a zero or negative base is not meaningful.
      if (diff === null || lo.v <= 0) continue;
      out.push({
        key: def.key,
        text: tpl.sentence(hi.name, fmtPct(diff), lo.name) + scope,
        formula: `(${hiV} − ${loV}) / ${loV} × 100 = ${fmtPct(diff)}`,
      });
    } else {
      const pts = hi.v - lo.v;
      out.push({
        key: def.key,
        text: tpl.sentence(hi.name, fmtNumber(pts, 1), lo.name, hiV, loV) + scope,
        formula: `${hiV} − ${loV} = ${fmtNumber(pts, 1)} pts`,
      });
    }
  }
  return out;
}

export interface CategoryShareRow {
  categoryName: string;
  /** Share of the store's category revenue (%), keyed by store id. Null = no category data for that store. */
  shares: Record<string, number | null>;
}

/** Share of revenue per category and store. Share = category revenue / Σ category revenue of the store × 100. */
export function categoryShares(
  facts: ReadonlyArray<{ storeId: string; categoryName: string; revenue: number }>,
  storeIds: readonly string[],
): CategoryShareRow[] {
  const totals = new Map<string, number>();
  const cells = new Map<string, Map<string, number>>();
  const order: string[] = [];
  for (const f of facts) {
    if (!storeIds.includes(f.storeId)) continue;
    totals.set(f.storeId, (totals.get(f.storeId) ?? 0) + f.revenue);
    let row = cells.get(f.categoryName);
    if (!row) { row = new Map(); cells.set(f.categoryName, row); order.push(f.categoryName); }
    row.set(f.storeId, (row.get(f.storeId) ?? 0) + f.revenue);
  }
  return order.map((categoryName) => ({
    categoryName,
    shares: Object.fromEntries(storeIds.map((id) => {
      const v = cells.get(categoryName)?.get(id);
      return [id, totals.has(id) ? calculateShare(v ?? 0, totals.get(id)) : null];
    })),
  }));
}

/** FACT for the category whose revenue share differs most between two stores. */
export function generateCategoryFact(rows: readonly CategoryShareRow[], stores: ReadonlyArray<{ id: string; name: string }>): ComparisonFact | null {
  let best: { row: CategoryShareRow; hi: { name: string; v: number }; lo: { name: string; v: number }; gap: number } | null = null;
  for (const row of rows) {
    const present = stores.flatMap((s) => { const v = row.shares[s.id]; return isNum(v) ? [{ name: s.name, v }] : []; });
    if (present.length < 2) continue;
    const hi = present.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = present.reduce((a, b) => (b.v < a.v ? b : a));
    const gap = hi.v - lo.v;
    if (gap > 0 && (!best || gap > best.gap)) best = { row, hi, lo, gap };
  }
  if (!best) return null;
  return {
    key: "categoryShare",
    text: `${best.row.categoryName} accounts for ${fmtPct(best.hi.v)} of revenue at ${best.hi.name} and ${fmtPct(best.lo.v)} at ${best.lo.name} — the widest category gap among the selected stores.`,
    formula: `${fmtPct(best.hi.v)} − ${fmtPct(best.lo.v)} = ${fmtNumber(best.gap, 1)} pts`,
  };
}

export const COMPARISON_HYPOTHESIS =
  "Possible explanations could include customer traffic, assortment, location, opening hours, or local competition. The data shown here cannot tell which.";

/** Parses `?stores=a,b,c` against the organization's stores: known ids only, no duplicates, at most `max`. */
export function parseStoreSelection(param: string | undefined, knownIds: readonly string[], max = 4, defaultCount = 3): string[] {
  if (param === undefined) return knownIds.slice(0, defaultCount);
  const out: string[] = [];
  for (const id of param.split(",")) {
    if (knownIds.includes(id) && !out.includes(id)) out.push(id);
    if (out.length === max) break;
  }
  return out;
}
