"use client";

import { useActionState, useMemo, useState } from "react";
import { SCENARIO_VARIANTS, type ScenarioVariantKey } from "@/lib/calc";
import { cn } from "@/lib/cn";
import type { StorePrefill } from "@/lib/strategy/prefill";
import type { ScenarioKindKey } from "@/lib/strategy/rules";
import {
  addHoursToTime, additionalHoursBetween, computeScenario, decimalHourToTime, exprNum, parseInputNumber, SCENARIO_KINDS,
  SIMULATOR_KINDS, timeToDecimalHour, VARIANT_LABELS, varyingKeys, type ScenarioInputDef, type ScenarioValues,
} from "@/lib/strategy/scenarioKinds";
import { Field, FormError, Notice, Panel, Tag } from "@/components/ui";
import { saveScenario } from "@/server/actions/strategies";
import { NumberField, PrefillNote, ScenarioBanner, StorePrefillSelect } from "./fields";
import type { ScenarioDTO } from "./loaders";
import { VariantResult } from "./ScenarioColumns";

type Values = Record<ScenarioVariantKey, Record<string, string>>;

const emptyValues = (): Values => ({ CONSERVATIVE: {}, BASE: {}, OPTIMISTIC: {} });
const str = (n: number | undefined): string => (n === undefined ? "" : String(n));

/** Worked examples. Clearly labelled in the UI as example values to be replaced. */
const EXAMPLES: Record<string, { shared: Record<string, string>; perVariant: Record<string, [string, string, string]>; current?: string; proposed?: string }> = {
  OPENING_HOURS: {
    shared: { additionalHoursPerDay: "1", additionalEmployees: "2", hourlyEmployeeCost: "19", daysPerMonth: "26", averageBasket: "14.20", grossMarginPct: "31", otherMonthlyCost: "" },
    perVariant: { additionalCustomersPerHour: ["5", "10", "15"] },
    current: "19:00",
    proposed: "20:00",
  },
  TRANSACTION_UPLIFT: {
    shared: { averageBasket: "8.40", daysPerMonth: "26", grossMarginPct: "35", monthlyCost: "", oneOffCost: "" },
    perVariant: { additionalTransactionsPerDay: ["8", "15", "30"] },
  },
  COST_REDUCTION: {
    shared: { baselineMonthlyCost: "4200", monthlyCost: "150", oneOffCost: "" },
    perVariant: { reductionPct: ["10", "20", "30"] },
  },
};

function fromScenario(s: ScenarioDTO): Values {
  const out = emptyValues();
  for (const v of SCENARIO_VARIANTS) {
    for (const [k, n] of Object.entries(s.variants[v])) out[v][k] = String(n);
  }
  return out;
}

export function Simulator({
  currency, canWrite, stores, initial, initialKind, justSaved,
}: {
  currency: string;
  canWrite: boolean;
  stores: StorePrefill[];
  /** Saved scenario to load (from ?scenario=). */
  initial: ScenarioDTO | null;
  initialKind: ScenarioKindKey;
  justSaved: boolean;
}) {
  const initialStore = initial?.storeId ? stores.find((s) => s.storeId === initial.storeId) ?? null : null;
  const [kind, setKind] = useState<ScenarioKindKey>(initial?.kind ?? initialKind);
  const [values, setValues] = useState<Values>(() => (initial ? fromScenario(initial) : emptyValues()));
  const [varying, setVarying] = useState<string[]>(() =>
    initial ? varyingKeys(initial.kind, initial.variants) : SCENARIO_KINDS[initialKind].inputs.filter((i) => i.perVariant).map((i) => i.key),
  );
  const [current, setCurrent] = useState<string>(() => {
    if (!initial || initial.kind !== "OPENING_HOURS") return "";
    return decimalHourToTime(initial.variants.BASE.currentClosingHour) ?? initialStore?.closesAt ?? "";
  });
  const [proposed, setProposed] = useState<string>(() => {
    if (!initial || initial.kind !== "OPENING_HOURS") return "";
    const c = decimalHourToTime(initial.variants.BASE.currentClosingHour) ?? initialStore?.closesAt ?? null;
    return addHoursToTime(c, initial.variants.BASE.additionalHoursPerDay) ?? "";
  });
  const [prefill, setPrefill] = useState<StorePrefill | null>(null);
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [storeId, setStoreId] = useState(initial?.storeId ?? "");
  const [derivation, setDerivation] = useState(initial?.derivation ?? "");
  const [state, formAction, pending] = useActionState(saveScenario, null);

  const meta = SCENARIO_KINDS[kind];
  const sharedDefs = meta.inputs.filter((i) => !varying.includes(i.key));
  const variantDefs = meta.inputs.filter((i) => varying.includes(i.key));

  const numeric = useMemo(() => {
    const out = {} as Record<ScenarioVariantKey, ScenarioValues>;
    for (const v of SCENARIO_VARIANTS) {
      out[v] = Object.fromEntries(meta.inputs.map((i) => [i.key, parseInputNumber(values[v][i.key])]));
    }
    return out;
  }, [values, meta]);
  const results = useMemo(
    () => Object.fromEntries(SCENARIO_VARIANTS.map((v) => [v, computeScenario(kind, numeric[v], currency)])) as Record<ScenarioVariantKey, ReturnType<typeof computeScenario>>,
    [kind, numeric, currency],
  );

  const setAll = (key: string, raw: string) => {
    setValues((prev) => ({
      CONSERVATIVE: { ...prev.CONSERVATIVE, [key]: raw },
      BASE: { ...prev.BASE, [key]: raw },
      OPTIMISTIC: { ...prev.OPTIMISTIC, [key]: raw },
    }));
    setDirty(true);
  };
  const setOne = (variant: ScenarioVariantKey, key: string, raw: string) => {
    setValues((prev) => ({ ...prev, [variant]: { ...prev[variant], [key]: raw } }));
    setDirty(true);
  };

  const changeKind = (k: ScenarioKindKey) => {
    if (k === kind) return;
    const keep = new Set(SCENARIO_KINDS[k].inputs.map((i) => i.key));
    setValues((prev) => {
      const next = emptyValues();
      for (const v of SCENARIO_VARIANTS) for (const [key, val] of Object.entries(prev[v])) if (keep.has(key)) next[v][key] = val;
      return next;
    });
    setVarying(SCENARIO_KINDS[k].inputs.filter((i) => i.perVariant).map((i) => i.key));
    setKind(k);
    setExampleLoaded(false);
    setDirty(true);
  };

  const toggleVarying = (def: ScenarioInputDef) => {
    if (varying.includes(def.key)) {
      // Collapse to one shared value: the Base value wins.
      setAll(def.key, values.BASE[def.key] ?? "");
      setVarying((p) => p.filter((k) => k !== def.key));
    } else {
      setVarying((p) => [...p, def.key]);
    }
  };

  const applyTimes = (c: string, p: string) => {
    setCurrent(c);
    setProposed(p);
    const h = additionalHoursBetween(c, p);
    if (h !== null) setAll("additionalHoursPerDay", String(h));
    else setDirty(true);
  };
  const setHours = (raw: string) => {
    setAll("additionalHoursPerDay", raw);
    const t = addHoursToTime(current, parseInputNumber(raw));
    if (t) setProposed(t);
  };

  const applyPrefill = (p: StorePrefill | null) => {
    setPrefill(p);
    if (!p) return;
    const keys = new Set(meta.inputs.map((i) => i.key));
    if (keys.has("averageBasket") && p.averageBasket !== null) setAll("averageBasket", p.averageBasket.toFixed(2));
    if (keys.has("grossMarginPct") && p.grossMarginPct !== null) setAll("grossMarginPct", String(p.grossMarginPct));
    if (keys.has("daysPerMonth") && p.daysPerMonth !== null) setAll("daysPerMonth", String(p.daysPerMonth));
    if (kind === "OPENING_HOURS" && p.closesAt) {
      const hours = parseInputNumber(values.BASE.additionalHoursPerDay);
      applyTimes(p.closesAt, addHoursToTime(p.closesAt, hours) ?? proposed);
    }
    if (!storeId) setStoreId(p.storeId);
    setDirty(true);
  };

  const loadExample = () => {
    const ex = EXAMPLES[kind];
    if (!ex) return;
    const next = emptyValues();
    SCENARIO_VARIANTS.forEach((v, i) => {
      next[v] = { ...ex.shared };
      for (const [k, triple] of Object.entries(ex.perVariant)) next[v][k] = triple[i]!;
    });
    setValues(next);
    setVarying(meta.inputs.filter((i) => i.perVariant).map((i) => i.key));
    if (ex.current) setCurrent(ex.current);
    if (ex.proposed) setProposed(ex.proposed);
    setPrefill(null);
    setExampleLoaded(true);
    setDirty(true);
  };

  const clearAll = () => {
    setValues(emptyValues());
    setCurrent("");
    setProposed("");
    setPrefill(null);
    setExampleLoaded(false);
    setDirty(true);
  };

  // What gets stored: numeric assumptions only — never results.
  const payload = useMemo(() => {
    const out: Record<ScenarioVariantKey, Record<string, number>> = { CONSERVATIVE: {}, BASE: {}, OPTIMISTIC: {} };
    const closing = kind === "OPENING_HOURS" ? timeToDecimalHour(current) : null;
    for (const v of SCENARIO_VARIANTS) {
      for (const i of meta.inputs) {
        const n = numeric[v][i.key];
        if (typeof n === "number") out[v][i.key] = n;
      }
      if (closing !== null) out[v].currentClosingHour = closing;
    }
    return JSON.stringify(out);
  }, [numeric, meta, kind, current]);

  const hoursDiff = additionalHoursBetween(current, proposed);
  const timesInvalid = kind === "OPENING_HOURS" && current !== "" && proposed !== "" && hoursDiff === null;
  const prefillFields = (["averageBasket", "grossMarginPct", "daysPerMonth"] as const).filter((k) => meta.inputs.some((i) => i.key === k));
  const canUpdate = !!initial && !initial.strategyId;
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const renderShared = (def: ScenarioInputDef) => (
    <NumberField
      key={def.key}
      label={def.label}
      unit={def.unit}
      currency={currency}
      value={values.BASE[def.key] ?? ""}
      onChange={(v) => (def.key === "additionalHoursPerDay" ? setHours(v) : setAll(def.key, v))}
      help={def.help}
      optional={def.optional}
      step={def.step}
      note={
        <button type="button" className="self-start text-2xs text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-ink" onClick={() => toggleVarying(def)}>
          Vary per scenario
        </button>
      }
    />
  );

  return (
    <div className="space-y-3">
      <Panel
        title="Simulator"
        subtitle="Pick a calculation, enter your assumptions, compare three variants."
        actions={<Tag kind="SCENARIO" />}
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink-2">Simulator</legend>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Simulator">
              {SIMULATOR_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={k === kind}
                  onClick={() => changeKind(k)}
                  className={cn("btn h-8", k === kind ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}
                >
                  {SCENARIO_KINDS[k].label}
                </button>
              ))}
            </div>
          </fieldset>
          <StorePrefillSelect stores={stores} value={prefill?.storeId ?? ""} onSelect={applyPrefill} />
          <div className="flex gap-1.5">
            <button type="button" className="btn-secondary" onClick={loadExample}>Load worked example</button>
            <button type="button" className="btn-ghost" onClick={clearAll}>Clear</button>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-2">{meta.description}</p>
        <div className="mt-1 space-y-1">
          <PrefillNote prefill={prefill} fields={kind === "OPENING_HOURS" ? [...prefillFields, "closesAt"] : prefillFields} currency={currency} />
          {exampleLoaded && <p className="text-xs text-warn" role="status">Example values loaded — they are illustrative, not data from your stores. Replace them with your own assumptions.</p>}
        </div>
      </Panel>

      <ScenarioBanner>
        Every result below is arithmetic on the assumptions you enter. Change an assumption and the result changes. Whether the assumptions hold can only be found out by testing.
      </ScenarioBanner>

      {initial && (
        <Notice tone="info" title={`Loaded: ${initial.name}`}>
          {initial.strategyTitle && <>Scenario of the hypothesis “{initial.strategyTitle}”{initial.storeName ? ` (${initial.storeName})` : ""}. </>}
          {!initial.strategyTitle && initial.storeName && <>Store: {initial.storeName}. </>}
          {justSaved && !dirty && <span role="status" className="font-medium text-pos">Saved. </span>}
          {initial.derivation ? (
            <span className="mt-1 block">
              <span className="font-medium text-ink">How these assumptions were derived: </span>
              {initial.derivation}
            </span>
          ) : (
            <span className="mt-1 block text-ink-3">No derivation note was saved with this scenario.</span>
          )}
          {dirty && <span className="mt-1 block text-warn">You have changed values since loading — the note above describes the saved version.</span>}
        </Notice>
      )}

      <Panel title="Shared assumptions" kind="ASSUMPTION" subtitle="Same value in all three variants. Use “Vary per scenario” to set a value per variant.">
        {kind === "OPENING_HOURS" && (
          <div className="mb-3 grid gap-3 border-b border-line pb-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Current closing time" htmlFor="sim-current-closing">
              <input id="sim-current-closing" type="time" className="input num" value={current} onChange={(e) => applyTimes(e.target.value, proposed)} />
            </Field>
            <Field label="Proposed closing time" htmlFor="sim-proposed-closing" error={timesInvalid ? "Must be later than the current closing time." : undefined}>
              <input id="sim-proposed-closing" type="time" className="input num" value={proposed} aria-invalid={timesInvalid || undefined} onChange={(e) => applyTimes(current, e.target.value)} />
            </Field>
            <div className="self-end pb-1 text-xs text-ink-2 sm:col-span-2">
              {hoursDiff !== null ? (
                <span className="num">{proposed} − {current} = <span className="font-semibold text-ink">{exprNum(hoursDiff)} additional h/day</span></span>
              ) : (
                <span className="text-ink-3">Enter both times to derive the additional hours per day, or type the hours directly below.</span>
              )}
            </div>
          </div>
        )}
        {sharedDefs.length > 0 ? (
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{sharedDefs.map(renderShared)}</div>
        ) : (
          <p className="text-xs text-ink-3">All inputs are set per variant.</p>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3" role="group" aria-label="Scenario analysis: conservative, base and optimistic">
        {SCENARIO_VARIANTS.map((v) => (
          <Panel key={v} title={VARIANT_LABELS[v]} bodyClassName="space-y-3">
            {variantDefs.map((def) => (
              <NumberField
                key={def.key}
                label={def.label}
                unit={def.unit}
                currency={currency}
                value={values[v][def.key] ?? ""}
                onChange={(raw) => setOne(v, def.key, raw)}
                slider={def.slider}
                optional={def.optional}
                step={def.step}
                help={v === "CONSERVATIVE" ? def.help : undefined}
                note={
                  !def.perVariant && v === "CONSERVATIVE" ? (
                    <button type="button" className="self-start text-2xs text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-ink" onClick={() => toggleVarying(def)}>
                      Use one shared value
                    </button>
                  ) : undefined
                }
              />
            ))}
            <div aria-live="polite">
              <div className="label mb-1">Result</div>
              <VariantResult computation={results[v]} />
            </div>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-ink-3">{meta.caveat}</p>

      {canWrite && (
        <Panel title="Save scenario" subtitle="Only the assumptions are stored. Results are recalculated every time the scenario is opened.">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="inputs" value={payload} />
            <FormError message={state && !state.ok ? state.error : null} />
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Name" htmlFor="sim-name" error={fieldErrors?.name}>
                <input id="sim-name" name="name" className="input" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} placeholder={`${meta.label} — …`} />
              </Field>
              <Field label="Store" htmlFor="sim-store" optional error={fieldErrors?.storeId}>
                <select id="sim-store" name="storeId" className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">Not tied to a store</option>
                  {stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                </select>
              </Field>
            </div>
            <Field label="How these assumptions were derived" htmlFor="sim-derivation" optional hint="Where do the three variants come from? This note is shown whenever the scenario is opened." error={fieldErrors?.derivation}>
              <textarea id="sim-derivation" name="derivation" className="input" rows={2} maxLength={1500} value={derivation} onChange={(e) => setDerivation(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary" disabled={pending}>{initial ? "Save as new scenario" : "Save scenario"}</button>
              {canUpdate && (
                <button type="submit" name="scenarioId" value={initial.id} className="btn-secondary" disabled={pending}>Update “{initial.name}”</button>
              )}
              {initial?.strategyId && <span className="text-xs text-ink-3">The hypothesis keeps its own scenario; saving creates a separate copy.</span>}
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
