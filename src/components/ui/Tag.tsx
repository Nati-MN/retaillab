import { cn } from "@/lib/cn";

/**
 * Epistemic labels (product principle §50). Use them wherever a reader could
 * otherwise mistake one kind of statement for another.
 */
export const EPISTEMIC = {
  FACT: { label: "Known fact", cls: "border-line-strong text-ink-2", hint: "Recorded data entered by your organization or cited from a source." },
  CALCULATED: { label: "Calculated", cls: "border-info/40 text-info", hint: "Computed from recorded data by a deterministic formula." },
  ASSUMPTION: { label: "Assumption", cls: "border-warn/50 text-warn", hint: "A value someone chose. Change it and the result changes." },
  CORRELATION: { label: "Correlation", cls: "border-info/40 text-info border-dashed", hint: "Two things move together in the data. This does not show that one causes the other." },
  HYPOTHESIS: { label: "Hypothesis", cls: "border-accent/50 text-accent", hint: "A possible explanation or idea. Not validated." },
  FORECAST: { label: "Forecast", cls: "border-info/40 text-info border-dashed", hint: "Statistical projection of past patterns. Not a certainty." },
  EXPERIMENT_RESULT: { label: "Experiment result", cls: "border-pos/50 text-pos", hint: "Measured before/after values from an experiment. See its limitations." },
  UNKNOWN: { label: "Unknown", cls: "border-dashed border-line-strong text-ink-3", hint: "No reliable data or source is available." },
  SCENARIO: { label: "Scenario · not a forecast", cls: "border-warn/50 text-warn", hint: "Arithmetic on user assumptions. It shows what would follow IF the assumptions held." },
  DEMO: { label: "Demo data · fictional", cls: "border-accent/50 bg-accent/10 text-accent", hint: "Invented data for demonstration. Not a real company, store or place." },
} as const;

export type EpistemicKind = keyof typeof EPISTEMIC;

export function Tag({ kind, children, className }: { kind: EpistemicKind; children?: React.ReactNode; className?: string }) {
  const e = EPISTEMIC[kind];
  return (
    <span
      title={e.hint}
      className={cn("inline-flex h-[18px] shrink-0 items-center rounded-sm border px-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em]", e.cls, className)}
    >
      {children ?? e.label}
    </span>
  );
}

/** Neutral status chip (experiment status, store type…). Not an epistemic label. */
export function Chip({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "pos" | "neg" | "warn" | "info" | "accent"; className?: string }) {
  const tones = {
    neutral: "bg-line/60 text-ink-2",
    pos: "bg-pos/10 text-pos",
    neg: "bg-neg/10 text-neg",
    warn: "bg-warn/10 text-warn",
    info: "bg-info/10 text-info",
    accent: "bg-accent/10 text-accent",
  } as const;
  return <span className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-2xs font-medium", tones[tone], className)}>{children}</span>;
}
