import { isNum, type Num } from "@/lib/calc";

/** Growth classes used by the map markers. Thresholds are fixed and shown in the legend. */
export type GrowthClass = "growing" | "stable" | "declining" | "unknown";

export const GROWTH_THRESHOLD_PCT = 3;

/** growing ≥ +3 %, declining ≤ −3 %, otherwise stable; unknown when growth cannot be calculated. */
export function classifyGrowth(growthPct: Num): GrowthClass {
  if (!isNum(growthPct)) return "unknown";
  if (growthPct >= GROWTH_THRESHOLD_PCT) return "growing";
  if (growthPct <= -GROWTH_THRESHOLD_PCT) return "declining";
  return "stable";
}

export const GROWTH_CLASS_META: Record<GrowthClass, { label: string; glyph: string; description: string }> = {
  growing: { label: "Growing", glyph: "▲", description: "YoY revenue ≥ +3%" },
  stable: { label: "Stable", glyph: "■", description: "YoY revenue between −3% and +3%" },
  declining: { label: "Declining", glyph: "▼", description: "YoY revenue ≤ −3%" },
  unknown: { label: "Unknown", glyph: "?", description: "Fewer than 13 months of data" },
};

/**
 * Marker diameter in px. Area (not diameter) is proportional to revenue, so a
 * store with twice the revenue gets a marker with twice the area.
 * Stores without revenue get the minimum size.
 */
export function markerDiameter(revenue: Num, maxRevenue: Num, minPx = 18, maxPx = 44): number {
  if (!isNum(revenue) || !isNum(maxRevenue) || maxRevenue <= 0 || revenue <= 0) return minPx;
  const d = maxPx * Math.sqrt(Math.min(revenue, maxRevenue) / maxRevenue);
  return Math.max(minPx, d);
}
