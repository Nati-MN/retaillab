"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CATEGORY_LABELS, STRATEGY_CATEGORIES, type LibraryEntry } from "@/lib/strategy/library";
import { Field, FormError, Notice, Tag } from "@/components/ui";
import { createUserStrategy } from "@/server/actions/strategies";
import { LEVEL_LABELS } from "./labels";

const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export function HypothesisForm({ stores, library, currency, defaultStoreId }: {
  stores: { id: string; name: string }[];
  library: LibraryEntry | null;
  currency: string;
  defaultStoreId?: string;
}) {
  const [state, formAction, pending] = useActionState(createUserStrategy, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-4">
      {library && <input type="hidden" name="libraryKey" value={library.key} />}
      <FormError message={state && !state.ok ? state.error : null} />
      {library && (
        <Notice tone="info" title={`Starting from the library entry “${library.title}”`}>
          Hypothesis, test, risks and metrics are prefilled with generic wording. Adapt them to this store — and write the observation from your own data; the library cannot know it.
        </Notice>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Store" htmlFor="h-store" error={fe?.storeId}>
          <select id="h-store" name="storeId" className="input" required defaultValue={defaultStoreId ?? ""}>
            <option value="" disabled>Choose a store…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="h-title" error={fe?.title}>
          <input id="h-title" name="title" className="input" maxLength={140} required defaultValue={library?.title} />
        </Field>
        <Field label="Category" htmlFor="h-category" error={fe?.category}>
          <select id="h-category" name="category" className="input" defaultValue={library?.category ?? "ASSORTMENT"}>
            {STRATEGY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Observation" htmlFor="h-observation" hint="What you see in the data: numbers, periods, comparisons. No interpretation yet." error={fe?.observation}>
          <textarea id="h-observation" name="observation" className="input" rows={4} maxLength={1500} required />
        </Field>
        <Field label="Hypothesis" htmlFor="h-hypothesis" hint="A possibility, e.g. “… could potentially …”. It is stored as a hypothesis, not as a finding." error={fe?.hypothesis}>
          <textarea id="h-hypothesis" name="hypothesis" className="input" rows={4} maxLength={1000} required defaultValue={library?.hypothesisTemplate} />
        </Field>
        <Field label="Why it may matter" htmlFor="h-why" error={fe?.whyItMayMatter}>
          <textarea id="h-why" name="whyItMayMatter" className="input" rows={4} maxLength={1500} required defaultValue={library?.whyTested} />
        </Field>
        <Field label="Proposed test" htmlFor="h-test" hint="What changes, for how long, compared with what." error={fe?.proposedTest}>
          <textarea id="h-test" name="proposedTest" className="input" rows={4} maxLength={1500} required defaultValue={library?.testTemplate} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Assumptions" htmlFor="h-assumptions" optional hint="One per line." error={fe?.assumptions}>
          <textarea id="h-assumptions" name="assumptions" className="input" rows={5} />
        </Field>
        <Field label="Risks" htmlFor="h-risks" optional hint="One per line." error={fe?.risks}>
          <textarea id="h-risks" name="risks" className="input" rows={5} defaultValue={library?.risks.join("\n")} />
        </Field>
        <Field label="Metrics to watch" htmlFor="h-metrics" optional hint="One per line." error={fe?.metricsToWatch}>
          <textarea id="h-metrics" name="metricsToWatch" className="input" rows={5} defaultValue={library?.metrics.join("\n")} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
        <Field label={`Cost assumption (${currency})`} htmlFor="h-cost" optional hint="Your assumed cost of the test. Leave empty if unknown." error={fe?.costAssumption}>
          <input id="h-cost" name="costAssumption" className="input num" inputMode="decimal" />
        </Field>
        <Field label="Data confidence" htmlFor="h-confidence" hint="How complete is the data behind the observation?" error={fe?.dataConfidence}>
          <select id="h-confidence" name="dataConfidence" className="input" defaultValue="LOW">
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
        </Field>
        <Field label="Confidence note" htmlFor="h-note" hint="Which data the observation rests on (months, stores, sources). Confidence describes data completeness, not likelihood." error={fe?.confidenceNote}>
          <input id="h-note" name="confidenceNote" className="input" maxLength={600} required />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save hypothesis"}</button>
        <Link href="/strategies" className="btn-ghost">Cancel</Link>
        <span className="flex items-center gap-1.5 text-xs text-ink-3">Saved with origin “User” and status <Tag kind="HYPOTHESIS">Hypothesis — not validated</Tag></span>
      </div>
    </form>
  );
}
