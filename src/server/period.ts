import "server-only";
import { parsePreset, resolvePeriod, type MonthKey, type Period } from "@/lib/period";
import { getEarliestMonth, getLatestMonth } from "./queries";

export type SearchParams = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export interface PeriodContext {
  latest: MonthKey;
  earliest: MonthKey;
  period: Period;
}

/**
 * Resolves ?range=&from=&to= against the organization's data window.
 * Returns null when the organization has no revenue data yet — pages must
 * render an empty state in that case.
 */
export async function getPeriodContext(orgId: string, sp: SearchParams): Promise<PeriodContext | null> {
  const [latest, earliest] = await Promise.all([getLatestMonth(orgId), getEarliestMonth(orgId)]);
  if (!latest || !earliest) return null;
  const period = resolvePeriod(latest, parsePreset(sp.range), { from: first(sp.from), to: first(sp.to) });
  return { latest, earliest, period };
}
