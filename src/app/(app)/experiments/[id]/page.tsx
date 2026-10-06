import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Missing, Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { DecisionChip, NoControlChip, StatusChip, strategyStatusLabel } from "@/components/experiments/chips";
import { DecisionForm, DeleteExperimentButton, NotesForm, ResultsForm, StatusActions } from "@/components/experiments/DetailForms";
import { getExperiment } from "@/components/experiments/queries";
import { ResultsPanel } from "@/components/experiments/ResultsPanel";
import { durationDays, experimentLimitations, NOT_A_SIGNIFICANCE_TEST, orderMetrics } from "@/lib/experiments/model";
import { fmtDate, fmtMoney } from "@/lib/format";
import { canWrite, requireOrg } from "@/server/session";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const e = await getExperiment(ctx.orgId, id);
  if (!e) notFound();
  const writer = canWrite(ctx.role);
  const currency = ctx.org.currency;
  const days = durationDays(e.startDate, e.endDate);
  const limitations = experimentLimitations(e);
  const caseLims = limitations.filter((l) => l.scope === "case");
  const generalLims = limitations.filter((l) => l.scope === "general");
  const ended = e.status === "COMPLETED" || e.status === "STOPPED";
  const metrics = orderMetrics(e.metrics);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/experiments" className="hover:underline">Experiments</Link>}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.title}
            <StatusChip status={e.status} />
            {e.isDemo && <Tag kind="DEMO" />}
          </span>
        }
      />

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Setup">
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Tag kind="HYPOTHESIS" />
                  {e.strategy && (
                    <span className="text-xs text-ink-3">
                      from strategy <Link href="/strategies" className="link">{e.strategy.title}</Link> · {strategyStatusLabel(e.strategy.status)}
                    </span>
                  )}
                </div>
                <p className="max-w-3xl text-[14px] leading-6">{e.hypothesis}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 xl:grid-cols-5">
                <div>
                  <dt className="label">Test store</dt>
                  <dd><Link className="link" href={`/stores/${e.testStore.id}`}>{e.testStore.name}</Link></dd>
                </div>
                <div>
                  <dt className="label">Control store</dt>
                  <dd>{e.controlStore ? <Link className="link" href={`/stores/${e.controlStore.id}`}>{e.controlStore.name}</Link> : <NoControlChip />}</dd>
                </div>
                <div>
                  <dt className="label">Start</dt>
                  <dd className="num">{e.startDate ? fmtDate(e.startDate) : <Missing reason="Start date not set" />}</dd>
                </div>
                <div>
                  <dt className="label">End</dt>
                  <dd className="num">
                    {e.endDate ? fmtDate(e.endDate) : <Missing reason="End date not set" />}
                    {days !== null && <span className="ml-1.5 text-xs text-ink-3">{days} days</span>}
                  </dd>
                </div>
                <div>
                  <dt className="label">Planned cost</dt>
                  <dd className="num">{e.cost !== null ? fmtMoney(e.cost, currency) : <span className="text-ink-3">Not provided</span>}</dd>
                </div>
              </dl>
            </div>
          </Panel>

          <Panel title="Status">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusChip status={e.status} />
                <span className="text-xs text-ink-3">
                  {e.status === "PLANNED" && "Not started. Baseline values can already be entered."}
                  {e.status === "RUNNING" && "The change is live in the test store."}
                  {e.status === "COMPLETED" && "Test period finished."}
                  {e.status === "STOPPED" && "Ended before the planned end — see notes for the reason."}
                </span>
              </div>
              {writer ? <StatusActions key={e.status} id={e.id} status={e.status} /> : <p className="text-xs text-ink-3">Your role cannot change the status.</p>}
            </div>
          </Panel>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Results" subtitle={`${e.testStore.name}${e.controlStore ? ` compared with ${e.controlStore.name}` : " — no control store"}`}>
            <ResultsPanel experiment={e} currency={currency} />
          </Panel>

          <Panel
            title={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />Limitations</span>}
            className="border-warn/40"
          >
            <div className="space-y-3 text-xs leading-5">
              <p className="font-medium text-ink">{NOT_A_SIGNIFICANCE_TEST}</p>
              {caseLims.length > 0 && (
                <div>
                  <div className="label mb-1">This experiment</div>
                  <ul className="list-disc space-y-1.5 pl-4 text-ink">
                    {caseLims.map((l) => <li key={l.text}>{l.text}</li>)}
                  </ul>
                </div>
              )}
              <div>
                <div className="label mb-1">Every experiment of this design</div>
                <ul className="list-disc space-y-1.5 pl-4 text-ink-2">
                  {generalLims.map((l) => <li key={l.text}>{l.text}</li>)}
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        {writer && metrics.length > 0 && (
          <Panel
            title="Enter results"
            subtitle="Four values per metric: test and control store, before and after"
            flush
            id="results-entry"
          >
            {!e.controlStore && (
              <div className="p-3 pb-0">
                <Notice tone="warn">Control fields are disabled because this experiment has no control store.</Notice>
              </div>
            )}
            <ResultsForm
              id={e.id}
              metrics={metrics}
              hasControl={e.controlStore !== null}
              currency={currency}
              testStoreName={e.testStore.name}
              controlStoreName={e.controlStore?.name ?? null}
            />
          </Panel>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Decision" actions={ended ? <DecisionChip decision={e.decision} /> : undefined}>
            {!ended ? (
              <Notice tone="unavailable" title="No decision yet">
                A decision (adopt, repeat, modify, reject, inconclusive) can be recorded once the experiment is completed or stopped.
              </Notice>
            ) : writer ? (
              <div className="space-y-3">
                <DecisionForm key={`${e.decision}`} id={e.id} decision={e.decision} decisionNote={e.decisionNote} hasStrategy={e.strategy !== null} />
                {e.decision === "ADOPT" && (
                  <p className="text-xs text-ink-3">“Adopt” records a management decision taken after this experiment. It does not mean the hypothesis is proven.</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <DecisionChip decision={e.decision} />
                {e.decisionNote && <p className="text-ink-2">{e.decisionNote}</p>}
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            <Panel title="Notes">
              <NotesForm id={e.id} notes={e.notes} readOnly={!writer} />
            </Panel>
            {ctx.role === "OWNER" && (
              <Panel title="Delete">
                <DeleteExperimentButton id={e.id} title={e.title} />
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
