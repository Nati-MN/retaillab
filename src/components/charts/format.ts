import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtPct } from "@/lib/format";

/** Serializable value formats (functions cannot cross the server → client boundary). */
export type ValueFormat = "money" | "money2" | "number" | "number1" | "pct" | "pct2" | "index";

export function formatValue(v: number | null | undefined, format: ValueFormat, currency = "EUR"): string {
  switch (format) {
    case "money": return fmtMoney(v, currency);
    case "money2": return fmtMoney(v, currency, 2);
    case "number": return fmtNumber(v);
    case "number1": return fmtNumber(v, 1);
    case "pct": return fmtPct(v);
    case "pct2": return fmtPct(v, 2);
    case "index": return fmtNumber(v, 2);
  }
}

export function formatAxis(v: number, format: ValueFormat, currency = "EUR"): string {
  switch (format) {
    case "money": return fmtMoneyCompact(v, currency);
    case "money2": return fmtMoney(v, currency, v < 100 ? 2 : 0);
    case "number": return Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : fmtNumber(v);
    case "number1": return fmtNumber(v, 1);
    case "pct": return `${fmtNumber(v, 0)}%`;
    case "pct2": return `${fmtNumber(v, 1)}%`;
    case "index": return fmtNumber(v, 2);
  }
}
