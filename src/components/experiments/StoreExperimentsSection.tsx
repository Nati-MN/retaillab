import Link from "next/link";
import { EmptyState, Panel, Tag } from "@/components/ui";
import type { StoreDTO } from "@/lib/analytics/types";
import { metricLift, primaryMetric, type ExperimentDTO } from "@/lib/experiments/model";
import { fmtDate, fmtSignedPct, fmtSignedPts } from "@/lib/format";
import { DecisionChip, NoControlChip, StatusChip } from "./chips";
import { getExperiments } from "./queries";

/** Props shared by all store-detail sections owned by other feature areas. */
export interface StoreSectionProps {
  orgId: string;
  store: StoreDTO;
  currency: string;
}

function Role({ e, storeId }: { e: ExperimentDTO; storeId: string }) {
  return e.testStore.id === storeId ? (
    <span>Test store{e.controlStore ? <span className="text-ink-3"> · control: {e.controlStore.name}</span> : <> · <NoControlChip /></>}</span>
  ) : (
    <span>Control store<span className="text-ink-3"> · test: {e.testStore.name}</span></span>
  );
}

function OpenTable({ rows, storeId }: { rows: ExperimentDTO[]; storeId: string }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="tbl min-w-[640px]">
        <thead>
          <tr><th>Experiment</th><th>This store is</th><th>Start</th><th>End</th><th>Status</th><th>Primary metric</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td><Link href={`/experiments/${e.id}`} className="font-medium hover:underline">{e.title}</Link></td>
              <td><Role e={e} storeId={storeId} /></td>
              <td className="num whitespace-nowrap">{fmtDate(e.startDate)}</td>
              <td className="num whitespace-nowrap">{fmtDate(e.endDate)}</td>
              <td><StatusChip status={e.status} /></td>
              <td className="text-ink-2">{primaryMetric(e.metrics)?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Store detail: running and planned experiments for this store, and what earlier ones showed. */
export async function StoreExperimentsSection({ orgId, store }: StoreSectionProps) {
  const all = await getExperiments(orgId, { storeId: store.id });
  const newHref = `/experiments/new?store=${store.id}`;
  const newButton = <Link href={newHref} className="btn-secondary btn-sm">New experiment for this store</Link>;

  if (all.length === 0) {
    return (
      <EmptyState title="No experiments for this store" action={<Link href={newHref} className="btn-primary">New experiment for this store</Link>}>
        Nothing has been tested in {store.name} yet, and it has not served as a control store. An experiment turns a hypothesis into measured before/after values.
      </EmptyState>
    );
  }

  const running = all.filter((e) => e.status === "RUNNING");
  const planned = all.filter((e) => e.status === "PLANNED");
  const past = all.filter((e) => e.status === "COMPLETED" || e.status === "STOPPED");

  return (
    <div className="space-y-4">
      <Panel title="Running experiments" subtitle={running.length === 0 ? undefined : "This store is currently part of a test"} flush actions={newButton}>
        {running.length === 0
          ? <p className="p-3 text-xs text-ink-3">No experiment is running in this store right now.</p>
          : <OpenTable rows={running} storeId={store.id} />}
      </Panel>

      <Panel title="Planned experiments" flush>
        {planned.length === 0
          ? <p className="p-3 text-xs text-ink-3">No experiment is planned for this store.</p>
          : <OpenTable rows={planned} storeId={store.id} />}
      </Panel>

      <Panel title="What previous experiments showed" subtitle="Completed and stopped experiments — measured values, not proof of cause" flush>
        {past.length === 0 ? (
          <p className="p-3 text-xs text-ink-3">No experiment involving this store has been completed or stopped yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {past.map((e) => {
              const pm = primaryMetric(e.metrics);
              const lift = pm ? metricLift(pm, e.controlStore !== null) : null;
              return (
                <li key={e.id} className="grid gap-x-4 gap-y-1.5 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/experiments/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                      <StatusChip status={e.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-ink-2"><Role e={e} storeId={store.id} /></div>
                    <div className="num mt-0.5 text-xs text-ink-3">{fmtDate(e.startDate)} – {fmtDate(e.endDate)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {lift?.controlAdjustedPts != null ? (
                        <>
                          <Tag kind="EXPERIMENT_RESULT" />
                          <span className="num text-[15px] font-semibold">{fmtSignedPts(lift.controlAdjustedPts)}</span>
                          <span className="text-xs text-ink-3">control-adjusted · {pm!.name}</span>
                        </>
                      ) : lift?.rawChangePct != null ? (
                        <>
                          <Tag kind="EXPERIMENT_RESULT" />
                          <span className="num text-[15px] font-semibold">{fmtSignedPct(lift.rawChangePct)}</span>
                          <span className="text-xs text-ink-3">raw change, not control-adjusted · {pm!.name}</span>
                        </>
                      ) : (
                        <span className="text-xs text-ink-3">Results not entered{pm ? ` for ${pm.name}` : ""}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-start gap-2 text-xs">
                      <DecisionChip decision={e.decision} />
                      {e.decisionNote && <span className="min-w-0 flex-1 text-ink-2">{e.decisionNote}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
