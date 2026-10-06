import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import type { ScenarioKindKey } from "@/lib/strategy/rules";
import { computeScenario, SCENARIO_KINDS, SIMULATOR_KINDS } from "@/lib/strategy/scenarioKinds";
import { Notice, Panel } from "@/components/ui";
import { deleteScenario } from "@/server/actions/strategies";
import { first, type SearchParams } from "@/server/period";
import { ActionButton } from "./ActionControls";
import { loadScenario, loadScenarios, loadStorePrefills } from "./loaders";
import { Simulator } from "./Simulator";

export async function SimulatorTab({ orgId, currency, canWrite, sp }: { orgId: string; currency: string; canWrite: boolean; sp: SearchParams }) {
  const scenarioId = first(sp.scenario);
  const kindParam = first(sp.kind);
  const initialKind: ScenarioKindKey = SIMULATOR_KINDS.includes(kindParam as ScenarioKindKey) ? (kindParam as ScenarioKindKey) : "OPENING_HOURS";
  const [{ prefills }, requested, saved] = await Promise.all([
    loadStorePrefills(orgId),
    scenarioId && /^[a-z0-9]{1,40}$/i.test(scenarioId) ? loadScenario(orgId, scenarioId) : null,
    loadScenarios(orgId),
  ]);
  const loadable = requested && SIMULATOR_KINDS.includes(requested.kind) ? requested : null;
  const userSaved = saved.filter((s) => !s.strategyId);
  const fromHypotheses = saved.filter((s) => s.strategyId);

  const table = (rows: typeof saved, deletable: boolean) => (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Simulator</th>
            <th scope="col">Store</th>
            <th scope="col" className="r">Base result</th>
            <th scope="col">Saved</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const base = computeScenario(s.kind, s.variants.BASE, currency);
            const canLoad = SIMULATOR_KINDS.includes(s.kind);
            return (
              <tr key={s.id} className={cn(s.id === loadable?.id && "[&>td]:bg-accent/5")}>
                <td className="min-w-[14rem]">
                  <div className="font-medium">{s.name}</div>
                  {s.strategyTitle && <div className="text-xs text-ink-3">Hypothesis: {s.strategyTitle}</div>}
                </td>
                <td className="whitespace-nowrap text-ink-2">{SCENARIO_KINDS[s.kind].label}</td>
                <td className="whitespace-nowrap text-ink-2">{s.storeName ?? "—"}</td>
                <td className="r whitespace-nowrap">
                  {base.headline ? (
                    <>
                      <span className={cn("font-medium", base.headline.value !== null && base.headline.value < 0 && "text-neg")}>{base.headline.text}</span>
                      <div className="font-sans text-2xs text-ink-3">{base.headline.short}</div>
                    </>
                  ) : (
                    <span className="font-sans text-xs text-ink-3">incomplete inputs</span>
                  )}
                </td>
                <td className="num whitespace-nowrap text-ink-2">{fmtDate(s.createdAt)}</td>
                <td>
                  <div className="flex items-center justify-end gap-1.5">
                    {canLoad && (
                      <Link className="btn-secondary btn-sm" href={`/strategies?tab=simulator&scenario=${s.id}`} aria-label={`Load ${s.name}`}>
                        {s.id === loadable?.id ? "Loaded" : "Load"}
                      </Link>
                    )}
                    {deletable && canWrite && (
                      <ActionButton action={deleteScenario} fields={{ id: s.id }} className="btn-danger btn-sm" confirm={`Delete the saved scenario “${s.name}”?`} feedback="errors">
                        Delete
                      </ActionButton>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      {scenarioId && !requested && (
        <Notice tone="warn" title="Scenario not found">The requested scenario does not exist in this organization (it may have been deleted). The simulator starts empty.</Notice>
      )}
      {requested && !loadable && (
        <Notice tone="info" title={`“${requested.name}” is a ${SCENARIO_KINDS[requested.kind].label.toLowerCase()} scenario`}>
          It has its own calculator:{" "}
          <Link className="link" href={requested.kind === "BREAK_EVEN" ? "/strategies?tab=break-even" : "/strategies?tab=opportunity"}>open it</Link>.
        </Notice>
      )}

      <Simulator
        key={`${loadable?.id ?? "new"}-${initialKind}`}
        currency={currency}
        canWrite={canWrite}
        stores={prefills}
        initial={loadable}
        initialKind={initialKind}
        justSaved={first(sp.saved) === "1"}
      />

      <Panel title="Saved scenarios" subtitle="Newest first. The base result is recalculated from the stored assumptions — scenario, not a forecast." flush kind="SCENARIO">
        {userSaved.length ? table(userSaved, true) : <p className="p-3 text-xs text-ink-3">No scenarios saved yet. {canWrite ? "Enter assumptions above and use “Save scenario”." : ""}</p>}
      </Panel>

      {fromHypotheses.length > 0 && (
        <Panel title="Scenarios attached to hypotheses" subtitle="Created by the rule engine together with a hypothesis. Load one to change its assumptions and save a copy." flush kind="SCENARIO">
          {table(fromHypotheses, false)}
        </Panel>
      )}
    </div>
  );
}
