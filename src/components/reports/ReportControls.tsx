"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { FormError } from "@/components/ui";
import { useFormAction } from "@/components/experiments/useFormAction";
import { deleteReport } from "@/server/actions/reports";

export function PrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" aria-hidden />Print / Save as PDF
    </button>
  );
}

export function DeleteReportButton({ id, compact }: { id: string; compact?: boolean }) {
  const { onSubmit, pending, error } = useFormAction(deleteReport);
  const [confirming, setConfirming] = useState(false);
  return (
    <form onSubmit={onSubmit} className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      {!confirming ? (
        <button type="button" className={compact ? "btn-ghost btn-sm" : "btn-danger"} onClick={() => setConfirming(true)}>Delete{compact ? "" : " report"}…</button>
      ) : (
        <>
          <button type="submit" className={compact ? "btn-danger btn-sm" : "btn-danger"} disabled={pending}>{pending ? "Deleting…" : "Confirm delete"}</button>
          <button type="button" className={compact ? "btn-ghost btn-sm" : "btn-ghost"} onClick={() => setConfirming(false)}>Cancel</button>
        </>
      )}
      <FormError message={error} />
    </form>
  );
}
