import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtSignedPct, fmtSignedPts, MISSING } from "@/lib/format";

/**
 * Change indicator. Direction is carried by icon + sign, not colour alone.
 * `goodWhen="down"` for costs, where a decrease is the favourable direction.
 */
export function Delta({
  value, unit = "%", goodWhen = "up", label, className,
}: {
  value: number | null | undefined;
  unit?: "%" | "pts";
  goodWhen?: "up" | "down" | "none";
  label?: string;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn("num inline-flex items-center gap-1 text-xs text-ink-3", className)} title="Not enough data to compare">
        {MISSING}{label && <span>{label}</span>}
      </span>
    );
  }
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = goodWhen === "none" || flat ? null : (goodWhen === "up") === up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 text-xs font-medium", good === null ? "text-ink-2" : good ? "text-pos" : "text-neg", className)}>
      <Icon className="h-3 w-3" aria-hidden />
      <span>{unit === "%" ? fmtSignedPct(value) : fmtSignedPts(value)}</span>
      {label && <span className="ml-1 font-normal text-ink-3">{label}</span>}
    </span>
  );
}

export interface KpiProps {
  label: string;
  /** Already formatted. Pass null when the value cannot be calculated. */
  value: string | null;
  /** Shown instead of the value when it is null. */
  missingReason?: string;
  deltas?: { value: number | null; label: string; unit?: "%" | "pts"; goodWhen?: "up" | "down" | "none" }[];
  /** Formula or provenance, shown small under the value. */
  formula?: string;
  size?: "md" | "lg";
  children?: React.ReactNode;
}

export function Kpi({ label, value, missingReason, deltas, formula, size = "md", children }: KpiProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5">
      <div className="label truncate">{label}</div>
      {value !== null ? (
        <div className={cn("num truncate font-semibold tracking-tight", size === "lg" ? "text-2xl leading-8" : "text-lg leading-6")}>{value}</div>
      ) : (
        <div className="leading-6">
          <span className="num text-lg font-semibold text-ink-3">{MISSING}</span>
          <span className="ml-2 text-xs text-ink-3">{missingReason ?? "Missing data"}</span>
        </div>
      )}
      {deltas && deltas.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {deltas.map((d) => (
            <Delta key={d.label} value={d.value} label={d.label} unit={d.unit} goodWhen={d.goodWhen} />
          ))}
        </div>
      )}
      {formula && <div className="truncate font-mono text-[10px] text-ink-3" title={formula}>{formula}</div>}
      {children}
    </div>
  );
}

/** Grid of KPI tiles separated by hairlines (no individual cards). */
export function KpiGrid({ children, cols = 5 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5", 6: "sm:grid-cols-3 xl:grid-cols-6" }[cols];
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line", c)}>{children}</div>;
}
