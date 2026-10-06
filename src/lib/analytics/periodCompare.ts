import type { Period } from "@/lib/period";
import { compareKpis, computeKpis, filterFacts } from "./aggregate";
import type { KpiKey, Kpis, MonthFact, StoreDTO } from "./types";

export type KpiDeltas = Record<KpiKey, number | null>;

export interface PeriodComparison {
  current: Kpis;
  previous: Kpis;
  previousYear: Kpis;
  /** Change vs the equally long period before. All null when that period is not fully covered. */
  vsPrevious: KpiDeltas;
  /** Change vs the same months one year earlier. All null when that period is not fully covered. */
  vsPreviousYear: KpiDeltas;
  previousComparable: boolean;
  previousYearComparable: boolean;
  /** True when both comparison periods are the same months (a 12-month range): show one delta, not two. */
  referencesCoincide: boolean;
}

function nullDeltas(k: Kpis): KpiDeltas {
  const out = {} as KpiDeltas;
  for (const key of Object.keys(k)) if (key !== "months") out[key as KpiKey] = null;
  return out;
}

/**
 * KPIs for a period and its two comparison periods.
 *
 * A comparison is only reported when the comparison period has data for as
 * many months as the current one. Comparing 12 months with 5 months would
 * produce a "growth" figure that is an artefact of missing data, so the
 * delta is null (rendered as missing) instead.
 */
export function comparePeriods(facts: readonly MonthFact[], stores: readonly StoreDTO[], period: Period): PeriodComparison {
  const current = computeKpis(filterFacts(facts, period), stores);
  const previous = computeKpis(filterFacts(facts, period.previous), stores);
  const previousYear = computeKpis(filterFacts(facts, period.previousYear), stores);
  const previousComparable = current.months > 0 && previous.months === current.months;
  const previousYearComparable = current.months > 0 && previousYear.months === current.months;
  return {
    current,
    previous,
    previousYear,
    vsPrevious: previousComparable ? compareKpis(current, previous) : nullDeltas(current),
    vsPreviousYear: previousYearComparable ? compareKpis(current, previousYear) : nullDeltas(current),
    previousComparable,
    previousYearComparable,
    referencesCoincide: period.previous.from === period.previousYear.from && period.previous.to === period.previousYear.to,
  };
}
