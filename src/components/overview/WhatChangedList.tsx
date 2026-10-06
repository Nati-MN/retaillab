import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Anomaly } from "@/lib/analytics/anomalies";
import { fmtMoney, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/format";
import { monthLabel } from "@/lib/period";

export function anomalyValue(a: Anomaly, currency: string): string {
  if (a.metric === "grossMarginPct") return fmtPct(a.value);
  if (a.metric === "customers") return fmtNumber(a.value);
  if (a.metric === "averageBasket") return fmtMoney(a.value, currency, 2);
  return fmtMoney(a.value, currency);
}

export function anomalyBasis(a: Anomaly): string {
  return a.basis === "yoy" ? "vs same month last year" : "vs previous month";
}

/** Compact list of observed anomalies. Observation only: no cause is stated. */
export function WhatChangedList({ anomalies, currency, showStore = true }: { anomalies: Anomaly[]; currency: string; showStore?: boolean }) {
  if (anomalies.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-ink-3">
        No unusual months detected. Detection needs at least 5 consecutive months per store; with less history nothing is flagged.
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {anomalies.map((a) => {
          const Icon = a.direction === "up" ? ArrowUpRight : ArrowDownRight;
          return (
            <li key={`${a.storeId}-${a.metric}-${a.month}`} className="flex items-start gap-2.5 px-3 py-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-2" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">
                    {a.metricLabel}
                    {showStore && <> · <Link href={`/stores/${a.storeId}`} className="hover:underline">{a.storeName}</Link></>}
                  </span>
                  <span className="num shrink-0 font-medium">{fmtSignedPct(a.changePct)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs text-ink-3">
                  <span className="num truncate">{monthLabel(a.month)} · {anomalyValue(a, currency)}</span>
                  <span className="shrink-0">{anomalyBasis(a)}</span>
                </div>
                <div className="text-xs text-ink-3">
                  {a.knownEvents.length > 0
                    ? <>Event on record: <span className="text-ink-2">{a.knownEvents.map((e) => e.title).join("; ")}</span></>
                    : "No event on record for this period"}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
        Observations only. A recorded event in the same period is listed, not asserted as the cause.
      </p>
    </>
  );
}
