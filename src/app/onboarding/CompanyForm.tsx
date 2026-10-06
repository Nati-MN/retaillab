"use client";

import { Field, FormError } from "@/components/ui";
import { useFormAction, type FormAction } from "@/components/stores/useFormAction";

const CURRENCIES = ["EUR", "CHF", "USD", "GBP"] as const;

export function CompanyForm({ action, initial }: { action: FormAction; initial?: { name: string; industry: string; country: string; currency: string } }) {
  const f = useFormAction(action);
  const e = f.fieldErrors;
  return (
    <form {...f.form} className="space-y-3">
      <FormError message={f.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" htmlFor="name" error={e.name} className="sm:col-span-2">
          <input id="name" name="name" className="input" defaultValue={initial?.name} placeholder="Demo Markt GmbH" maxLength={100} required autoFocus {...f.invalid("name")} />
        </Field>
        <Field label="Industry" htmlFor="industry" error={e.industry}>
          <input id="industry" name="industry" className="input" defaultValue={initial?.industry} placeholder="Grocery Retail" maxLength={80} required {...f.invalid("industry")} />
        </Field>
        <Field label="Country" htmlFor="country" error={e.country}>
          <input id="country" name="country" className="input" defaultValue={initial?.country} placeholder="Austria" maxLength={80} required autoComplete="country-name" {...f.invalid("country")} />
        </Field>
        <Field label="Currency" htmlFor="currency" error={e.currency} hint="All amounts are entered and shown in this currency. No conversion takes place.">
          <select id="currency" name="currency" className="input" defaultValue={initial?.currency ?? "EUR"} {...f.invalid("currency")}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-end border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={f.pending}>{f.pending ? "Saving…" : "Save and continue"}</button>
      </div>
    </form>
  );
}
