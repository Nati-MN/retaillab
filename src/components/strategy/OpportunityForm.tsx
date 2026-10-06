"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/ui";
import { saveOpportunity } from "@/server/actions/strategies";
import { LEVEL_LABELS, OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABELS } from "./labels";
import type { OpportunityDTO } from "./loaders";

const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export function OpportunityForm({ stores, opportunity, currency }: { stores: { id: string; name: string }[]; opportunity: OpportunityDTO | null; currency: string }) {
  const [state, formAction, pending] = useActionState(saveOpportunity, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const o = opportunity;
  return (
    <form action={formAction} className="space-y-3">
      {o && <input type="hidden" name="id" value={o.id} />}
      <FormError message={state && !state.ok ? state.error : null} />
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Title" htmlFor="opp-title" error={fe?.title}>
          <input id="opp-title" name="title" className="input" maxLength={140} required defaultValue={o?.title} />
        </Field>
        <Field label="Store" htmlFor="opp-store" error={fe?.storeId}>
          <select id="opp-store" name="storeId" className="input" required defaultValue={o?.storeId ?? ""}>
            <option value="" disabled>Choose a store…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="opp-status" error={fe?.status}>
          <select id="opp-status" name="status" className="input" defaultValue={o?.status ?? "NEW"}>
            {OPPORTUNITY_STATUSES.map((s) => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Observation" htmlFor="opp-observation" hint="What the data shows. Numbers and periods, no interpretation." error={fe?.observation}>
          <textarea id="opp-observation" name="observation" className="input" rows={3} maxLength={1500} required defaultValue={o?.observation} />
        </Field>
        <Field label="Hypothesis" htmlFor="opp-hypothesis" hint="A possibility to test — “could potentially…”, not an outcome." error={fe?.hypothesis}>
          <textarea id="opp-hypothesis" name="hypothesis" className="input" rows={3} maxLength={1000} required defaultValue={o?.hypothesis} />
        </Field>
        <Field label="Potential impact scenario" htmlFor="opp-impact" hint="Describe the scenario including the assumptions it rests on. Not a forecast." error={fe?.impactScenario}>
          <textarea id="opp-impact" name="impactScenario" className="input" rows={3} maxLength={1500} required defaultValue={o?.impactScenario} />
        </Field>
        <Field label="Suggested experiment" htmlFor="opp-experiment" hint="How this could be tested: what changes, for how long, compared with what." error={fe?.suggestedExperiment}>
          <textarea id="opp-experiment" name="suggestedExperiment" className="input" rows={3} maxLength={1500} required defaultValue={o?.suggestedExperiment} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 md:max-w-2xl">
        <Field label={`Estimated cost (${currency})`} htmlFor="opp-cost" optional hint="Your estimate. Leave empty if unknown." error={fe?.estimatedCost}>
          <input id="opp-cost" name="estimatedCost" className="input num" inputMode="decimal" defaultValue={o?.estimatedCost ?? ""} />
        </Field>
        <Field label="Effort" htmlFor="opp-effort" error={fe?.effort}>
          <select id="opp-effort" name="effort" className="input" defaultValue={o?.effort ?? "MEDIUM"}>
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
        </Field>
        <Field label="Data confidence" htmlFor="opp-confidence" hint="Completeness of the data — not likelihood." error={fe?.dataConfidence}>
          <select id="opp-confidence" name="dataConfidence" className="input" defaultValue={o?.dataConfidence ?? "LOW"}>
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : o ? "Save changes" : "Create opportunity"}</button>
        <Link href="/strategies?tab=board" className="btn-ghost" scroll={false}>Cancel</Link>
      </div>
    </form>
  );
}
