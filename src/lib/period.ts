/** Month keys are "YYYY-MM". All month arithmetic is done in UTC. */
export type MonthKey = string;

export function monthKey(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthToDate(key: MonthKey): Date {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1));
}

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const d = monthToDate(key);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthKey(d);
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function monthNumber(key: MonthKey): number {
  return Number(key.slice(5, 7));
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "Sep 26" */
export function monthLabel(key: MonthKey): string {
  return `${SHORT[monthNumber(key) - 1]} ${key.slice(2, 4)}`;
}

/** "September 2026" */
export function monthLabelLong(key: MonthKey): string {
  return `${LONG[monthNumber(key) - 1]} ${key.slice(0, 4)}`;
}

export function monthName(n: number): string {
  return SHORT[(n - 1 + 12) % 12]!;
}

export const RANGE_PRESETS = ["1m", "3m", "6m", "12m", "ytd", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  "1m": "30 days",
  "3m": "3 months",
  "6m": "6 months",
  "12m": "12 months",
  ytd: "YTD",
  custom: "Custom",
};

export interface Period {
  preset: RangePreset;
  from: MonthKey;
  to: MonthKey;
  months: number;
  /** The equally long period immediately before. */
  previous: { from: MonthKey; to: MonthKey };
  /** The same months one year earlier. */
  previousYear: { from: MonthKey; to: MonthKey };
}

/**
 * Resolves a range preset against the latest month that has data.
 * RetailLab stores monthly facts, so "30 days" means the latest complete month.
 */
export function resolvePeriod(
  latest: MonthKey,
  preset: RangePreset = "12m",
  custom?: { from?: string | null; to?: string | null },
): Period {
  let from: MonthKey;
  let to: MonthKey = latest;
  switch (preset) {
    case "1m":
      from = latest;
      break;
    case "3m":
      from = addMonths(latest, -2);
      break;
    case "6m":
      from = addMonths(latest, -5);
      break;
    case "ytd":
      from = `${latest.slice(0, 4)}-01`;
      break;
    case "custom":
      to = isMonthKey(custom?.to) ? custom.to : latest;
      from = isMonthKey(custom?.from) ? custom.from : addMonths(to, -11);
      if (from > to) [from, to] = [to, from];
      break;
    case "12m":
    default:
      from = addMonths(latest, -11);
  }
  const months = monthRange(from, to).length;
  return {
    preset,
    from,
    to,
    months,
    previous: { from: addMonths(from, -months), to: addMonths(from, -1) },
    previousYear: { from: addMonths(from, -12), to: addMonths(to, -12) },
  };
}

export function parsePreset(v: string | string[] | undefined): RangePreset {
  const s = Array.isArray(v) ? v[0] : v;
  return (RANGE_PRESETS as readonly string[]).includes(s ?? "") ? (s as RangePreset) : "12m";
}

export function periodLabel(p: { from: MonthKey; to: MonthKey }): string {
  return p.from === p.to ? monthLabelLong(p.from) : `${monthLabel(p.from)} – ${monthLabel(p.to)}`;
}
