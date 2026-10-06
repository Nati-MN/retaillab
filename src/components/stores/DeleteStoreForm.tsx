"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/ui";
import { useFormAction, type FormAction } from "./useFormAction";

/** Two-step delete: reveal, then type the store code. Owner only (enforced on the server). */
export function DeleteStoreForm({ action, storeId, storeName, storeCode }: { action: FormAction; storeId: string; storeName: string; storeCode: string }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(action);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-ink-2">
          Deleting <strong className="font-semibold text-ink">{storeName}</strong> permanently removes its monthly data, costs, category figures, research, hypotheses and experiments. This cannot be undone.
        </p>
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>Delete store…</button>
      </div>
    );
  }
  return (
    <form {...f.form} className="space-y-3">
      <input type="hidden" name="storeId" value={storeId} />
      <FormError message={f.error} />
      <Field label={`Type the store code ${storeCode} to confirm`} htmlFor="delete-confirm" error={f.fieldErrors.confirm} className="max-w-xs">
        <input id="delete-confirm" name="confirm" className="input font-mono uppercase" autoComplete="off" autoFocus {...(f.fieldErrors.confirm ? { "aria-invalid": true, "aria-describedby": "delete-confirm-error" } : {})} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn-danger" disabled={f.pending}>{f.pending ? "Deleting…" : `Permanently delete ${storeName}`}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
