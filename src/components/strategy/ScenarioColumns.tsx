import { SCENARIO_VARIANTS } from "@/lib/calc";
import { cn } from "@/lib/cn";
import type { ScenarioKindKey } from "@/lib/strategy/rules";
import {
  computeScenario, formatInputValue, SCENARIO_KINDS, VARIANT_LABELS, type ResultLine, type ScenarioComputation, type VariantValues,
} from "@/lib/strategy/scenarioKinds";
import { Notice } from "@/components/ui";

/** Result lines of one variant, or a clear statement of which inputs are missing. */
export function VariantResult({ computation, className }: { computation: ScenarioComputation; className?: string }) {
  if (computation.lines.length === 0) {
    return (
      <Notice tone="unavailable" className={className} title="Cannot be calculated yet">
        Missing: {computation.missing.join(", ") || "inputs"}.
      </Notice>
    );
  }
  return <CalcLines className={className} lines={computation.lines} />;
}

/**
 * Stacked variant of the design system's CalcBlock for narrow columns:
 * label and result on the first row, the arithmetic with the actual numbers
 * on its own row beneath, then any note.
 */
export function CalcLines({ lines, className }: { lines: Pick<ResultLine, "label" | "expr" | "result" | "emphasis" | "note">[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line rounded border border-line bg-surface-2 text-xs", className)}>
      {lines.map((l, i) => (
        <div key={i} className={cn("px-3 py-1.5", l.emphasis && "bg-surface")}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={cn("min-w-0 text-ink-2", l.emphasis && "font-semibold text-ink")}>{l.label}</dt>
            <dd className={cn("num shrink-0 text-right font-mono", l.emphasis ? "text-[13px] font-semibold" : "text-ink")}>{l.result}</dd>
          </div>
          {l.expr && <div className="num font-mono text-2xs leading-4 text-ink-3">= {l.expr}</div>}
          {l.note && <div className="text-2xs leading-4 text-ink-3">{l.note}</div>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Read-only scenario: every stored assumption per variant, then the result
 * lines per variant side by side. Outputs are recomputed from the inputs on
 * every render — nothing here is stored.
 */
export function ScenarioColumns({ kind, variants, currency, className }: { kind: ScenarioKindKey; variants: VariantValues; currency: string; className?: string }) {
  const meta = SCENARIO_KINDS[kind];
  const defs = meta.inputs.filter((d) => SCENARIO_VARIANTS.some((v) => variants[v][d.key] !== undefined));
  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded border border-line">
        <table className="tbl text-xs">
          <caption className="sr-only">Assumptions used in each scenario variant</caption>
          <thead>
            <tr>
              <th scope="col">Input</th>
              {SCENARIO_VARIANTS.map((v) => <th key={v} scope="col" className="r">{VARIANT_LABELS[v]}</th>)}
            </tr>
          </thead>
          <tbody>
            {defs.map((d) => {
              const vals = SCENARIO_VARIANTS.map((v) => variants[v][d.key]);
              const same = vals.every((x) => x === vals[0]);
              return (
                <tr key={d.key}>
                  <td className="!py-1.5 text-ink-2">{d.label}</td>
                  {same ? (
                    <td colSpan={3} className="r !py-1.5 text-ink-2">{formatInputValue(d, vals[0], currency)} <span className="font-sans text-ink-3">in all three</span></td>
                  ) : (
                    vals.map((x, i) => <td key={i} className="r !py-1.5 font-medium">{formatInputValue(d, x, currency)}</td>)
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {SCENARIO_VARIANTS.map((v) => (
          <div key={v} className="min-w-0">
            <div className="label mb-1">{VARIANT_LABELS[v]}</div>
            <VariantResult computation={computeScenario(kind, variants[v], currency)} />
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3">{meta.caveat}</p>
    </div>
  );
}
