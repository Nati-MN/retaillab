"use client";

import { useState } from "react";
import { useFormAction, type FormAction } from "./useFormAction";

/** Small destructive action with an inline confirm step. `fields` are sent as hidden inputs. */
export function ConfirmSubmit({
  action, fields, label, confirmLabel = "Confirm", subject,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  confirmLabel?: string;
  /** What is affected, for the accessible name: "September 2026". */
  subject: string;
}) {
  const [armed, setArmed] = useState(false);
  const f = useFormAction(action);
  if (!armed) {
    return <button type="button" className="btn-ghost btn-sm text-neg" aria-label={`${label} ${subject}`} onClick={() => setArmed(true)}>{label}</button>;
  }
  return (
    <form {...f.form} className="inline-flex items-center gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className="btn-danger btn-sm" disabled={f.pending} aria-label={`${confirmLabel}: ${label.toLowerCase()} ${subject}`}>{f.pending ? "…" : confirmLabel}</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)}>Cancel</button>
      {f.error && <span role="alert" className="text-xs text-neg">{f.error}</span>}
    </form>
  );
}
