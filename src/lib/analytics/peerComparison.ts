import { calculateRelativeDifference, median } from "@/lib/calc";
import type { KpiKey, Kpis } from "./types";

export interface PeerRow {
  key: KpiKey;
  /** This store's value. */
  value: number | null;
  /** Median of the other stores that have the value. */
  peerMedian: number | null;
  /** Number of other stores the median is based on. */
  peers: number;
  /**
   * Difference to the median. Relative (%) for amounts and ratios,
   * percentage points for KPIs that are already percentages.
   */
  difference: number | null;
  unit: "%" | "pts";
}

const POINT_KEYS: ReadonlySet<KpiKey> = new Set<KpiKey>(["grossMarginPct", "costRatioPct"]);

/**
 * Compares one store with the median of the OTHER stores, KPI by KPI.
 * Relative difference (%) = (store − median) / median × 100.
 * Stores without a value for a KPI are left out of that KPI's median.
 * This is a description of the data, not an explanation of it.
 */
export function compareWithPeers(
  storeId: string,
  byStore: ReadonlyMap<string, Kpis>,
  keys: readonly KpiKey[],
): PeerRow[] {
  const own = byStore.get(storeId);
  return keys.map((key) => {
    const value = own ? own[key] : null;
    const others: number[] = [];
    for (const [id, k] of byStore) {
      const v = k[key];
      if (id !== storeId && v !== null && Number.isFinite(v)) others.push(v);
    }
    const peerMedian = median(others);
    const unit = POINT_KEYS.has(key) ? "pts" : "%";
    const difference =
      value === null || peerMedian === null
        ? null
        : unit === "pts"
          ? value - peerMedian
          : calculateRelativeDifference(value, peerMedian);
    return { key, value, peerMedian, peers: others.length, difference, unit };
  });
}
