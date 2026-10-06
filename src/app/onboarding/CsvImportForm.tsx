"use client";

import { FormError } from "@/components/ui";
import { useFormAction, type FormAction } from "@/components/stores/useFormAction";

export function CsvImportForm({ action, storeId, storeName }: { action: FormAction; storeId: string; storeName: string }) {
  const f = useFormAction(action, { resetOnSuccess: true });
  const lines = f.fieldErrors.csv ?? [];
  return (
    <form {...f.form} className="space-y-2">
      <input type="hidden" name="storeId" value={storeId} />
      <label htmlFor="csv" className="text-xs font-medium text-ink-2">Paste historical months for {storeName}</label>
      <textarea
        id="csv" name="csv" rows={6} spellCheck={false} className="input num font-mono text-xs"
        placeholder={"2026-07;412500;21400;19800;29.4\n2026-08;398000;20900;19300;29.1\n2026-09;405000"}
        {...(lines.length ? { "aria-invalid": true, "aria-describedby": "csv-error" } : {})}
      />
      <p className="text-xs text-ink-3">
        One month per line: <code className="font-mono text-ink-2">YYYY-MM;revenue;transactions;customers;margin</code>. Only month and revenue are required; leave a field empty to mark it as not provided.
        Decimal point or comma, no thousands separators. If any line is wrong, nothing is imported.
      </p>
      {lines.length > 0 ? (
        <div id="csv-error" role="alert" className="rounded border border-neg/40 bg-neg/5 px-3 py-2 text-xs text-neg">
          <div className="font-semibold">Nothing was imported — {lines.length} problem{lines.length === 1 ? "" : "s"}:</div>
          <ul className="num mt-1 list-disc space-y-0.5 pl-4">
            {lines.slice(0, 20).map((l) => <li key={l}>{l}</li>)}
            {lines.length > 20 && <li>… and {lines.length - 20} more</li>}
          </ul>
        </div>
      ) : (
        <FormError message={f.error} />
      )}
      {f.message && <p role="status" className="rounded border border-pos/40 bg-pos/5 px-3 py-2 text-xs text-pos">{f.message}</p>}
      <button type="submit" className="btn-secondary" disabled={f.pending}>{f.pending ? "Checking…" : "Validate and import"}</button>
    </form>
  );
}
