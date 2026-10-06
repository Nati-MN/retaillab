import { calculateGrowthRate, calculateShare, calculateWeightedMargin, isNum, mean } from "@/lib/calc";
import { addMonths } from "@/lib/period";
import type { CategoryFact } from "./types";

/** How many of the selected stores recorded an optional category field. */
export interface FieldCoverage {
  /** Stores with a value in every one of their category rows. */
  full: string[];
  /** Stores with a value in some rows only. */
  partial: string[];
  /** Stores with no value at all — excluded from the figure. */
  none: string[];
}

export interface CategoryRow {
  categoryId: string;
  categoryName: string;
  revenue: number;
  /** % of the selection's total category revenue. */
  sharePct: number | null;
  /** Revenue-weighted margin over rows that recorded a margin. */
  marginPct: number | null;
  /** YoY % on matched store-months (rows that exist in both years). Null when nothing matches. */
  growthPct: number | null;
  /** Store-months that entered the growth comparison / store-months in the period. */
  growthMatched: number;
  growthTotal: number;
  /** Σ revenue ÷ Σ (m² × months), over rows that recorded an area. */
  revenuePerSqm: number | null;
  wasteValue: number | null;
  /** Σ waste ÷ Σ revenue of the rows that recorded waste × 100. */
  wastePct: number | null;
  /** Unweighted mean of the recorded monthly stockout rates. */
  stockoutRatePct: number | null;
}

export interface CategoryAnalysis {
  rows: CategoryRow[];
  totalRevenue: number | null;
  /** Revenue-weighted margin across every row with a margin (matrix divider). */
  totalMarginPct: number | null;
  /** YoY growth of total category revenue on matched store-months (matrix divider). */
  totalGrowthPct: number | null;
  coverage: { margin: FieldCoverage; waste: FieldCoverage; stockout: FieldCoverage; area: FieldCoverage };
}

function coverageOf(facts: readonly CategoryFact[], pick: (f: CategoryFact) => number | null): FieldCoverage {
  const seen = new Map<string, { n: number; have: number }>();
  for (const f of facts) {
    const e = seen.get(f.storeId) ?? { n: 0, have: 0 };
    e.n += 1;
    if (isNum(pick(f))) e.have += 1;
    seen.set(f.storeId, e);
  }
  const out: FieldCoverage = { full: [], partial: [], none: [] };
  for (const [id, e] of seen) (e.have === 0 ? out.none : e.have === e.n ? out.full : out.partial).push(id);
  return out;
}

function sumRevenue(fs: readonly CategoryFact[]): number {
  return fs.reduce((a, f) => a + f.revenue, 0);
}

/**
 * Aggregates category rows of one period (any set of stores) into one line per category.
 *
 * Honesty rules:
 * - Optional fields (margin, waste, stockouts, area) are aggregated ONLY over rows that
 *   recorded them; ratios use the revenue of those same rows as denominator. `coverage`
 *   says which stores are therefore missing from a figure.
 * - Growth compares each store-month with the same store and calendar month one year
 *   earlier (`previousYear`); store-months without a counterpart are left out of BOTH sums.
 */
export function aggregateCategories(current: readonly CategoryFact[], previousYear: readonly CategoryFact[]): CategoryAnalysis {
  const prevKey = (f: CategoryFact, shift: number) => `${f.storeId}|${f.categoryId}|${addMonths(f.month, shift)}`;
  const prev = new Map(previousYear.map((f) => [prevKey(f, 0), f.revenue]));
  const total = current.length > 0 ? sumRevenue(current) : null;

  const groups = new Map<string, CategoryFact[]>();
  for (const f of current) {
    const arr = groups.get(f.categoryId) ?? [];
    arr.push(f);
    groups.set(f.categoryId, arr);
  }

  let matchedCur = 0;
  let matchedPrev = 0;
  const rows: CategoryRow[] = [];
  for (const [categoryId, fs] of groups) {
    const revenue = sumRevenue(fs);
    let cur = 0;
    let old = 0;
    let matched = 0;
    for (const f of fs) {
      const p = prev.get(prevKey(f, -12));
      if (p === undefined) continue;
      cur += f.revenue;
      old += p;
      matched += 1;
    }
    matchedCur += cur;
    matchedPrev += old;
    const withArea = fs.filter((f) => isNum(f.areaSqm) && f.areaSqm > 0);
    const areaMonths = withArea.reduce((a, f) => a + (f.areaSqm ?? 0), 0);
    const withWaste = fs.filter((f) => isNum(f.wasteValue));
    const wasteValue = withWaste.length > 0 ? withWaste.reduce((a, f) => a + (f.wasteValue ?? 0), 0) : null;
    rows.push({
      categoryId,
      categoryName: fs[0]!.categoryName,
      revenue,
      sharePct: calculateShare(revenue, total),
      marginPct: calculateWeightedMargin(fs.map((f) => ({ revenue: f.revenue, grossMarginPct: f.marginPct }))),
      growthPct: matched > 0 ? calculateGrowthRate(cur, old) : null,
      growthMatched: matched,
      growthTotal: fs.length,
      revenuePerSqm: areaMonths > 0 ? sumRevenue(withArea) / areaMonths : null,
      wasteValue,
      wastePct: calculateShare(wasteValue, withWaste.length > 0 ? sumRevenue(withWaste) : null),
      stockoutRatePct: mean(fs.map((f) => f.stockoutRatePct).filter(isNum)),
    });
  }
  rows.sort((a, b) => b.revenue - a.revenue);

  return {
    rows,
    totalRevenue: total,
    totalMarginPct: calculateWeightedMargin(current.map((f) => ({ revenue: f.revenue, grossMarginPct: f.marginPct }))),
    totalGrowthPct: matchedPrev > 0 ? calculateGrowthRate(matchedCur, matchedPrev) : null,
    coverage: {
      margin: coverageOf(current, (f) => f.marginPct),
      waste: coverageOf(current, (f) => f.wasteValue),
      stockout: coverageOf(current, (f) => f.stockoutRatePct),
      area: coverageOf(current, (f) => f.areaSqm),
    },
  };
}

export type Quadrant = "HIGH_GROWTH_HIGH_MARGIN" | "HIGH_GROWTH_LOW_MARGIN" | "LOW_GROWTH_HIGH_MARGIN" | "LOW_GROWTH_LOW_MARGIN";

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  HIGH_GROWTH_HIGH_MARGIN: "High growth / High margin",
  HIGH_GROWTH_LOW_MARGIN: "High growth / Low margin",
  LOW_GROWTH_HIGH_MARGIN: "Low growth / High margin",
  LOW_GROWTH_LOW_MARGIN: "Low growth / Low margin",
};

export interface MatrixPoint {
  categoryId: string;
  categoryName: string;
  growthPct: number;
  marginPct: number;
  revenue: number;
  quadrant: Quadrant;
}

export interface CategoryMatrix {
  /** Dividers; null when they cannot be calculated (then there is no matrix). */
  growthDivider: number | null;
  marginDivider: number | null;
  points: MatrixPoint[];
  /** Categories left out because growth or margin is missing. */
  omitted: string[];
}

/**
 * Growth × margin matrix. Dividers: total YoY growth of the selection and its
 * revenue-weighted average margin. "High" means at or above the divider. The
 * matrix is a description of where categories sit relative to the selection's
 * own average — it carries no recommendation.
 */
export function categoryMatrix(a: CategoryAnalysis): CategoryMatrix {
  const g = a.totalGrowthPct;
  const m = a.totalMarginPct;
  if (g === null || m === null) return { growthDivider: g, marginDivider: m, points: [], omitted: a.rows.map((r) => r.categoryName) };
  const points: MatrixPoint[] = [];
  const omitted: string[] = [];
  for (const r of a.rows) {
    if (r.growthPct === null || r.marginPct === null) {
      omitted.push(r.categoryName);
      continue;
    }
    const hg = r.growthPct >= g;
    const hm = r.marginPct >= m;
    points.push({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      growthPct: r.growthPct,
      marginPct: r.marginPct,
      revenue: r.revenue,
      quadrant: hg ? (hm ? "HIGH_GROWTH_HIGH_MARGIN" : "HIGH_GROWTH_LOW_MARGIN") : hm ? "LOW_GROWTH_HIGH_MARGIN" : "LOW_GROWTH_LOW_MARGIN",
    });
  }
  return { growthDivider: g, marginDivider: m, points, omitted };
}
