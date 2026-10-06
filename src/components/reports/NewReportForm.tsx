"use client";

import { useId, useState } from "react";
import { Field, FormError } from "@/components/ui";
import { useFormAction } from "@/components/experiments/useFormAction";
import { isMonthKey } from "@/lib/period";
import { defaultReportTitle, REPORT_SECTIONS } from "@/lib/reports/sections";
import { createReport } from "@/server/actions/reports";

export function NewReportForm({ earliest, latest, stores }: { earliest: string; latest: string; stores: { id: string; name: string }[] }) {
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(createReport);
  const uid = useId();
  const [from, setFrom] = useState(latest);
  const [to, setTo] = useState(latest);
  const [title, setTitle] = useState(defaultReportTitle(latest));
  const [titleEdited, setTitleEdited] = useState(false);
  const [scope, setScope] = useState<"all" | "selection">("all");

  const changeTo = (v: string) => {
    setTo(v);
    if (!titleEdited && isMonthKey(v)) setTitle(defaultReportTitle(v));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor={`${uid}-title`} error={fe.title}>
        <input id={`${uid}-title`} name="title" className="input" maxLength={160} value={title} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From month" htmlFor={`${uid}-from`} error={fe.from}>
          <input id={`${uid}-from`} name="from" type="month" className="input num" min={earliest} max={latest} value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To month" htmlFor={`${uid}-to`} error={fe.to}>
          <input id={`${uid}-to`} name="to" type="month" className="input num" min={from || earliest} max={latest} value={to} onChange={(e) => changeTo(e.target.value)} required />
        </Field>
        <p className="num col-span-2 -mt-1 text-xs text-ink-3">Data is available from {earliest} to {latest}.</p>
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-2">Stores</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5"><input type="radio" name="storeScope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />All stores <span className="num text-ink-3">({stores.length})</span></label>
          <label className="flex items-center gap-1.5"><input type="radio" name="storeScope" value="selection" checked={scope === "selection"} onChange={() => setScope("selection")} />Selected stores</label>
        </div>
        {scope === "selection" && (
          <div className="mt-2 grid gap-x-4 gap-y-1 rounded border border-line p-2.5 sm:grid-cols-2">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="storeIds" value={s.id} />{s.name}</label>
            ))}
          </div>
        )}
        {fe.storeIds && <p role="alert" className="mt-1 text-xs text-neg">{fe.storeIds[0]}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-ink-2">Sections <span className="font-normal text-ink-3">in document order</span></legend>
        <ol className="divide-y divide-line rounded border border-line">
          {REPORT_SECTIONS.map((s, i) => (
            <li key={s.key}>
              <label className="flex cursor-pointer items-start gap-2 px-2.5 py-1.5 hover:bg-surface-2">
                <input type="checkbox" name="sections" value={s.key} defaultChecked={s.default} className="mt-1" />
                <span className="num mt-px w-4 shrink-0 font-mono text-2xs text-ink-3">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-xs leading-4 text-ink-3">{s.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ol>
        {fe.sections && <p role="alert" className="mt-1 text-xs text-neg">{fe.sections[0]}</p>}
      </fieldset>

      <FormError message={error} />
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create report"}</button>
      <p className="text-xs text-ink-3">A report stores this configuration only. Its content is rendered from the recorded data each time it is opened.</p>
    </form>
  );
}
