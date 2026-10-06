import { cn } from "@/lib/cn";

export interface CalcLine {
  label: string;
  /** e.g. "2 × € 19 × 26" */
  expr?: string;
  result: string;
  emphasis?: boolean;
  note?: string;
}

/**
 * Shows a calculation step by step: label, expression, result.
 * Use for every derived number a user might ask "where does this come from?" about.
 */
export function CalcBlock({ lines, className }: { lines: CalcLine[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line rounded border border-line bg-surface-2 font-mono text-xs", className)}>
      {lines.map((l, i) => (
        <div key={i} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-3 py-1.5", l.emphasis && "bg-surface")}>
          <dt className="min-w-0">
            <span className={cn("font-sans text-ink-2", l.emphasis && "font-semibold text-ink")}>{l.label}</span>
            {l.expr && <span className="num ml-2 text-ink-3">{l.expr}</span>}
            {l.note && <div className="font-sans text-2xs text-ink-3">{l.note}</div>}
          </dt>
          <dd className={cn("num text-right", l.emphasis ? "text-[13px] font-semibold" : "text-ink")}>{l.result}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Inline formula caption, e.g. under a KPI. */
export function Formula({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn("num font-mono text-2xs text-ink-3", className)}>{children}</code>;
}
