/**
 * Deterministic KPI formulas.
 *
 * Contract for every function in src/lib/calc:
 * - Pure: no I/O, no randomness, no dates read from the clock.
 * - A missing or unusable input (null, undefined, NaN, Infinity, or a zero
 *   denominator) yields `null`. Callers must render `null` as "missing data",
 *   never as 0.
 * - No rounding. Formatting is a presentation concern (src/lib/format.ts).
 */

export type Num = number | null | undefined;

export function isNum(v: Num): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function ratio(numerator: Num, denominator: Num): number | null {
  if (!isNum(numerator) || !isNum(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/** Average Basket = Revenue / Transactions */
export function calculateAverageBasket(revenue: Num, transactions: Num): number | null {
  return ratio(revenue, transactions);
}

/** Revenue per Square Meter = Revenue / Store Area */
export function calculateRevenuePerSqm(revenue: Num, areaSqm: Num): number | null {
  return ratio(revenue, areaSqm);
}

/** Revenue per Employee = Revenue / Employees */
export function calculateRevenuePerEmployee(revenue: Num, employees: Num): number | null {
  return ratio(revenue, employees);
}

/** Revenue per Customer = Revenue / Customer Count */
export function calculateRevenuePerCustomer(revenue: Num, customers: Num): number | null {
  return ratio(revenue, customers);
}

/** Gross Profit = Revenue × Gross Margin. `grossMarginPct` is a percent value (31.4 = 31.4%). */
export function calculateGrossProfit(revenue: Num, grossMarginPct: Num): number | null {
  if (!isNum(revenue) || !isNum(grossMarginPct)) return null;
  return revenue * (grossMarginPct / 100);
}

/** Operating Profit = Gross Profit − Operating Costs */
export function calculateOperatingProfit(grossProfit: Num, operatingCosts: Num): number | null {
  if (!isNum(grossProfit) || !isNum(operatingCosts)) return null;
  return grossProfit - operatingCosts;
}

/** Growth Rate (%) = (Current − Previous) / Previous × 100 */
export function calculateGrowthRate(current: Num, previous: Num): number | null {
  if (!isNum(current) || !isNum(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Share (%) = Part / Total × 100 */
export function calculateShare(part: Num, total: Num): number | null {
  const r = ratio(part, total);
  return r === null ? null : r * 100;
}

/** Per-day average = Monthly total / Open days */
export function calculatePerDay(monthlyTotal: Num, openDays: Num): number | null {
  return ratio(monthlyTotal, openDays);
}

/**
 * Revenue-weighted gross margin (%) across rows = Σ(revenue × margin) / Σ(revenue).
 * Rows without a margin are excluded from BOTH sums; returns null if none qualify.
 */
export function calculateWeightedMargin(
  rows: ReadonlyArray<{ revenue: Num; grossMarginPct: Num }>,
): number | null {
  let weighted = 0;
  let base = 0;
  for (const r of rows) {
    if (isNum(r.revenue) && isNum(r.grossMarginPct)) {
      weighted += r.revenue * r.grossMarginPct;
      base += r.revenue;
    }
  }
  return base === 0 ? null : weighted / base;
}

/** Sum that is null when there is nothing to sum (so "no data" ≠ 0). */
export function sumOrNull(values: ReadonlyArray<Num>): number | null {
  let total = 0;
  let seen = false;
  for (const v of values) {
    if (isNum(v)) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
}

/**
 * Strict sum: null if ANY value is missing. Use when a partial total would be
 * misleading (e.g. operating profit when one store has no cost data).
 */
export function sumStrict(values: ReadonlyArray<Num>): number | null {
  let total = 0;
  for (const v of values) {
    if (!isNum(v)) return null;
    total += v;
  }
  return values.length === 0 ? null : total;
}

/** Relative difference (%) of a vs b = (a − b) / b × 100 */
export function calculateRelativeDifference(a: Num, b: Num): number | null {
  return calculateGrowthRate(a, b);
}
