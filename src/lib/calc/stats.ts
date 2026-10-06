import { calculateGrowthRate, isNum, type Num } from "./kpi";

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Sample standard deviation (n − 1). Null for fewer than 2 values. */
export function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Pearson correlation coefficient. Null for n < 3 or zero variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export interface LinearFit {
  slope: number;
  intercept: number;
}

/** Ordinary least squares y = intercept + slope·x. Null for n < 2 or constant x. */
export function linearRegression(xs: readonly number[], ys: readonly number[]): LinearFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// ── Anomaly detection ───────────────────────────────────────────────────────

export interface AnomalyPoint {
  index: number;
  value: number;
  /** Change vs the same month one year earlier (%), when available; else vs previous month. */
  changePct: number;
  basis: "yoy" | "mom";
  /** Robust z-score: distance from the series' typical (median) change, in spread units. */
  zScore: number;
  direction: "up" | "down";
}

export interface AnomalyOptions {
  /** Minimum robust |z| to flag. Default 2.5. */
  zThreshold?: number;
  /** Minimum deviation from the typical change, in percentage points. Default 5. */
  minChangePct?: number;
  /** Seasonal period. Default 12 (monthly data). */
  period?: number;
}

/**
 * Flags points whose change deviates strongly from the series' own typical change.
 *
 * Method (transparent, no ML):
 *  1. For each month compute the change vs the same month last year (YoY) when
 *     ≥ period+4 points exist, otherwise vs the previous month (MoM).
 *  2. Typical change = median of those changes. Spread = 1.4826 × median absolute
 *     deviation (a robust stand-in for the standard deviation that a single
 *     outlier cannot inflate); falls back to the standard deviation when the
 *     MAD is zero.
 *  3. Flag a month when |change − typical| / spread ≥ zThreshold AND
 *     |change − typical| ≥ minChangePct percentage points.
 *
 * A store growing steadily at +12% is therefore not flagged; a store that
 * normally grows +2% and suddenly shows −12% is. This says "unusual for this
 * series" — it says nothing about why.
 */
export function detectAnomalies(series: ReadonlyArray<Num>, opts: AnomalyOptions = {}): AnomalyPoint[] {
  const zThreshold = opts.zThreshold ?? 2.5;
  const minChangePct = opts.minChangePct ?? 5;
  const period = opts.period ?? 12;
  const useYoy = series.length >= period + 4;
  const lag = useYoy ? period : 1;
  const changes: { index: number; value: number; change: number }[] = [];
  for (let i = lag; i < series.length; i++) {
    const cur = series[i];
    const prev = series[i - lag];
    const g = calculateGrowthRate(cur, prev);
    if (g !== null && isNum(cur)) changes.push({ index: i, value: cur, change: g });
  }
  const vals = changes.map((c) => c.change);
  const center = median(vals);
  if (center === null || vals.length < 4) return [];
  const mad = median(vals.map((v) => Math.abs(v - center)))!;
  let spread = 1.4826 * mad;
  if (spread < 1e-9) spread = stdev(vals) ?? 0;
  if (spread < 1e-9) return [];
  const out: AnomalyPoint[] = [];
  for (const c of changes) {
    const dev = c.change - center;
    const z = dev / spread;
    if (Math.abs(z) >= zThreshold && Math.abs(dev) >= minChangePct) {
      out.push({
        index: c.index,
        value: c.value,
        changePct: c.change,
        basis: useYoy ? "yoy" : "mom",
        zScore: z,
        direction: dev >= 0 ? "up" : "down",
      });
    }
  }
  return out;
}

// ── Seasonality ─────────────────────────────────────────────────────────────

export interface SeasonalIndex {
  /** 1–12 */
  month: number;
  /** Average of (value / that year's monthly mean); 1.0 = an average month. Null if no data. */
  index: number | null;
  observations: number;
}

/**
 * Seasonal index per calendar month using ratio-to-trend: each value is divided
 * by the series' fitted linear trend at that point, then averaged by calendar
 * month. Dividing by the trend prevents steady growth from being mistaken for
 * seasonality. Requires at least 12 points.
 */
export function seasonalIndices(
  points: ReadonlyArray<{ month: number; value: Num }>,
): SeasonalIndex[] {
  const usable = points.map((p, i) => ({ ...p, i })).filter((p): p is { month: number; value: number; i: number } => isNum(p.value));
  const empty = Array.from({ length: 12 }, (_, k) => ({ month: k + 1, index: null, observations: 0 }));
  if (usable.length < 12) return empty;
  const fit = linearRegression(usable.map((p) => p.i), usable.map((p) => p.value));
  if (!fit) return empty;
  const buckets = new Map<number, number[]>();
  for (const p of usable) {
    const trend = fit.intercept + fit.slope * p.i;
    if (trend <= 0) continue;
    const arr = buckets.get(p.month) ?? [];
    arr.push(p.value / trend);
    buckets.set(p.month, arr);
  }
  return empty.map((e) => {
    const arr = buckets.get(e.month) ?? [];
    return { month: e.month, index: mean(arr), observations: arr.length };
  });
}

// ── Forecast ────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  /** Steps ahead, starting at 1. */
  step: number;
  value: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  model: "linear-trend × seasonal-index" | "linear-trend";
  points: ForecastPoint[];
  slopePerPeriod: number;
  residualStdev: number;
  /** z used for the interval (1.28 ≈ 80%). */
  intervalZ: number;
  assumptions: string[];
}

/**
 * Transparent forecast: linear trend fitted by least squares, multiplied by a
 * seasonal index per calendar month when ≥ 24 points exist.
 *
 * Interval: ± z × residual standard deviation × √(1 + step/n). This widens with
 * the horizon but is a simple approximation, not a full prediction interval.
 * Returns null with fewer than 12 usable points.
 */
export function forecastSeries(
  history: ReadonlyArray<{ month: number; value: Num }>,
  horizon: number,
  intervalZ = 1.28,
): ForecastResult | null {
  const usable = history.map((p, i) => ({ ...p, i })).filter((p): p is { month: number; value: number; i: number } => isNum(p.value));
  if (usable.length < 12 || history.length === 0) return null;
  const fit = linearRegression(usable.map((p) => p.i), usable.map((p) => p.value));
  if (!fit) return null;
  const seasonal = usable.length >= 24;
  const idx = seasonal ? seasonalIndices(history) : [];
  const factor = (month: number) => (seasonal ? (idx[month - 1]?.index ?? 1) : 1);
  const residuals = usable.map((p) => p.value - (fit.intercept + fit.slope * p.i) * factor(p.month));
  const sd = stdev(residuals) ?? 0;
  const n = usable.length;
  const lastMonth = history[history.length - 1]!.month;
  const points: ForecastPoint[] = [];
  for (let step = 1; step <= horizon; step++) {
    const i = history.length - 1 + step;
    const month = ((lastMonth - 1 + step) % 12) + 1;
    const value = (fit.intercept + fit.slope * i) * factor(month);
    const half = intervalZ * sd * Math.sqrt(1 + step / n);
    points.push({ step, value, lower: value - half, upper: value + half });
  }
  return {
    model: seasonal ? "linear-trend × seasonal-index" : "linear-trend",
    points,
    slopePerPeriod: fit.slope,
    residualStdev: sd,
    intervalZ,
    assumptions: [
      "The linear trend observed in the history continues unchanged.",
      seasonal
        ? "Each calendar month repeats its historical seasonal pattern (estimated from the available years)."
        : "No seasonal adjustment: fewer than 24 months of history are available.",
      "No known future events (openings, closures, renovations, price changes) are included.",
      `Interval = ± ${intervalZ} × residual standard deviation × √(1 + step/n) — an approximation that assumes past errors are representative.`,
    ],
  };
}
