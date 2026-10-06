import type { Num } from "@/lib/calc";

/** Shown wherever a value cannot be calculated. Never substitute 0. */
export const MISSING = "—";

const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };
const NBSP = " ";

function ok(v: Num): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function fmtNumber(v: Num, decimals = 0): string {
  if (!ok(v)) return MISSING;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "€ 487,240" — symbol, thin gap, grouped digits. */
export function fmtMoney(v: Num, currency = "EUR", decimals = 0): string {
  if (!ok(v)) return MISSING;
  const sym = SYMBOLS[currency] ?? currency;
  const sign = v < 0 ? "−" : "";
  return `${sign}${sym}${NBSP}${fmtNumber(Math.abs(v), decimals)}`;
}

/** Compact money for axes and dense tables: "€ 1.24M", "€ 487k". */
export function fmtMoneyCompact(v: Num, currency = "EUR"): string {
  if (!ok(v)) return MISSING;
  const sym = SYMBOLS[currency] ?? currency;
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${sym}${NBSP}${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 10_000) return `${sign}${sym}${NBSP}${Math.round(a / 1_000)}k`;
  if (a >= 1_000) return `${sign}${sym}${NBSP}${(a / 1_000).toFixed(1)}k`;
  return `${sign}${sym}${NBSP}${a.toFixed(0)}`;
}

export function fmtPct(v: Num, decimals = 1): string {
  if (!ok(v)) return MISSING;
  return `${fmtNumber(v, decimals)}%`;
}

/** "+8.4%" / "−3.1%" with a real minus sign. */
export function fmtSignedPct(v: Num, decimals = 1): string {
  if (!ok(v)) return MISSING;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${fmtNumber(Math.abs(v), decimals)}%`;
}

export function fmtSignedPts(v: Num, decimals = 1): string {
  if (!ok(v)) return MISSING;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${fmtNumber(Math.abs(v), decimals)}${NBSP}pts`;
}

export function fmtSignedMoney(v: Num, currency = "EUR", decimals = 0): string {
  if (!ok(v)) return MISSING;
  const sym = SYMBOLS[currency] ?? currency;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${sym}${NBSP}${fmtNumber(Math.abs(v), decimals)}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return MISSING;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return MISSING;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDistance(m: Num): string {
  if (!ok(m)) return MISSING;
  return m >= 1000 ? `${(m / 1000).toFixed(1)}${NBSP}km` : `${Math.round(m)}${NBSP}m`;
}

/** Title-cases an ENUM_VALUE → "Enum value". */
export function humanize(s: string): string {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
