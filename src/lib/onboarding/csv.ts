import { isMonthKey, type MonthKey } from "@/lib/period";

export interface CsvMonthRow {
  month: MonthKey;
  revenue: number;
  transactions?: number;
  customers?: number;
  grossMarginPct?: number;
}

export interface CsvLineError {
  /** 1-based line number in the pasted text. */
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: CsvMonthRow[];
  errors: CsvLineError[];
}

export const CSV_MAX_LINES = 120;
export const CSV_FORMAT = "YYYY-MM;revenue;transactions;customers;margin";

/** "1234,5" and "1234.5" are both accepted; thousands separators are not. */
function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses pasted lines of the form `YYYY-MM;revenue;transactions;customers;margin`.
 * Revenue is required; the other three fields may be empty or omitted.
 * Blank lines, `#` comments and a header line starting with "month" are skipped.
 * Every problem is reported with its line number; callers must not save anything
 * when `errors` is non-empty.
 */
export function parseMonthlyCsv(text: string): CsvParseResult {
  const rows: CsvMonthRow[] = [];
  const errors: CsvLineError[] = [];
  const seen = new Map<MonthKey, number>();
  const lines = text.split(/\r?\n/);
  let dataLines = 0;
  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const t = rawLine.trim();
    if (t === "" || t.startsWith("#")) return;
    if (/^month\b/i.test(t) || /^yyyy-mm/i.test(t)) return;
    dataLines += 1;
    if (dataLines > CSV_MAX_LINES) {
      if (dataLines === CSV_MAX_LINES + 1) errors.push({ line, message: `Too many lines — paste at most ${CSV_MAX_LINES} months at a time.` });
      return;
    }
    const parts = t.split(/[;\t]/).map((p) => p.trim());
    if (parts.length < 2) {
      errors.push({ line, message: `Expected ${CSV_FORMAT} separated by semicolons.` });
      return;
    }
    if (parts.length > 5) {
      errors.push({ line, message: `Too many fields (${parts.length}); expected at most 5.` });
      return;
    }
    const [month, rev, tx, cust, margin] = parts as [string, string, string?, string?, string?];
    const problems: string[] = [];
    if (!isMonthKey(month)) problems.push(`"${month}" is not a month in the form YYYY-MM`);
    const revenue = parseNumber(rev);
    if (rev === "") problems.push("revenue is required");
    else if (revenue === null) problems.push(`revenue "${rev}" is not a number`);
    else if (revenue < 0 || revenue > 1e10) problems.push("revenue must be between 0 and 10,000,000,000");

    const optional = (raw: string | undefined, name: string, o: { int?: boolean; min: number; max: number }): number | undefined => {
      if (raw === undefined || raw === "") return undefined;
      const n = parseNumber(raw);
      if (n === null) problems.push(`${name} "${raw}" is not a number`);
      else if (o.int && !Number.isInteger(n)) problems.push(`${name} must be a whole number`);
      else if (n < o.min || n > o.max) problems.push(`${name} must be between ${o.min} and ${o.max}`);
      else return n;
      return undefined;
    };
    const transactions = optional(tx, "transactions", { int: true, min: 0, max: 1e8 });
    const customers = optional(cust, "customers", { int: true, min: 0, max: 1e8 });
    const grossMarginPct = optional(margin, "margin", { min: -100, max: 100 });

    if (isMonthKey(month)) {
      const first = seen.get(month);
      if (first !== undefined) problems.push(`month ${month} already appears on line ${first}`);
      else seen.set(month, line);
    }
    if (problems.length > 0) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }
    rows.push({ month, revenue: revenue!, transactions, customers, grossMarginPct });
  });
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 1, message: "Nothing to import — paste at least one line." });
  return { rows, errors };
}
