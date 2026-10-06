import { isNum, type Num, type SeasonalIndex } from "@/lib/calc";
import { monthNumber, type MonthKey } from "@/lib/period";

/**
 * Easter Sunday (Gregorian calendar) by the anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher). Returns an ISO date "YYYY-MM-DD".
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface YoyPivot {
  /** Calendar years present, ascending. */
  years: number[];
  /** 12 rows (Jan…Dec); `values[year]` is null when that month has no data. */
  rows: { month: number; values: Record<number, number | null> }[];
}

/** Pivots a monthly series into calendar month × year, for a one-line-per-year chart. */
export function yoyPivot(points: ReadonlyArray<{ month: MonthKey; value: Num }>): YoyPivot {
  const years = [...new Set(points.filter((p) => isNum(p.value)).map((p) => Number(p.month.slice(0, 4))))].sort((a, b) => a - b);
  const lookup = new Map(points.map((p) => [p.month, isNum(p.value) ? p.value : null]));
  const rows = Array.from({ length: 12 }, (_, k) => {
    const values: Record<number, number | null> = {};
    for (const y of years) values[y] = lookup.get(`${y}-${String(k + 1).padStart(2, "0")}`) ?? null;
    return { month: k + 1, values };
  });
  return { years, rows };
}

/** Index 1.08 → +8 (% above an average month). */
export function indexToPct(index: Num): number | null {
  return isNum(index) ? (index - 1) * 100 : null;
}

export interface CalendarContextRow {
  key: string;
  /** e.g. "December" */
  period: string;
  /** Dated calendar fact, e.g. "Christmas (25–26 Dec)". */
  context: string;
  /** Calendar months (1–12) the row refers to. */
  months: number[];
  /** Mean of the seasonal indices of those months; null if any is missing. */
  index: number | null;
  /** Smallest observation count among those months. */
  observations: number;
  note?: string;
}

/**
 * Calendar context for a seasonal index: fixed and movable dates that fall in
 * the data window, each next to the index that was OBSERVED for its calendar
 * month. This is a juxtaposition, not an attribution — the function does not
 * (and cannot) tell why an index is high or low.
 *
 * `months` are the month keys that have data. `summerHolidayLabel` lets the
 * caller word the July–August row for the organization's country.
 */
export function calendarContext(
  indices: readonly SeasonalIndex[],
  months: readonly MonthKey[],
  summerHolidayLabel = "Summer school holidays",
): CalendarContextRow[] {
  const at = (ms: number[]) => {
    const xs = ms.map((m) => indices[m - 1]);
    const vals = xs.map((x) => x?.index ?? null);
    return {
      index: vals.every(isNum) ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      observations: Math.min(...xs.map((x) => x?.observations ?? 0)),
    };
  };
  const have = new Set(months);
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b);
  const rows: CalendarContextRow[] = [];

  const easterByMonth = new Map<number, string[]>();
  const easterMonthsAll = new Set<number>();
  for (const y of years) {
    const date = easterSunday(y);
    if (!have.has(date.slice(0, 7))) continue;
    const m = monthNumber(date.slice(0, 7));
    easterMonthsAll.add(m);
    easterByMonth.set(m, [...(easterByMonth.get(m) ?? []), date]);
  }
  for (const [m, dates] of [...easterByMonth].sort(([a], [b]) => a - b)) {
    const obs = indices[m - 1]?.observations ?? 0;
    rows.push({
      key: `easter-${m}`,
      period: MONTHS[m - 1]!,
      context: `Easter Sunday: ${dates.join(", ")}`,
      months: [m],
      ...at([m]),
      note:
        dates.length < obs
          ? `Easter fell in this month in ${dates.length} of the ${obs} observed years, so the index mixes Easter and non-Easter years.`
          : easterMonthsAll.size > 1
            ? "Easter moved between March and April within the data window."
            : undefined,
    });
  }
  rows.push({ key: "summer", period: "July – August", context: summerHolidayLabel, months: [7, 8], ...at([7, 8]) });
  rows.push({ key: "christmas", period: "December", context: "Christmas (24–26 Dec) and year-end", months: [12], ...at([12]) });
  return rows;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Number of complete calendar-month cycles covered (24 usable months → 2). */
export function fullYears(usableMonths: number): number {
  return Math.floor(usableMonths / 12);
}
