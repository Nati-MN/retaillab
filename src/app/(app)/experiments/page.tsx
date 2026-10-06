import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, Missing, Notice, PageHeader, Panel, TabNav, Tag } from "@/components/ui";
import { DecisionChip, NoControlChip, StatusChip } from "@/components/experiments/chips";
import { ExperimentTimeline } from "@/components/experiments/Timeline";
import { getExperiments } from "@/components/experiments/queries";
import {
  EXPERIMENT_STATUSES, metricLift, primaryMetric, STATUS_LABELS, type ExperimentStatusKey,
} from "@/lib/experiments/model";
import { fmtDate, fmtSignedPct, fmtSignedPts } from "@/lib/format";
import { first, type SearchParams } from "@/server/period";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Experiments" };

export default async function ExperimentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const all = await getExperiments(ctx.orgId);
  const raw = (first(sp.status) ?? "").toUpperCase();
  const active = (EXPERIMENT_STATUSES as readonly string[]).includes(raw) ? (raw as ExperimentStatusKey) : null;
  const shown = active ? all.filter((e) => e.status === active) : all;
  const todayIso = new Date().toISOString().slice(0, 10);
  const writer = canWrite(ctx.role);

  return (
    <>
      <PageHeader
        title="Experiments"
        subtitle="Hypotheses are tested in one store, compared with a control store, and only then decided. Results are before/after arithmetic — see each experiment's limitations."
        actions={writer ? <Link href="/experiments/new" className="btn-primary"><Plus className="h-3.5 w-3.5" aria-hidden />New experiment</Link> : undefined}
      />

      {all.length === 0 ? (
        <EmptyState
          title="No experiments yet"
          action={writer ? <Link href="/experiments/new" className="btn-primary">New experiment</Link> : undefined}
        >
          An experiment tests one hypothesis in one store over a fixed period, ideally against a control store. Start from a strategy hypothesis or define one from scratch.
        </EmptyState>
      ) : (
        <>
          <TabNav
            label="Filter by status"
            active={active ?? "ALL"}
            items={[
              { key: "ALL", label: "All", href: "/experiments", count: all.length },
              ...EXPERIMENT_STATUSES.map((s) => ({
                key: s, label: STATUS_LABELS[s], href: `/experiments?status=${s.toLowerCase()}`, count: all.filter((e) => e.status === s).length,
              })),
            ]}
          />

          {shown.length === 0 ? (
            <EmptyState title={`No ${STATUS_LABELS[active!].toLowerCase()} experiments`}>
              Nothing has this status at the moment. <Link className="link" href="/experiments">Show all experiments</Link>.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <Panel title="Timeline" subtitle="One bar per experiment from start to end date" flush actions={ctx.org.isDemo ? <Tag kind="DEMO" /> : undefined}>
                <ExperimentTimeline experiments={shown} todayIso={todayIso} />
              </Panel>

              <Panel
                title="All experiments"
                subtitle={`${shown.length} ${active ? STATUS_LABELS[active].toLowerCase() : "in total"}`}
                flush
              >
                <div className="scroll-thin overflow-x-auto">
                  <table className="tbl min-w-[1120px]">
                    <thead>
                      <tr>
                        <th>Experiment</th>
                        <th>Test store</th>
                        <th>Control store</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        <th>Primary metric</th>
                        <th className="text-right">Control-adjusted change</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((e) => {
                        const pm = primaryMetric(e.metrics);
                        const lift = pm ? metricLift(pm, e.controlStore !== null) : null;
                        return (
                          <tr key={e.id}>
                            <td className="min-w-[200px] max-w-[280px]">
                              <Link href={`/experiments/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                            </td>
                            <td className="whitespace-nowrap">{e.testStore.name}</td>
                            <td className="whitespace-nowrap">{e.controlStore ? e.controlStore.name : <NoControlChip />}</td>
                            <td className="num whitespace-nowrap">{fmtDate(e.startDate)}</td>
                            <td className="num whitespace-nowrap">{fmtDate(e.endDate)}</td>
                            <td><StatusChip status={e.status} /></td>
                            <td className="max-w-[200px] text-ink-2">{pm ? pm.name : <Missing reason="No metric defined" />}</td>
                            <td className="r whitespace-nowrap">
                              {lift?.controlAdjustedPts != null ? (
                                <span className="inline-flex items-center gap-2">
                                  <Tag kind="EXPERIMENT_RESULT" />
                                  <span className="font-semibold">{fmtSignedPts(lift.controlAdjustedPts)}</span>
                                </span>
                              ) : lift?.rawChangePct != null ? (
                                <span className="text-xs text-ink-3" title="Raw before/after change of the test store. Not control-adjusted.">
                                  raw {fmtSignedPct(lift.rawChangePct)} · not adjusted
                                </span>
                              ) : (
                                <span className="text-xs text-ink-3">{e.status === "PLANNED" || e.status === "RUNNING" ? "Results not entered yet" : "Not computable"}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap">{e.status === "COMPLETED" || e.status === "STOPPED" ? <DecisionChip decision={e.decision} /> : <span className="text-ink-3" title="Decisions are recorded after the experiment ends">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Notice tone="info" title="How to read control-adjusted change">
                Test store change (%) minus control store change (%) over the same period, in percentage points. It is descriptive arithmetic on one
                store pair — not a significance test, and it does not establish that the change caused the difference.
              </Notice>
            </div>
          )}
        </>
      )}
    </>
  );
}
