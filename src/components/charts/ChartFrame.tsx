"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Wraps every chart with: an accessible text summary, a Chart/Table toggle
 * (the table is the non-visual equivalent of the chart) and a fixed height so
 * layouts do not jump while charts mount.
 */
export function ChartFrame({
  summary, table, height = 240, children, legend, className,
}: {
  /** One or two sentences stating what the chart shows. Read by screen readers and shown under the chart. */
  summary: string;
  table?: TableView;
  height?: number;
  children: React.ReactNode;
  legend?: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <figure className={cn("m-0", className)} aria-labelledby={id}>
      <div className="mb-1.5 flex min-h-6 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">{legend}</div>
        {table && (
          <div role="group" aria-label="View" className="no-print inline-flex overflow-hidden rounded border border-line text-2xs">
            {(["chart", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-5 px-1.5 capitalize", view === v ? "bg-line text-ink" : "text-ink-3 hover:text-ink")}>
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === "chart" || !table ? (
        <div style={{ height }} role="img" aria-label={summary}>{children}</div>
      ) : (
        <div style={{ maxHeight: height }} className="scroll-thin overflow-auto rounded border border-line">
          <table className="tbl text-xs">
            <thead><tr>{table.columns.map((c, i) => <th key={c} className={i > 0 ? "text-right" : ""}>{c}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={j > 0 ? "r" : ""}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <figcaption id={id} className="mt-1.5 text-xs text-ink-3">{summary}</figcaption>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 5px)` : i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartTooltip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      <div className="mb-1 font-medium">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              {r.color && <span aria-hidden className="inline-block h-2 w-2 rounded-[1px]" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="num font-medium">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const AXIS_TICK = { fontSize: 11, fill: "rgb(var(--ink-3))" } as const;
