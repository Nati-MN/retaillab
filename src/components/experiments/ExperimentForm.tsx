"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, FormError, Notice, Panel, Tag } from "@/components/ui";
import { useFormAction } from "./useFormAction";
import { createExperiment } from "@/server/actions/experiments";
import { durationDays, endDateAfterWeeks, METRIC_UNITS, UNIT_LABELS, type MetricUnit } from "@/lib/experiments/model";

export interface ExperimentFormInitial {
  title: string;
  hypothesis: string;
  testStoreId: string;
  primary: { name: string; unit: MetricUnit };
  secondary: { name: string; unit: MetricUnit }[];
}

interface Row { key: number; name: string; unit: MetricUnit }

function UnitSelect({ id, name, value, onChange, currency }: { id: string; name: string; value: MetricUnit; onChange: (u: MetricUnit) => void; currency: string }) {
  return (
    <select id={id} name={name} className="input" value={value} onChange={(e) => onChange(e.target.value as MetricUnit)}>
      {METRIC_UNITS.map((u) => (
        <option key={u} value={u}>{u === "EUR" ? `${UNIT_LABELS[u]} (${currency})` : u === "pct" ? `${UNIT_LABELS[u]} (%)` : UNIT_LABELS[u]}</option>
      ))}
    </select>
  );
}

export function ExperimentForm({
  stores, initial, strategy, currency,
}: {
  stores: { id: string; name: string }[];
  initial: ExperimentFormInitial;
  strategy: { id: string; title: string } | null;
  currency: string;
}) {
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(createExperiment);
  const uid = useId();
  const [testStoreId, setTestStoreId] = useState(initial.testStoreId);
  const [controlStoreId, setControlStoreId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [primaryUnit, setPrimaryUnit] = useState<MetricUnit>(initial.primary.unit);
  const [rows, setRows] = useState<Row[]>(() => initial.secondary.map((m, i) => ({ key: i, ...m })));
  const [nextKey, setNextKey] = useState(initial.secondary.length);
  const sameStore = controlStoreId !== "" && controlStoreId === testStoreId;
  const days = durationDays(startDate || null, endDate || null);

  const setWeeks = (w: number) => {
    const end = endDateAfterWeeks(startDate, w);
    if (end) setEndDate(end);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" noValidate>
      {strategy && <input type="hidden" name="strategyId" value={strategy.id} />}
      <div className="space-y-4">
        <Panel title="What is being tested" kind="HYPOTHESIS">
          <div className="space-y-3">
            {strategy && (
              <Notice tone="info">
                Prefilled from the strategy <Link className="link" href="/strategies">{strategy.title}</Link>. Creating this experiment sets that strategy to “In test”.
              </Notice>
            )}
            <Field label="Title" htmlFor={`${uid}-title`} error={fe.title}>
              <input id={`${uid}-title`} name="title" className="input" defaultValue={initial.title} maxLength={120} required />
            </Field>
            <Field
              label="Hypothesis" htmlFor={`${uid}-hyp`} error={fe.hypothesis}
              hint="State what may happen and why — as a possibility, not an outcome. Example: “Moving bakery closer to the entrance may increase bakery sales.”"
            >
              <textarea id={`${uid}-hyp`} name="hypothesis" className="input" rows={3} defaultValue={initial.hypothesis} maxLength={1000} required />
            </Field>
          </div>
        </Panel>

        <Panel title="Stores and period">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Test store" htmlFor={`${uid}-test`} error={fe.testStoreId} hint="The store where the change is made.">
              <select id={`${uid}-test`} name="testStoreId" className="input" value={testStoreId} onChange={(e) => setTestStoreId(e.target.value)} required>
                <option value="">Select a store…</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field
              label="Control store" htmlFor={`${uid}-control`} optional
              error={sameStore ? "Control store must differ from the test store" : fe.controlStoreId}
              hint="A comparable store where nothing changes."
            >
              <select id={`${uid}-control`} name="controlStoreId" className="input" value={controlStoreId} onChange={(e) => setControlStoreId(e.target.value)} aria-invalid={sameStore || undefined}>
                <option value="">No control store</option>
                {stores.map((s) => <option key={s.id} value={s.id} disabled={s.id === testStoreId}>{s.name}</option>)}
              </select>
            </Field>
            {controlStoreId === "" && (
              <Notice tone="warn" title="No control store selected" className="sm:col-span-2">
                Without a control store, results cannot be separated from the test store’s own trend, seasonality or one-off events. Only the raw
                before/after change will be shown; control-adjusted figures cannot be calculated.
              </Notice>
            )}
            <Field label="Start date" htmlFor={`${uid}-start`} optional error={fe.startDate}>
              <input id={`${uid}-start`} name="startDate" type="date" className="input num" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field
              label="End date" htmlFor={`${uid}-end`} optional error={fe.endDate}
              hint={days !== null ? `${days} days (${(days / 7).toFixed(1).replace(/\.0$/, "")} weeks), both dates included` : undefined}
            >
              <input id={`${uid}-end`} name="endDate" type="date" className="input num" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
              <span className="text-xs text-ink-3">Set end date</span>
              {[4, 6, 8].map((w) => (
                <button key={w} type="button" className="btn-secondary btn-sm" disabled={!startDate} onClick={() => setWeeks(w)}>
                  {w} weeks from start
                </button>
              ))}
              {!startDate && <span className="text-xs text-ink-3">— choose a start date first</span>}
            </div>
            <Field label={`Planned cost (${currency})`} htmlFor={`${uid}-cost`} optional error={fe.cost} hint="One-off and running cost of the test itself.">
              <input id={`${uid}-cost`} name="cost" inputMode="decimal" className="input num" placeholder="e.g. 1800" />
            </Field>
          </div>
        </Panel>

        <Panel title="Metrics" subtitle="Decide before the test what will be measured">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Primary metric" htmlFor={`${uid}-pname`} error={fe.primaryName} hint="The one number the decision will rest on.">
                <input id={`${uid}-pname`} name="primaryName" className="input" defaultValue={initial.primary.name} maxLength={80} placeholder="e.g. Bakery revenue / month" required />
              </Field>
              <Field label="Unit" htmlFor={`${uid}-punit`} error={fe.primaryUnit}>
                <UnitSelect id={`${uid}-punit`} name="primaryUnit" value={primaryUnit} onChange={setPrimaryUnit} currency={currency} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-ink-2">Secondary metrics <span className="font-normal text-ink-3">optional — watch for side effects (waste, margin, basket)</span></legend>
              {rows.length === 0 && <p className="text-xs text-ink-3">None added.</p>}
              <ul className="space-y-1.5">
                {rows.map((r, i) => (
                  <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_130px_auto] gap-1.5 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                    <label className="sr-only" htmlFor={`${uid}-m${r.key}`}>Secondary metric {i + 1} name</label>
                    <input
                      id={`${uid}-m${r.key}`} name="metricName" className="input" maxLength={80} value={r.name} placeholder="Metric name"
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                    />
                    <label className="sr-only" htmlFor={`${uid}-u${r.key}`}>Secondary metric {i + 1} unit</label>
                    <UnitSelect
                      id={`${uid}-u${r.key}`} name="metricUnit" value={r.unit} currency={currency}
                      onChange={(u) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, unit: u } : x)))}
                    />
                    <button type="button" className="btn-ghost h-8 px-2" aria-label={`Remove metric ${r.name || i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button" className="btn-secondary btn-sm mt-2" disabled={rows.length >= 12}
                onClick={() => { setRows((rs) => [...rs, { key: nextKey, name: "", unit: "count" }]); setNextKey((k) => k + 1); }}
              >
                <Plus className="h-3 w-3" aria-hidden />Add metric
              </button>
            </fieldset>
            {strategy && <p className="text-xs text-ink-3">Metric names come from the strategy’s “metrics to watch”; units are a best guess from the name — check them.</p>}
          </div>
        </Panel>

        <Panel title="Notes">
          <Field label="Notes" htmlFor={`${uid}-notes`} optional error={fe.notes} hint="How “before” is measured, what exactly changes in the store, who is responsible.">
            <textarea id={`${uid}-notes`} name="notes" className="input" rows={3} maxLength={4000} />
          </Field>
        </Panel>

        <FormError message={error} />
        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary" disabled={pending || sameStore}>{pending ? "Creating…" : "Create experiment"}</button>
          <Link href="/experiments" className="btn-ghost">Cancel</Link>
        </div>
      </div>

      <aside className="space-y-3">
        <Panel title="What an experiment can and cannot show">
          <ul className="space-y-2 text-xs leading-5 text-ink-2">
            <li><Tag kind="HYPOTHESIS" className="mr-1.5" />The idea stays a hypothesis until values are measured — and remains a single observation afterwards.</li>
            <li><Tag kind="EXPERIMENT_RESULT" className="mr-1.5" />Results are before/after values you enter, compared with the control store’s change over the same period.</li>
            <li>With one test store and one control store, no significance test is possible. The app reports the arithmetic and its limits; it does not claim causation.</li>
            <li>Pick a control store with a similar format and trend, and keep everything else in both stores unchanged during the test.</li>
          </ul>
        </Panel>
      </aside>
    </form>
  );
}
