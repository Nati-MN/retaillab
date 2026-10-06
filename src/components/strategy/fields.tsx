"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { StorePrefill } from "@/lib/strategy/prefill";
import { exprNum, parseInputNumber, SCENARIO_DISCLAIMER, type InputUnit } from "@/lib/strategy/scenarioKinds";

const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };

export function unitAdornment(unit: InputUnit | "pts" | "time", currency: string): string {
  switch (unit) {
    case "money": return SYMBOLS[currency] ?? currency;
    case "pct": return "%";
    case "pts": return "pts";
    case "hours": return "h";
    case "days": return "days";
    default: return "";
  }
}

/**
 * Numeric text field that keeps exactly what the user typed. Empty stays
 * empty (never 0); unparsable input is flagged instead of silently ignored.
 */
export function NumberField({
  label, value, onChange, unit, currency, help, optional, className, slider, step, hideLabel, placeholder, note,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: InputUnit | "pts";
  currency: string;
  help?: string;
  optional?: boolean;
  className?: string;
  slider?: { min: number; max: number; step: number };
  step?: number;
  hideLabel?: boolean;
  placeholder?: string;
  note?: React.ReactNode;
}) {
  const id = useId();
  const parsed = parseInputNumber(value);
  const invalid = value.trim() !== "" && parsed === null;
  const ad = unitAdornment(unit, currency);
  const prefix = unit === "money";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className={cn("flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2", hideLabel && "sr-only")}>
        <span>{label}</span>
        {optional && <span className="font-normal text-ink-3">optional</span>}
      </label>
      <div className="flex items-center gap-2">
        {slider && (
          <input
            type="range"
            aria-label={`${label} (slider)`}
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={parsed === null ? slider.min : Math.min(slider.max, Math.max(slider.min, parsed))}
            onChange={(e) => onChange(e.target.value)}
            className={cn("h-1.5 min-w-0 flex-1 cursor-pointer accent-[rgb(var(--ink))]", parsed === null && "opacity-50")}
          />
        )}
        <div className={cn("relative", slider ? "w-[5.5rem] shrink-0" : "w-full")}>
          {ad && prefix && <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-ink-3" aria-hidden>{ad}</span>}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            step={step}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={help || invalid ? `${id}-help` : undefined}
            className={cn("input num text-right", ad && prefix && "pl-7", ad && !prefix && (ad.length > 2 ? "pr-11" : "pr-7"), invalid && "border-neg")}
          />
          {ad && !prefix && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-ink-3" aria-hidden>{ad}</span>}
        </div>
      </div>
      {invalid ? (
        <p id={`${id}-help`} role="alert" className="text-2xs text-neg">Enter a number.</p>
      ) : help ? (
        <p id={`${id}-help`} className="text-2xs leading-4 text-ink-3">{help}</p>
      ) : null}
      {note}
    </div>
  );
}

/** The mandatory label on every scenario view. */
export function ScenarioBanner({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div role="note" className={cn("rounded border border-warn/50 bg-warn/5 px-3 py-2", className)}>
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-warn">{SCENARIO_DISCLAIMER}</div>
      {children && <p className="mt-0.5 text-xs text-ink-2">{children}</p>}
    </div>
  );
}

/** "Prefill from store" select. Reports what was available — and what was not. */
export function StorePrefillSelect({
  stores, value, onSelect, label = "Prefill from store",
}: {
  stores: StorePrefill[];
  value: string;
  onSelect: (p: StorePrefill | null) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-2">{label}</label>
      <select
        id={id}
        className="input w-auto min-w-[13rem]"
        value={value}
        onChange={(e) => onSelect(stores.find((s) => s.storeId === e.target.value) ?? null)}
        disabled={stores.length === 0}
      >
        <option value="">{stores.length ? "Choose a store…" : "No stores"}</option>
        {stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
      </select>
    </div>
  );
}

/** One sentence describing which recorded values were filled in and which are missing. */
export function prefillSummary(
  p: StorePrefill,
  fields: ("averageBasket" | "grossMarginPct" | "daysPerMonth" | "transactionsPerDay" | "transactionsPerMonth" | "closesAt")[],
  currency: string,
): { filled: string; missing: string[] } {
  const parts: string[] = [];
  const missing: string[] = [];
  const add = (ok: boolean, text: string, name: string) => (ok ? parts.push(text) : missing.push(name));
  for (const f of fields) {
    if (f === "averageBasket") add(p.averageBasket !== null, `average basket ${fmtMoney(p.averageBasket, currency, 2)}`, "average basket (needs transactions)");
    if (f === "grossMarginPct") add(p.grossMarginPct !== null, `gross margin ${fmtPct(p.grossMarginPct)}`, "gross margin");
    if (f === "daysPerMonth") add(p.daysPerMonth !== null, `${exprNum(p.daysPerMonth)} open days/month`, "open days");
    if (f === "transactionsPerDay") add(p.transactionsPerDay !== null, `${exprNum(p.transactionsPerDay)} transactions/day`, "transactions per day");
    if (f === "transactionsPerMonth") add(p.transactionsPerMonth !== null, `${exprNum(p.transactionsPerMonth)} transactions/month`, "transactions per month");
    if (f === "closesAt") add(p.closesAt !== null, `closes at ${p.closesAt}`, "closing time");
  }
  return { filled: parts.join(", "), missing };
}

export function PrefillNote({ prefill, fields, currency }: { prefill: StorePrefill | null; fields: Parameters<typeof prefillSummary>[1]; currency: string }) {
  if (!prefill) return null;
  if (fields.length === 0) return <p className="text-xs text-ink-3">This calculator has no inputs that can be taken from recorded store data.</p>;
  const { filled, missing } = prefillSummary(prefill, fields, currency);
  return (
    <p className="text-xs text-ink-2" role="status">
      {filled ? (
        <>
          <span className="font-medium text-ink">Recorded values from {prefill.storeName}</span> ({prefill.periodLabel}, {prefill.months} month{prefill.months === 1 ? "" : "s"} of data): <span className="num">{filled}</span>.{" "}
        </>
      ) : (
        <><span className="font-medium text-ink">{prefill.storeName}</span> has no usable recorded values for {prefill.periodLabel}. </>
      )}
      {missing.length > 0 && <span className="text-warn">Not recorded, left empty: {missing.join(", ")}.</span>}
    </p>
  );
}
