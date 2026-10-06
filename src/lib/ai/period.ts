import { addMonths, type MonthKey } from "@/lib/period";
import type { Window } from "./types";

/** Resolves a tool period parameter ("<n>m" or "ytd") against the latest month that has data. */
export function resolveToolPeriod(latest: MonthKey, period: string): Window & { months: number } {
  if (period === "ytd") {
    const from = `${latest.slice(0, 4)}-01`;
    return { from, to: latest, months: Number(latest.slice(5, 7)) };
  }
  const m = /^(\d{1,2})m$/.exec(period);
  const n = Math.min(24, Math.max(1, m ? Number(m[1]) : 12));
  return { from: addMonths(latest, -(n - 1)), to: latest, months: n };
}

export function shiftWindow(w: Window, deltaMonths: number): Window {
  return { from: addMonths(w.from, deltaMonths), to: addMonths(w.to, deltaMonths) };
}
