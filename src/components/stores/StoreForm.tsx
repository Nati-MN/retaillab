"use client";

import Link from "next/link";
import { Field, FormError } from "@/components/ui";
import { STORE_TYPE_LABELS, type StoreDTO } from "@/lib/analytics/types";
import { useFormAction, type FormAction } from "./useFormAction";

/**
 * All Store fields. Used for /stores/new, /stores/[id]/edit and onboarding step 2.
 * Validation happens on the server (storeSchema); errors come back per field.
 */
export function StoreForm({
  action, store, submitLabel, cancelHref, resetOnSuccess, idPrefix = "store",
}: {
  action: FormAction;
  store?: StoreDTO;
  submitLabel: string;
  cancelHref?: string;
  resetOnSuccess?: boolean;
  idPrefix?: string;
}) {
  const f = useFormAction(action, { resetOnSuccess });
  const e = f.fieldErrors;
  const id = (n: string) => `${idPrefix}-${n}`;
  // Field's error id is `${htmlFor}-error`; inputs reference it through aria-describedby.
  const a = (n: string) => (e[n]?.length ? { "aria-invalid": true as const, "aria-describedby": `${id(n)}-error` } : {});
  const sv = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));

  return (
    <form {...f.form} className="space-y-4">
      {store && <input type="hidden" name="storeId" value={store.id} />}
      <FormError message={f.error} />
      {f.message && <p role="status" className="rounded border border-pos/40 bg-pos/5 px-3 py-2 text-xs text-pos">{f.message}</p>}

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="label mb-2">Identity</legend>
        <Field label="Store name" htmlFor={id("name")} error={e.name} className="sm:col-span-3">
          <input id={id("name")} name="name" className="input" defaultValue={sv(store?.name)} maxLength={80} required placeholder="e.g. Wien Donaustadt" {...a("name")} />
        </Field>
        <Field label="Code" htmlFor={id("code")} error={e.code} hint="Short and unique, e.g. W01" className="sm:col-span-1">
          <input id={id("code")} name="code" className="input font-mono uppercase" defaultValue={sv(store?.code)} maxLength={12} required {...a("code")} />
        </Field>
        <Field label="Store type" htmlFor={id("type")} error={e.type} className="sm:col-span-2">
          <select id={id("type")} name="type" className="input" defaultValue={store?.type ?? "SUPERMARKET"} {...a("type")}>
            {Object.entries(STORE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-6">
        <legend className="label mb-2">Location</legend>
        <Field label="Address" htmlFor={id("address")} error={e.address} className="sm:col-span-4">
          <input id={id("address")} name="address" className="input" defaultValue={sv(store?.address)} maxLength={200} required autoComplete="off" {...a("address")} />
        </Field>
        <Field label="City" htmlFor={id("city")} error={e.city} className="sm:col-span-2">
          <input id={id("city")} name="city" className="input" defaultValue={sv(store?.city)} maxLength={80} required {...a("city")} />
        </Field>
        <Field label="Latitude" htmlFor={id("latitude")} error={e.latitude} optional className="sm:col-span-3">
          <input id={id("latitude")} name="latitude" className="input num" inputMode="decimal" defaultValue={sv(store?.latitude)} placeholder="48.2082" {...a("latitude")} />
        </Field>
        <Field label="Longitude" htmlFor={id("longitude")} error={e.longitude} optional className="sm:col-span-3">
          <input id={id("longitude")} name="longitude" className="input num" inputMode="decimal" defaultValue={sv(store?.longitude)} placeholder="16.3738" {...a("longitude")} />
        </Field>
        <p className="text-xs text-ink-3 sm:col-span-6">
          Coordinates (decimal degrees) place the store on the map and are the only thing sent to research providers. Addresses are not geocoded automatically.
        </p>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <legend className="label mb-2">Operations</legend>
        <Field label="Opening date" htmlFor={id("openingDate")} error={e.openingDate} optional className="sm:col-span-2">
          <input id={id("openingDate")} name="openingDate" type="date" className="input num" defaultValue={sv(store?.openingDate)} {...a("openingDate")} />
        </Field>
        <Field label="Sales area (m²)" htmlFor={id("areaSqm")} error={e.areaSqm} optional className="sm:col-span-2">
          <input id={id("areaSqm")} name="areaSqm" className="input num" inputMode="decimal" defaultValue={sv(store?.areaSqm)} {...a("areaSqm")} />
        </Field>
        <Field label="Employees" htmlFor={id("employees")} error={e.employees} optional className="sm:col-span-2">
          <input id={id("employees")} name="employees" className="input num" inputMode="numeric" defaultValue={sv(store?.employees)} {...a("employees")} />
        </Field>
        <Field label="Opens at" htmlFor={id("opensAt")} error={e.opensAt} optional className="sm:col-span-1">
          <input id={id("opensAt")} name="opensAt" type="time" className="input num" defaultValue={sv(store?.opensAt)} {...a("opensAt")} />
        </Field>
        <Field label="Closes at" htmlFor={id("closesAt")} error={e.closesAt} optional className="sm:col-span-1">
          <input id={id("closesAt")} name="closesAt" type="time" className="input num" defaultValue={sv(store?.closesAt)} {...a("closesAt")} />
        </Field>
        <Field label="Open days / week" htmlFor={id("openDaysPerWeek")} error={e.openDaysPerWeek} optional className="sm:col-span-2">
          <input id={id("openDaysPerWeek")} name="openDaysPerWeek" className="input num" inputMode="numeric" defaultValue={sv(store?.openDaysPerWeek)} placeholder="1–7" {...a("openDaysPerWeek")} />
        </Field>
        <Field label="Parking spaces" htmlFor={id("parkingSpaces")} error={e.parkingSpaces} optional hint="Enter 0 if there is none" className="sm:col-span-2">
          <input id={id("parkingSpaces")} name="parkingSpaces" className="input num" inputMode="numeric" defaultValue={sv(store?.parkingSpaces)} {...a("parkingSpaces")} />
        </Field>
        <p className="col-span-2 text-xs text-ink-3 sm:col-span-6">
          Leave a field empty when you do not know the value. Empty is stored as “not provided” and shown as missing — it is never treated as 0.
        </p>
      </fieldset>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={f.pending}>{f.pending ? "Saving…" : submitLabel}</button>
        {cancelHref && <Link href={cancelHref} className="btn-ghost">Cancel</Link>}
      </div>
    </form>
  );
}
