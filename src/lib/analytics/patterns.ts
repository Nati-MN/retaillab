import { isNum, pearson } from "@/lib/calc";
import type { Kpis, StoreDTO } from "./types";

export const ATTRIBUTES = ["parking", "hours", "staffDensity", "area", "competitors"] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];
export const OUTCOMES = ["revenuePerSqm", "averageBasket", "customersPerDay", "grossMarginPct"] as const;
export type OutcomeKey = (typeof OUTCOMES)[number];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  parking: "Parking spaces",
  hours: "Opening hours / week",
  staffDensity: "Employees / 100 m²",
  area: "Store size (m²)",
  competitors: "Competitors ≤ 1 km",
};

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  revenuePerSqm: "Revenue / m² / month",
  averageBasket: "Average basket",
  customersPerDay: "Customers / day",
  grossMarginPct: "Gross margin",
};

/** "07:30" → 7.5. Null when the string is not HH:MM. */
export function parseClock(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h + min / 60;
}

/** Opening hours per week = (closes − opens) × open days per week. Null when any part is missing or closes ≤ opens. */
export function openingHoursPerWeek(s: Pick<StoreDTO, "opensAt" | "closesAt" | "openDaysPerWeek">): number | null {
  const o = parseClock(s.opensAt);
  const c = parseClock(s.closesAt);
  if (o === null || c === null || !isNum(s.openDaysPerWeek) || c <= o) return null;
  return (c - o) * s.openDaysPerWeek;
}

/**
 * Attribute values for one store. `competitorsWithin1km` must be null when no
 * competitor research exists for the store (unknown ≠ zero).
 */
export function storeAttributes(s: StoreDTO, competitorsWithin1km: number | null): Record<AttributeKey, number | null> {
  return {
    parking: s.parkingSpaces,
    hours: openingHoursPerWeek(s),
    staffDensity: isNum(s.employees) && isNum(s.areaSqm) && s.areaSqm > 0 ? (s.employees / s.areaSqm) * 100 : null,
    area: s.areaSqm,
    competitors: competitorsWithin1km,
  };
}

export function storeOutcomes(k: Kpis): Record<OutcomeKey, number | null> {
  return {
    revenuePerSqm: k.revenuePerSqm,
    averageBasket: k.averageBasket,
    customersPerDay: k.customersPerDay,
    grossMarginPct: k.grossMarginPct,
  };
}

export interface PatternStore {
  storeId: string;
  storeName: string;
  attributes: Record<AttributeKey, number | null>;
  outcomes: Record<OutcomeKey, number | null>;
}

export interface PatternCell {
  attribute: AttributeKey;
  outcome: OutcomeKey;
  /** Pearson r across the stores that have both values; null for n < 3 or no variance. */
  r: number | null;
  n: number;
  /** Stores left out because one of the two values is missing. */
  excluded: string[];
  points: { storeId: string; storeName: string; x: number; y: number }[];
}

/** Pearson r between one store attribute and one outcome, over stores that have both. */
export function patternCell(stores: readonly PatternStore[], attribute: AttributeKey, outcome: OutcomeKey): PatternCell {
  const points: PatternCell["points"] = [];
  const excluded: string[] = [];
  for (const s of stores) {
    const x = s.attributes[attribute];
    const y = s.outcomes[outcome];
    if (isNum(x) && isNum(y)) points.push({ storeId: s.storeId, storeName: s.storeName, x, y });
    else excluded.push(s.storeName);
  }
  return { attribute, outcome, r: pearson(points.map((p) => p.x), points.map((p) => p.y)), n: points.length, excluded, points };
}

/** attribute × outcome matrix of correlations. A description of co-movement across stores — never evidence of cause. */
export function patternMatrix(stores: readonly PatternStore[]): PatternCell[][] {
  return ATTRIBUTES.map((a) => OUTCOMES.map((o) => patternCell(stores, a, o)));
}

/**
 * Smallest |r| that a two-sided 5% test would call "significant" for n pairs,
 * under the textbook assumptions (independent, bivariate-normal pairs, ONE
 * pre-chosen pair). Shown only to illustrate how large |r| has to be at small
 * n — with a matrix of many pairs, some will exceed it by chance alone.
 * Returns null for n outside 3–12 (table lookup, no approximation).
 */
export function criticalR(n: number): number | null {
  const table: Record<number, number> = { 3: 0.997, 4: 0.95, 5: 0.878, 6: 0.811, 7: 0.754, 8: 0.707, 9: 0.666, 10: 0.632, 11: 0.602, 12: 0.576 };
  return table[n] ?? null;
}

/**
 * Leave-one-out sensitivity: r recomputed with each store removed in turn.
 * Shows how much a single store drives the coefficient. Null when fewer than
 * 4 points (removing one would leave < 3) or when no reduced set yields an r.
 */
export function leaveOneOutRange(points: ReadonlyArray<{ storeName: string; x: number; y: number }>): { min: number; max: number; minWithout: string; maxWithout: string } | null {
  if (points.length < 4) return null;
  let out: { min: number; max: number; minWithout: string; maxWithout: string } | null = null;
  points.forEach((p, i) => {
    const rest = points.filter((_, k) => k !== i);
    const r = pearson(rest.map((q) => q.x), rest.map((q) => q.y));
    if (r === null) return;
    if (!out) out = { min: r, max: r, minWithout: p.storeName, maxWithout: p.storeName };
    else {
      if (r < out.min) { out.min = r; out.minWithout = p.storeName; }
      if (r > out.max) { out.max = r; out.maxWithout = p.storeName; }
    }
  });
  return out;
}
