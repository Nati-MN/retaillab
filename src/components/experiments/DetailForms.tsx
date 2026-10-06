"use client";

import { useId, useState } from "react";
import { Field, FormError, Notice } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DECISION_HINTS, DECISION_LABELS, EXPERIMENT_DECISIONS, STATUS_TRANSITIONS, transitionLabel,
  type ExperimentDecisionKey, type ExperimentMetricDTO, type ExperimentStatusKey,
} from "@/lib/experiments/model";
import {
  deleteExperiment, recordExperimentDecision, saveExperimentNotes, saveExperimentResults, setExperimentStatus,
} from "@/server/actions/experiments";
import { useFormAction } from "./useFormAction";

function Saved({ message }: { message: string | null }) {
  if (!message) return null;
  return <span role="status" className="text-xs text-pos">{message}</span>;
}

export function StatusActions({ id, status }: { id: string; status: ExperimentStatusKey }) {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(setExperimentStatus);
  const [stopping, setStopping] = useState(false);
  const uid = useId();
  const targets = STATUS_TRANSITIONS[status];
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-1.5">
        {targets.filter((t) => t !== "STOPPED").map((t, i) => (
          <button key={t} type="submit" name="to" value={t} disabled={pending} className={cn(i === 0 && t !== "PLANNED" ? "btn-primary" : "btn-secondary", "btn-sm")}>
            {transitionLabel(status, t)}
          </button>
        ))}
        {targets.includes("STOPPED") && !stopping && (
          <button type="button" className="btn-danger btn-sm" onClick={() => setStopping(true)}>{transitionLabel(status, "STOPPED")}…</button>
        )}
      </div>
      {stopping && targets.includes("STOPPED") && (
        <div className="space-y-2 rounded border border-line bg-surface-2 p-2.5">
          <Field label="Reason for stopping" htmlFor={`${uid}-reason`} error={fieldErrors.reason} hint="Required. Appended to the notes with today’s date.">
            <textarea id={`${uid}-reason`} name="reason" className="input" rows={2} maxLength={500} required />
          </Field>
          <div className="flex gap-1.5">
            <button type="submit" name="to" value="STOPPED" disabled={pending} className="btn-danger btn-sm">Stop experiment</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setStopping(false)}>Cancel</button>
          </div>
        </div>
      )}
      {(status === "COMPLETED" || status === "STOPPED") && (
        <p className="text-xs text-ink-3">Reopening withdraws the recorded decision.</p>
      )}
      <FormError message={error} />
    </form>
  );
}

const VALUE_COLS = [
  { key: "testBefore", label: "Test · before", control: false },
  { key: "testAfter", label: "Test · after", control: false },
  { key: "controlBefore", label: "Control · before", control: true },
  { key: "controlAfter", label: "Control · after", control: true },
] as const;

const UNIT_SUFFIX: Record<string, string> = { count: "count", pct: "%" };

export function ResultsForm({
  id, metrics, hasControl, currency, testStoreName, controlStoreName,
}: {
  id: string;
  metrics: ExperimentMetricDTO[];
  hasControl: boolean;
  currency: string;
  testStoreName: string;
  controlStoreName: string | null;
}) {
  const { onSubmit, pending, error, message, fieldErrors } = useFormAction(saveExperimentResults);
  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="scroll-thin overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr>
              <th>Metric</th>
              {VALUE_COLS.map((c) => (
                <th key={c.key} className="text-right">
                  {c.label}
                  <div className="font-sans text-[10px] normal-case tracking-normal text-ink-3">{c.control ? controlStoreName ?? "no control store" : testStoreName}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id}>
                <td className="align-middle">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-ink-3">{m.isPrimary ? "Primary · " : ""}{m.unit === "EUR" ? currency : UNIT_SUFFIX[m.unit] ?? m.unit}</div>
                </td>
                {VALUE_COLS.map((c) => {
                  const field = `${m.id}.${c.key}`;
                  const disabled = c.control && !hasControl;
                  const err = fieldErrors[field]?.[0];
                  return (
                    <td key={c.key} className="align-middle">
                      <input
                        name={field}
                        aria-label={`${m.name} — ${c.label}`}
                        aria-invalid={err ? true : undefined}
                        title={disabled ? "No control store in this experiment" : undefined}
                        inputMode="decimal"
                        className={cn("input num ml-auto w-28 text-right", err && "border-neg")}
                        defaultValue={disabled ? "" : m[c.key] ?? ""}
                        placeholder={disabled ? "n/a" : "—"}
                        disabled={disabled}
                      />
                      {err && <p role="alert" className="mt-0.5 text-right text-2xs text-neg">{err}</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save results"}</button>
        <Saved message={message} />
        <span className="text-xs text-ink-3">Leave a field empty when the value is not known. Empty is never treated as 0.</span>
      </div>
      {error && <div className="px-3 pb-3"><FormError message={error} /></div>}
    </form>
  );
}

export function NotesForm({ id, notes, readOnly }: { id: string; notes: string | null; readOnly: boolean }) {
  const { onSubmit, pending, error, message, fieldErrors } = useFormAction(saveExperimentNotes);
  const uid = useId();
  if (readOnly) {
    return notes ? <p className="whitespace-pre-wrap text-ink-2">{notes}</p> : <p className="text-xs text-ink-3">No notes recorded.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Notes" htmlFor={`${uid}-notes`} error={fieldErrors.notes} hint="How values were measured, what happened in the stores during the test.">
        {/* key: status changes append to the notes on the server */}
        <textarea key={notes ?? ""} id={`${uid}-notes`} name="notes" className="input" rows={5} maxLength={4000} defaultValue={notes ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-secondary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save notes"}</button>
        <Saved message={message} />
      </div>
      <FormError message={error} />
    </form>
  );
}

export function DecisionForm({
  id, decision, decisionNote, hasStrategy,
}: {
  id: string;
  decision: ExperimentDecisionKey | null;
  decisionNote: string | null;
  hasStrategy: boolean;
}) {
  const { onSubmit, pending, error, message, fieldErrors } = useFormAction(recordExperimentDecision);
  const [value, setValue] = useState<ExperimentDecisionKey | null>(decision);
  const uid = useId();
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-2">Decision</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
          {EXPERIMENT_DECISIONS.map((d) => (
            <label key={d} className={cn("flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2", value === d ? "border-ink bg-surface-2" : "border-line hover:bg-surface-2")}>
              <input type="radio" name="decision" value={d} checked={value === d} onChange={() => setValue(d)} className="mt-1 accent-[rgb(var(--ink))]" />
              <span className="min-w-0">
                <span className="block font-medium">{DECISION_LABELS[d]}</span>
                <span className="block text-xs leading-4 text-ink-3">{hasStrategy || (d !== "ADOPT" && d !== "REJECT") ? DECISION_HINTS[d] : d === "ADOPT" ? "Roll the change out. A decision, not proof of cause." : "Do not pursue."}</span>
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.decision && <p role="alert" className="mt-1 text-xs text-neg">{fieldErrors.decision[0]}</p>}
      </fieldset>
      <Field label="Decision note" htmlFor={`${uid}-dn`} optional error={fieldErrors.decisionNote} hint="Why this decision, and what it rests on.">
        <textarea id={`${uid}-dn`} name="decisionNote" className="input" rows={2} maxLength={1000} defaultValue={decisionNote ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending || value === null}>{pending ? "Saving…" : decision ? "Update decision" : "Record decision"}</button>
        <Saved message={message} />
      </div>
      <FormError message={error} />
    </form>
  );
}

export function DeleteExperimentButton({ id, title }: { id: string; title: string }) {
  const { onSubmit, pending, error } = useFormAction(deleteExperiment);
  const [confirming, setConfirming] = useState(false);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {!confirming ? (
        <button type="button" className="btn-danger btn-sm" onClick={() => setConfirming(true)}>Delete experiment…</button>
      ) : (
        <Notice tone="error" title={`Delete “${title}”?`}>
          <p>The experiment, its metrics and all entered results are removed permanently. A linked strategy keeps its current status.</p>
          <div className="mt-2 flex gap-1.5">
            <button type="submit" className="btn-danger btn-sm" disabled={pending}>{pending ? "Deleting…" : "Delete permanently"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </Notice>
      )}
      <FormError message={error} />
    </form>
  );
}
