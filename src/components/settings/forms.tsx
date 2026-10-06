"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Field, FormError } from "@/components/ui/Form";
import { Notice } from "@/components/ui/States";
import { filterForAI, type AIPrivacySettings } from "@/lib/ai/privacy";
import { ROLE_LABELS, ROLES, type RoleKey } from "@/lib/settings/permissions";
import type { ActionState } from "@/server/action";
import {
  addCategoryAction, addMemberAction, changeMemberRoleAction, deleteOrganizationAction, removeCategoryAction, removeMemberAction,
  renameCategoryAction, resetDemoAction, updateOrganizationAction, updatePrivacyAction,
} from "@/server/actions/settings";

function Saved({ state }: { state: ActionState }) {
  if (!state?.ok || !state.message) return null;
  return <p role="status" className="inline-flex items-center gap-1 text-xs text-pos"><Check className="h-3.5 w-3.5" aria-hidden />{state.message}</p>;
}

const errorOf = (s: ActionState) => (s && !s.ok ? s.error : null);
const fieldErrors = (s: ActionState) => (s && !s.ok ? s.fieldErrors : undefined);

// ── Organization ─────────────────────────────────────────────────────────────

export function OrganizationForm({ org, canEdit }: { org: { name: string; industry: string; country: string; currency: string }; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateOrganizationAction, null);
  const fe = fieldErrors(state);
  return (
    <form action={action} className="space-y-3">
      <FormError message={errorOf(state)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Organization name" htmlFor="org-name" error={fe?.name}>
          <input id="org-name" name="name" className="input" defaultValue={org.name} maxLength={100} required disabled={!canEdit} />
        </Field>
        <Field label="Industry" htmlFor="org-industry" error={fe?.industry}>
          <input id="org-industry" name="industry" className="input" defaultValue={org.industry} maxLength={80} required disabled={!canEdit} />
        </Field>
        <Field label="Country" htmlFor="org-country" error={fe?.country}>
          <input id="org-country" name="country" className="input" defaultValue={org.country} maxLength={80} required disabled={!canEdit} />
        </Field>
        <Field label="Currency" htmlFor="org-currency" error={fe?.currency} hint="Used to label every monetary figure. Changing it does not convert stored amounts.">
          <select id="org-currency" name="currency" className="input" defaultValue={org.currency} disabled={!canEdit}>
            {["EUR", "CHF", "USD", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save organization"}</button>
          <Saved state={state} />
        </div>
      ) : (
        <p className="text-xs text-ink-3">Only an owner can change these settings.</p>
      )}
    </form>
  );
}

// ── Privacy & AI ─────────────────────────────────────────────────────────────

type PrivacyState = AIPrivacySettings & { aiExplanations: boolean };

const TOGGLES: { key: keyof PrivacyState; label: string; hint: string }[] = [
  { key: "aiIncludeFinancials", label: "Include financial figures in AI context", hint: "Revenue, baskets, costs, margins and profit. Off: an AI provider would see “[withheld]” in their place and could only talk about counts and directions." },
  { key: "aiIncludeStoreNames", label: "Include store names in AI context", hint: "Off: store names are replaced by store codes and cities are withheld." },
  { key: "aiIncludeResearch", label: "Include public research in AI context", hint: "Stored competitors, location signals, findings and their sources. Off: they are dropped entirely." },
  { key: "aiExplanations", label: "Show written explanations", hint: "Prose explanations next to calculated results, for example on the forecast tab. Off: only the figures and formulas are shown. These explanations are rule-based templates, not model output." },
];

function Json({ value, highlight }: { value: unknown; highlight?: boolean }) {
  const textValue = JSON.stringify(value, null, 2);
  if (!highlight) return <pre className="num scroll-thin max-h-[420px] overflow-auto p-3 font-mono text-2xs leading-4 text-ink-2">{textValue}</pre>;
  const parts = textValue.split(/("\[withheld[^"]*\]")/g);
  return (
    <pre className="num scroll-thin max-h-[420px] overflow-auto p-3 font-mono text-2xs leading-4 text-ink-2">
      {parts.map((p, i) => (p.startsWith('"[withheld') ? <mark key={i} className="rounded-sm bg-warn/15 px-0.5 text-warn">{p}</mark> : <span key={i}>{p}</span>))}
    </pre>
  );
}

export function PrivacyForm({
  initial, canEdit, sample, sampleLabel, stores,
}: {
  initial: PrivacyState;
  canEdit: boolean;
  /** A real tool result of this organization, or null when there is no data to show. */
  sample: unknown | null;
  sampleLabel: string;
  stores: { name: string; code: string }[];
}) {
  const [state, action, pending] = useActionState(updatePrivacyAction, null);
  const [values, setValues] = useState<PrivacyState>(initial);
  useEffect(() => setValues(initial), [initial]);
  const dirty = TOGGLES.some((t) => values[t.key] !== initial[t.key]);
  const filtered = useMemo(() => (sample ? filterForAI(sample, values, stores) : null), [sample, values, stores]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form action={action} className="space-y-3">
        <FormError message={errorOf(state)} />
        <fieldset disabled={!canEdit} className="divide-y divide-line rounded border border-line">
          <legend className="sr-only">AI context settings</legend>
          {TOGGLES.map((t, i) => (
            <label key={t.key} htmlFor={`pv-${t.key}`} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
              <input
                id={`pv-${t.key}`} name={t.key} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--ink))]"
                checked={values[t.key]} onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.checked }))}
                aria-describedby={`pv-${t.key}-hint`}
              />
              <span className="min-w-0">
                <span className="block font-medium">{t.label}{i === 3 && <span className="ml-2 font-normal text-ink-3">display setting</span>}</span>
                <span id={`pv-${t.key}-hint`} className="block text-xs leading-5 text-ink-2">{t.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save privacy settings"}</button>
            {dirty ? <span className="text-xs text-warn">Unsaved changes — the preview shows them already.</span> : <Saved state={state} />}
          </div>
        ) : (
          <p className="text-xs text-ink-3">Only an owner can change these settings.</p>
        )}
      </form>

      <section aria-labelledby="pv-preview" className="min-w-0 rounded border border-line">
        <header className="border-b border-line px-3 py-2">
          <h3 id="pv-preview" className="text-[13px] font-semibold">What an AI provider would receive</h3>
          <p className="text-xs text-ink-3">{sampleLabel} Nothing is sent: no provider is connected. The right side changes as you toggle.</p>
        </header>
        {sample && filtered ? (
          <>
            <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="min-w-0">
                <div className="label border-b border-line px-3 py-1.5">Tool output on the server</div>
                <Json value={sample} />
              </div>
              <div className="min-w-0">
                <div className="label border-b border-line px-3 py-1.5">After the privacy filter</div>
                <Json value={filtered.value} highlight />
              </div>
            </div>
            <p className="num border-t border-line px-3 py-2 text-xs text-ink-2">
              Withheld: {filtered.report.financialFieldsWithheld} financial field(s), {filtered.report.amountsInTextWithheld} amount(s) in text ·
              {" "}{filtered.report.storeNamesReplaced} store name(s) replaced by codes · research {filtered.report.researchDropped ? "dropped" : "included"}
            </p>
          </>
        ) : (
          <div className="p-3"><Notice tone="unavailable">No store data yet, so there is no sample to show. Add a store and a month of data to see the preview.</Notice></div>
        )}
      </section>
    </div>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────

export function RoleForm({ membershipId, role, memberName, disabledReason }: { membershipId: string; role: RoleKey; memberName: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(changeMemberRoleAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label className="sr-only" htmlFor={`role-${membershipId}`}>Role of {memberName}</label>
      <select
        id={`role-${membershipId}`} name="role" className="input h-7 w-28 text-xs" defaultValue={role} key={role}
        disabled={pending || !!disabledReason} title={disabledReason}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      {errorOf(state) && <span role="alert" className="text-xs text-neg">{errorOf(state)}</span>}
      {state?.ok && state.message && <span role="status" className="text-xs text-pos">{state.message}</span>}
    </form>
  );
}

export function RemoveMemberForm({ membershipId, memberName, disabledReason }: { membershipId: string; memberName: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(removeMemberAction, null);
  const [confirm, setConfirm] = useState(false);
  if (disabledReason) return <span className="text-2xs text-ink-3">{disabledReason}</span>;
  return (
    <form action={action} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="membershipId" value={membershipId} />
      {confirm ? (
        <>
          <span className="text-xs text-ink-2">Remove {memberName}?</span>
          <button type="submit" className="btn-danger btn-sm" disabled={pending}>{pending ? "Removing…" : "Remove"}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(true)} aria-label={`Remove ${memberName}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove</button>
      )}
      {errorOf(state) && <span role="alert" className="text-xs text-neg">{errorOf(state)}</span>}
    </form>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMemberAction, null);
  const fe = fieldErrors(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <FormError message={errorOf(state)} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
        <Field label="Email of an existing account" htmlFor="member-email" error={fe?.email}>
          <input id="member-email" name="email" type="email" className="input" required maxLength={254} autoComplete="off" placeholder="name@company.example" />
        </Field>
        <Field label="Role" htmlFor="member-role" error={fe?.role}>
          <select id="member-role" name="role" className="input" defaultValue="VIEWER">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <div className="sm:pt-5"><button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Adding…" : "Add member"}</button></div>
      </div>
      <Saved state={state} />
    </form>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

export function AddCategoryForm() {
  const [state, action, pending] = useActionState(addCategoryAction, null);
  const fe = fieldErrors(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="cat-new" className="sr-only">New category name</label>
        <input id="cat-new" name="name" className="input" maxLength={60} required placeholder="New category, e.g. Frozen" aria-describedby="cat-new-msg" />
        <div id="cat-new-msg" className="mt-1 min-h-4 text-xs">
          {(fe?.name?.[0] ?? errorOf(state)) && <span role="alert" className="text-neg">{fe?.name?.[0] ?? errorOf(state)}</span>}
          <Saved state={state} />
        </div>
      </div>
      <button type="submit" className="btn-secondary" disabled={pending}>{pending ? "Adding…" : "Add category"}</button>
    </form>
  );
}

export function CategoryRow({ id, name, dataRows, canEdit }: { id: string; name: string; dataRows: number; canEdit: boolean }) {
  const [renameState, renameAction, renaming] = useActionState(renameCategoryAction, null);
  const [removeState, removeAction, removing] = useActionState(removeCategoryAction, null);
  const [mode, setMode] = useState<"view" | "rename" | "remove">("view");
  useEffect(() => {
    if (renameState?.ok) setMode("view");
  }, [renameState]);
  const error = errorOf(renameState) ?? errorOf(removeState);
  return (
    <tr>
      <td>
        {mode === "rename" ? (
          <form action={renameAction} className="flex items-center gap-1.5">
            <input type="hidden" name="categoryId" value={id} />
            <label htmlFor={`cat-${id}`} className="sr-only">New name for {name}</label>
            <input id={`cat-${id}`} name="name" className="input h-7 max-w-xs" defaultValue={name} maxLength={60} required autoFocus />
            <button type="submit" className="btn-primary btn-sm" disabled={renaming}>{renaming ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-ghost btn-sm px-1.5" onClick={() => setMode("view")} aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></button>
          </form>
        ) : (
          <span className="font-medium">{name}</span>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-neg">{error}</p>}
      </td>
      <td className="r">{dataRows === 0 ? <span className="text-ink-3">none</span> : dataRows.toLocaleString("en-US")}</td>
      <td className="text-right">
        {!canEdit ? null : mode === "remove" ? (
          <form action={removeAction} className="flex flex-wrap items-center justify-end gap-1.5">
            <input type="hidden" name="categoryId" value={id} />
            <input type="hidden" name="confirm" value="yes" />
            <span className="num text-xs text-ink-2">
              {dataRows > 0 ? `Deletes ${dataRows.toLocaleString("en-US")} monthly data row(s) of “${name}”. This cannot be undone.` : `Remove “${name}”?`}
            </span>
            <button type="submit" className="btn-danger btn-sm" disabled={removing}>{removing ? "Removing…" : dataRows > 0 ? "Delete category and data" : "Remove"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("view")}>Cancel</button>
          </form>
        ) : mode === "view" ? (
          <div className="flex justify-end gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("rename")} aria-label={`Rename ${name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /> Rename</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("remove")} aria-label={`Remove ${name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove</button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

// ── Danger zone ──────────────────────────────────────────────────────────────

export function DemoResetForm() {
  const [state, action, pending] = useActionState(resetDemoAction, null);
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="space-y-2">
      <FormError message={errorOf(state)} />
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-2">This deletes everything in the demo organization, including changes made by anyone exploring the demo, and recreates the original fictional dataset.</span>
          <button type="submit" className="btn-danger" disabled={pending}>{pending ? "Resetting… this takes a few seconds" : "Reset demo data now"}</button>
          {!pending && <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>}
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setConfirm(true)}>Reset demo data…</button>
      )}
    </form>
  );
}

export function DeleteOrganizationForm({ organizationName }: { organizationName: string }) {
  const [state, action, pending] = useActionState(deleteOrganizationAction, null);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === organizationName.trim();
  return (
    <form action={action} className="space-y-3">
      <FormError message={errorOf(state)} />
      <Field label={`Type “${organizationName}” to confirm`} htmlFor="confirm-name" hint="Deletes all stores, monthly data, research, strategies, experiments and reports of this organization. This cannot be undone.">
        <input id="confirm-name" name="confirmName" className="input max-w-sm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <button type="submit" className="btn-danger" disabled={pending || !matches}>{pending ? "Deleting…" : "Delete organization permanently"}</button>
    </form>
  );
}
