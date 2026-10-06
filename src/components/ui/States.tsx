import { AlertTriangle, CircleSlash, Info, FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { MISSING } from "@/lib/format";

/** Inline placeholder for a value that cannot be calculated. */
export function Missing({ reason }: { reason?: string }) {
  return (
    <span className="num text-ink-3" title={reason ?? "Missing data"}>
      {MISSING}
      <span className="sr-only"> {reason ?? "Missing data"}</span>
    </span>
  );
}

const TONES = {
  info: { cls: "border-line bg-surface-2 text-ink-2", Icon: Info },
  warn: { cls: "border-warn/40 bg-warn/5 text-ink", Icon: AlertTriangle },
  error: { cls: "border-neg/40 bg-neg/5 text-ink", Icon: AlertTriangle },
  demo: { cls: "border-accent/40 bg-accent/5 text-ink", Icon: FlaskConical },
  unavailable: { cls: "border-dashed border-line-strong bg-surface-2 text-ink-2", Icon: CircleSlash },
} as const;

/** Inline notice. `unavailable` is for "provider not connected / no data" states. */
export function Notice({ tone = "info", title, children, className, action }: { tone?: keyof typeof TONES; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("flex items-start gap-2.5 rounded border px-3 py-2 text-xs leading-5", cls, className)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-ink">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Full empty state for a panel or page: what is missing and what to do about it. */
export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      <CircleSlash className="h-5 w-5 text-ink-3" aria-hidden />
      <div className="text-[13px] font-semibold">{title}</div>
      {children && <p className="max-w-md text-xs text-ink-2">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-line/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-5 h-4 w-96 max-w-full" />
      <div className="mb-4 grid grid-cols-2 gap-px sm:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-none" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
