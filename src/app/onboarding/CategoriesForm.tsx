"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { FormError } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useFormAction, type FormAction } from "@/components/stores/useFormAction";

export const SUGGESTED_CATEGORIES = ["Bakery", "Beverages", "Fruit & Vegetables", "Meat", "Dairy", "Frozen Food", "Household", "Snacks", "Ready-to-eat", "Other"] as const;

export function CategoriesForm({
  action, existing, stores, currency,
}: {
  action: FormAction;
  /** Categories already saved for the organization (empty on first visit → suggestions are pre-selected). */
  existing: string[];
  /** Stores that have at least one month of revenue, with that latest month. */
  stores: { id: string; name: string; latestMonth: string; latestLabel: string }[];
  currency: string;
}) {
  const f = useFormAction(action);
  const [selected, setSelected] = useState<string[]>(existing.length > 0 ? existing : [...SUGGESTED_CATEGORIES]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const store = stores.find((s) => s.id === storeId);
  const has = (n: string) => selected.some((s) => s.toLowerCase() === n.toLowerCase());
  const custom = selected.filter((s) => !SUGGESTED_CATEGORIES.some((x) => x.toLowerCase() === s.toLowerCase()));

  const toggle = (n: string) => setSelected((cur) => (cur.some((s) => s.toLowerCase() === n.toLowerCase()) ? cur.filter((s) => s.toLowerCase() !== n.toLowerCase()) : [...cur, n]));
  const add = () => {
    const n = draft.trim();
    if (!n) return;
    if (n.length > 60) return setDraftError("At most 60 characters");
    if (has(n)) return setDraftError(`“${n}” is already in the list`);
    setSelected((cur) => [...cur, n]);
    setDraft("");
    setDraftError(null);
  };
  const rowErrors = Object.entries(f.fieldErrors).filter(([k]) => k.startsWith("row_") || k === "storeId" || k === "category").flatMap(([, v]) => v);

  return (
    <form {...f.form} className="space-y-4">
      <FormError message={rowErrors.length ? rowErrors.join(" · ") : f.error} />

      <fieldset>
        <legend className="label mb-2">Suggested categories — click to include or exclude</legend>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_CATEGORIES.map((n) => (
            <button
              key={n} type="button" aria-pressed={has(n)} onClick={() => toggle(n)}
              className={cn("h-7 rounded border px-2.5 text-xs", has(n) ? "border-ink bg-ink font-medium text-surface" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}
            >
              {n}
            </button>
          ))}
        </div>
        {custom.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3">Your own:</span>
            {custom.map((n) => (
              <span key={n} className="inline-flex h-7 items-center gap-1 rounded border border-ink bg-ink pl-2.5 pr-1 text-xs font-medium text-surface">
                {n}
                <button type="button" onClick={() => toggle(n)} aria-label={`Remove ${n}`} className="grid h-5 w-5 place-items-center rounded-sm hover:bg-surface/20"><X className="h-3 w-3" aria-hidden /></button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex max-w-sm items-start gap-2">
          <div className="flex-1">
            <label htmlFor="new-category" className="sr-only">Add a category</label>
            <input
              id="new-category" className="input" placeholder="Add your own category" value={draft} maxLength={60}
              onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              {...(draftError ? { "aria-invalid": true, "aria-describedby": "new-category-error" } : {})}
            />
            {draftError && <p id="new-category-error" role="alert" className="mt-1 text-xs text-neg">{draftError}</p>}
          </div>
          <button type="button" className="btn-secondary" onClick={add}><Plus className="h-3.5 w-3.5" aria-hidden />Add</button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="label mb-2">Revenue and margin per category — optional</legend>
        {selected.length === 0 ? (
          <p className="rounded border border-dashed border-line-strong px-3 py-2 text-xs text-ink-3">No categories selected. You can finish without categories; assortment views will then show as unavailable.</p>
        ) : stores.length === 0 ? (
          <>
            {selected.map((n) => <input key={n} type="hidden" name="category" value={n} />)}
            <p className="rounded border border-dashed border-line-strong px-3 py-2 text-xs text-ink-2">
              No store has monthly revenue yet, so category figures have no month to belong to. The <span className="num">{selected.length}</span> selected categories will be saved; figures can be entered later on each store’s data page.
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <label htmlFor="cat-store">Figures are for</label>
              <select id="cat-store" name="storeId" className="input h-7 w-auto" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span>in <span className="num font-medium text-ink">{store?.latestLabel}</span>, its latest month with revenue.</span>
              <input type="hidden" name="month" value={store?.latestMonth ?? ""} />
            </div>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {selected.map((n, i) => (
                <div key={n} className="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem] items-center gap-2">
                  <input type="hidden" name="category" value={n} />
                  <span className="truncate text-xs text-ink-2">{n}</span>
                  <input name={`revenue_${i}`} aria-label={`${n} revenue in ${currency}`} className="input num" inputMode="decimal" placeholder={`Revenue`} />
                  <input name={`margin_${i}`} aria-label={`${n} margin percent`} className="input num" inputMode="decimal" placeholder="Margin %" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Leave empty what you do not know. Empty is stored as not provided — never as 0. Other stores and months can be filled in later.</p>
          </>
        )}
      </fieldset>

      <div className="flex items-center justify-end border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={f.pending}>{f.pending ? "Finishing…" : "Finish setup and open overview"}</button>
      </div>
    </form>
  );
}
