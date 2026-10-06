import { calculateGrowthRate, calculateShare, calculateWeightedMargin, mean, sumOrNull, sumStrict } from "@/lib/calc";
import type { CategoryFact } from "./types";

export interface StoreCategoryRow {
  categoryId: string;
  categoryName: string;
  months: number;
  revenue: number;
  /** % of the store's category revenue in the period. */
  sharePct: number | null;
  /** Revenue-weighted over the months that have a margin. */
  marginPct: number | null;
  /** vs the comparison rows (same months one year earlier); null when those are incomplete. */
  growthPct: number | null;
  /** Sum of recorded waste value; null when any month lacks it. */
  wasteValue: number | null;
  /** Waste / revenue × 100. */
  wasteSharePct: number | null;
  /** Mean of the monthly stockout rates that were recorded. */
  stockoutRatePct: number | null;
  /** Average monthly revenue / category floor area (latest recorded area). */
  revenuePerSqm: number | null;
}

/**
 * Per-category figures for ONE store over a period.
 * `previousYear` holds the same store's rows for the same months a year earlier.
 */
export function storeCategoryBreakdown(
  current: readonly CategoryFact[],
  previousYear: readonly CategoryFact[] = [],
): StoreCategoryRow[] {
  const total = sumOrNull(current.map((f) => f.revenue));
  const ids = [...new Set(current.map((f) => f.categoryId))];
  return ids
    .map((id) => {
      const rows = current.filter((f) => f.categoryId === id);
      const prev = previousYear.filter((f) => f.categoryId === id);
      const months = new Set(rows.map((r) => r.month)).size;
      const revenue = rows.reduce((a, r) => a + r.revenue, 0);
      const prevRevenue = prev.length > 0 && new Set(prev.map((r) => r.month)).size === months ? prev.reduce((a, r) => a + r.revenue, 0) : null;
      const wasteValue = sumStrict(rows.map((r) => r.wasteValue));
      const stock = rows.map((r) => r.stockoutRatePct).filter((v): v is number => v !== null);
      const area = [...rows].reverse().find((r) => r.areaSqm !== null)?.areaSqm ?? null;
      return {
        categoryId: id,
        categoryName: rows[0]!.categoryName,
        months,
        revenue,
        sharePct: calculateShare(revenue, total),
        marginPct: calculateWeightedMargin(rows.map((r) => ({ revenue: r.revenue, grossMarginPct: r.marginPct }))),
        growthPct: calculateGrowthRate(revenue, prevRevenue),
        wasteValue,
        wasteSharePct: calculateShare(wasteValue, revenue),
        stockoutRatePct: mean(stock),
        revenuePerSqm: area && months > 0 ? revenue / months / area : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
