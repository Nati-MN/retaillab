"use client";

import { Field, FormError } from "@/components/ui";
import { useFormAction, type FormAction } from "./useFormAction";

export function EventForm({ action, storeId, maxDate }: { action: FormAction; storeId: string; maxDate?: string }) {
  const f = useFormAction(action, { resetOnSuccess: true });
  const e = f.fieldErrors;
  return (
    <form {...f.form} className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start">
      <input type="hidden" name="storeId" value={storeId} />
      <Field label="Date" htmlFor="ev-date" error={e.date}>
        <input id="ev-date" name="date" type="date" className="input num" max={maxDate} required {...f.invalid("date", "ev-date")} />
      </Field>
      <Field label="What happened" htmlFor="ev-title" error={e.title}>
        <input id="ev-title" name="title" className="input" maxLength={120} required placeholder="e.g. Road works on the access road" {...f.invalid("title", "ev-title")} />
      </Field>
      <Field label="Details" htmlFor="ev-description" error={e.description} optional>
        <input id="ev-description" name="description" className="input" maxLength={500} {...f.invalid("description", "ev-description")} />
      </Field>
      <div className="sm:pt-[21px]"><button type="submit" className="btn-secondary w-full" disabled={f.pending}>{f.pending ? "Saving…" : "Record event"}</button></div>
      {(f.error || f.message) && (
        <div className="sm:col-span-4">
          <FormError message={f.error} />
          {f.message && <p role="status" className="text-xs text-pos">{f.message}</p>}
        </div>
      )}
    </form>
  );
}
