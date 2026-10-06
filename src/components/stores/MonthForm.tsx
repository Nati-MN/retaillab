"use client";

import Link from "next/link";
import { Field, FormError } from "@/components/ui";
import { COST_LABELS, COST_TYPES, type CostTypeKey } from "@/lib/analytics/types";
import { useFormAction, type FormAction } from "./useFormAction";

export interface MonthFormInitial {
  month: string;
  revenue?: number | null;
  transactions?: number | null;
  customers?: number | null;
  grossMarginPct?: number | null;
  openDays?: number | null;
  costs?: Partial<Record<CostTypeKey, number>>;
  categories?: Record<string, { revenue: number; marginPct: number | null }>;
}

/**
 * One store-month: revenue (required), volumes, margin, the eight cost lines and
 * optional per-category revenue / margin. Saving replaces the stored month.
 */
export function MonthForm({
  action, storeId, initial, categories = [], currency, maxMonth, submitLabel = "Save month", cancelHref, resetOnSuccess, showOpenDays = true, editing,
}: {
  action: FormAction;
  storeId: string;
  initial: MonthFormInitial;
  categories?: { id: string; name: string }[];
  currency: string;
  maxMonth: string;
  submitLabel?: string;
  cancelHref?: string;
  resetOnSuccess?: boolean;
  showOpenDays?: boolean;
  editing?: boolean;
}) {
  const f = useFormAction(action, { resetOnSuccess });
  const e = f.fieldErrors;
  const sv = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const a = (n: string) => (e[n]?.length ? { "aria-invalid": true as const, "aria-describedby": `m-${n}-error` } : {});
  const catErrors = categories.flatMap((c) => [e[`cat_${c.id}_revenue`]?.[0], e[`cat_${c.id}_margin`]?.[0]].filter(Boolean).map((msg) => `${c.name}: ${msg}`));

  return (
    <form {...f.form} className="space-y-4">
      <input type="hidden" name="storeId" value={storeId} />
      <FormError message={f.error} />
      {f.message && <p role="status" className="rounded border border-pos/40 bg-pos/5 px-3 py-2 text-xs text-pos">{f.message}</p>}

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <legend className="label mb-2">Month</legend>
        <Field label="Month" htmlFor="m-month" error={e.month}>
          <input id="m-month" name="month" type="month" className="input num" defaultValue={initial.month} max={maxMonth} required readOnly={editing} {...a("month")} />
        </Field>
        <Field label={`Revenue (${currency})`} htmlFor="m-revenue" error={e.revenue}>
          <input id="m-revenue" name="revenue" className="input num" inputMode="decimal" defaultValue={sv(initial.revenue)} required {...a("revenue")} />
        </Field>
        <Field label="Transactions" htmlFor="m-transactions" error={e.transactions} optional>
          <input id="m-transactions" name="transactions" className="input num" inputMode="numeric" defaultValue={sv(initial.transactions)} {...a("transactions")} />
        </Field>
        <Field label="Customers" htmlFor="m-customers" error={e.customers} optional>
          <input id="m-customers" name="customers" className="input num" inputMode="numeric" defaultValue={sv(initial.customers)} {...a("customers")} />
        </Field>
        <Field label="Gross margin %" htmlFor="m-grossMarginPct" error={e.grossMarginPct} optional>
          <input id="m-grossMarginPct" name="grossMarginPct" className="input num" inputMode="decimal" defaultValue={sv(initial.grossMarginPct)} placeholder="e.g. 29.5" {...a("grossMarginPct")} />
        </Field>
        {showOpenDays && (
          <Field label="Open days" htmlFor="m-openDays" error={e.openDays} optional>
            <input id="m-openDays" name="openDays" className="input num" inputMode="numeric" defaultValue={sv(initial.openDays)} placeholder="0–31" {...a("openDays")} />
          </Field>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <legend className="label mb-2">Operating costs ({currency}) — optional</legend>
        {COST_TYPES.map((t) => (
          <Field key={t} label={COST_LABELS[t]} htmlFor={`m-cost_${t}`} error={e[`cost_${t}`]}>
            <input id={`m-cost_${t}`} name={`cost_${t}`} className="input num" inputMode="decimal" defaultValue={sv(initial.costs?.[t])} {...a(`cost_${t}`)} />
          </Field>
        ))}
        <p className="col-span-2 text-xs text-ink-3 sm:col-span-4 lg:col-span-8">
          Operating costs = sum of the lines entered. A line left empty is stored as not provided, not as 0.
        </p>
      </fieldset>

      {categories.length > 0 && (
        <fieldset>
          <legend className="label mb-2">Category revenue &amp; margin — optional</legend>
          {catErrors.length > 0 && <p role="alert" className="mb-2 text-xs text-neg">{catErrors.join(" · ")}</p>}
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            {categories.map((c) => {
              const init = initial.categories?.[c.id];
              return (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem] items-center gap-2">
                  <span className="truncate text-xs text-ink-2">{c.name}</span>
                  <input name={`cat_${c.id}_revenue`} aria-label={`${c.name} revenue`} className="input num" inputMode="decimal" placeholder="Revenue" defaultValue={sv(init?.revenue)} {...(e[`cat_${c.id}_revenue`] ? { "aria-invalid": true } : {})} />
                  <input name={`cat_${c.id}_margin`} aria-label={`${c.name} margin percent`} className="input num" inputMode="decimal" placeholder="Margin %" defaultValue={sv(init?.marginPct)} {...(e[`cat_${c.id}_margin`] ? { "aria-invalid": true } : {})} />
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={f.pending}>{f.pending ? "Saving…" : submitLabel}</button>
        {cancelHref && <Link href={cancelHref} className="btn-ghost" scroll={false}>Cancel</Link>}
      </div>
    </form>
  );
}
