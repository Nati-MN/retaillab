"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, FormError, Notice } from "@/components/ui";
import { fmtDistance } from "@/lib/format";
import { RESEARCH_RADII, RESEARCH_STEPS } from "@/lib/research/findings";
import { runResearchAction } from "@/server/actions/research";

const defaultQuery = (name: string | undefined) => (name ? `Analyze the environment around ${name}.` : "");

export function ResearchForm({
  stores, defaultStoreId, defaultRadius, placesConnected, providerLabel, providerIsDemo, unconnected, canWrite,
}: {
  stores: { id: string; name: string; hasCoordinates: boolean }[];
  defaultStoreId: string;
  defaultRadius: number;
  placesConnected: boolean;
  providerLabel: string | null;
  providerIsDemo: boolean;
  unconnected: { capability: string; howToConnect: string }[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(runResearchAction, null);
  const [storeId, setStoreId] = useState(defaultStoreId);
  const nameOf = (id: string) => stores.find((s) => s.id === id)?.name;
  const [query, setQuery] = useState(defaultQuery(nameOf(defaultStoreId)));
  const [edited, setEdited] = useState(false);
  const store = stores.find((s) => s.id === storeId);
  const blocked = !placesConnected || !canWrite || !store?.hasCoordinates;
  const unavailable = state?.ok && state.data?.status === "UNAVAILABLE" ? state.data.reason : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Research question" htmlFor="rq-query" hint="Stored with the result. No web search provider is connected, so the wording does not change what is looked up: places around the store within the radius.">
        <input
          id="rq-query" name="query" className="input" maxLength={300} value={query}
          onChange={(e) => { setQuery(e.target.value); setEdited(true); }}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
        <Field label="Store" htmlFor="rq-store">
          <select
            id="rq-store" name="storeId" className="input" value={storeId}
            onChange={(e) => { setStoreId(e.target.value); if (!edited) setQuery(defaultQuery(nameOf(e.target.value))); }}
          >
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasCoordinates ? "" : " — no coordinates"}</option>)}
          </select>
        </Field>
        <Field label="Radius" htmlFor="rq-radius">
          <select id="rq-radius" name="radiusM" className="input" defaultValue={defaultRadius}>
            {RESEARCH_RADII.map((r) => <option key={r} value={r}>{fmtDistance(r)}</option>)}
          </select>
        </Field>
        <button type="submit" className="btn-primary" disabled={blocked || pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {pending ? "Running…" : "Run research"}
        </button>
      </div>

      {!placesConnected ? (
        <Notice tone="unavailable" title="Research is unavailable — no places provider is connected">
          <p>Nothing can be looked up, so nothing is run and nothing is shown as if it had been. Not connected:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {unconnected.map((u) => <li key={u.capability}><span className="font-medium text-ink">{u.capability}</span> — {u.howToConnect}</li>)}
          </ul>
        </Notice>
      ) : !canWrite ? (
        <Notice tone="info">Your role is read-only. Ask an owner or analyst to run research.</Notice>
      ) : !store?.hasCoordinates ? (
        <Notice tone="unavailable" title="This store has no coordinates">Location research needs latitude and longitude. Add them on the store&apos;s edit page.</Notice>
      ) : pending ? (
        <div role="status" aria-live="polite" className="rounded border border-line bg-surface-2 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Research is running on the server
          </div>
          <ol className="space-y-1 text-xs">
            {RESEARCH_STEPS.map((s, i) => (
              <li key={s.label} className="flex gap-2">
                <span className="num w-4 shrink-0 font-mono text-ink-3">{i + 1}</span>
                <span><span className="font-medium">{s.label}</span> <span className="text-ink-3">— {s.detail}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-xs text-ink-3">The steps run in this order in a single request; individual step completion is not reported back, so none is ticked off here.</p>
        </div>
      ) : (
        <p className="text-xs text-ink-3">
          Provider: <span className="text-ink-2">{providerLabel}</span>{providerIsDemo ? " — returns invented places for the demo stores only." : "."}{" "}
          Only the store&apos;s coordinates and the radius are sent. A run replaces the stored competitors and signals inside the chosen radius.
        </p>
      )}

      {unavailable && <Notice tone="unavailable" title="Research unavailable">{unavailable}</Notice>}
      {state && !state.ok && <FormError message={state.error} />}
    </form>
  );
}
