import type { Kpis } from "@/lib/analytics/types";

/**
 * A store's recorded values in the shape the simulators need. Every field is
 * null when the underlying data is missing — the simulators then leave the
 * input empty instead of inventing a value.
 */
export interface StorePrefill {
  storeId: string;
  storeName: string;
  /** e.g. "Jul 26 – Sep 26" */
  periodLabel: string;
  months: number;
  /** Revenue / transactions, rounded to cents. */
  averageBasket: number | null;
  /** Revenue-weighted gross margin, rounded to 0.1 points. */
  grossMarginPct: number | null;
  /** Open days / months, rounded to whole days. */
  daysPerMonth: number | null;
  /** Transactions / open days, rounded to whole transactions. */
  transactionsPerDay: number | null;
  /** Transactions / months, rounded to whole transactions. */
  transactionsPerMonth: number | null;
  closesAt: string | null;
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** Derives simulator prefill values from a store's KPIs over a period (no I/O). */
export function storePrefillFromKpis(
  store: { id: string; name: string; closesAt: string | null },
  k: Kpis,
  periodLabel: string,
): StorePrefill {
  return {
    storeId: store.id,
    storeName: store.name,
    periodLabel,
    months: k.months,
    averageBasket: k.averageBasket !== null ? round(k.averageBasket, 2) : null,
    grossMarginPct: k.grossMarginPct !== null ? round(k.grossMarginPct, 1) : null,
    daysPerMonth: k.openDays !== null && k.months > 0 ? Math.round(k.openDays / k.months) : null,
    transactionsPerDay: k.transactionsPerDay !== null ? Math.round(k.transactionsPerDay) : null,
    transactionsPerMonth: k.transactions !== null && k.months > 0 ? Math.round(k.transactions / k.months) : null,
    closesAt: store.closesAt,
  };
}
