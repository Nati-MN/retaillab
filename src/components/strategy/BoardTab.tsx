import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMoney } from "@/lib/format";
import { computeScenario } from "@/lib/strategy/scenarioKinds";
import { EmptyState, Notice, Panel, Tag } from "@/components/ui";
import { deleteOpportunity, updateOpportunityStatus } from "@/server/actions/strategies";
import { first, type SearchParams } from "@/server/period";
import { getStores } from "@/server/queries";
import { ActionButton, ActionSelect } from "./ActionControls";
import { LEVEL_LABELS, OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABELS } from "./labels";
import { loadOpportunities, type OpportunityDTO } from "./loaders";
import { OpportunityForm } from "./OpportunityForm";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
}

export function OpportunityCard({ o, currency, canWrite, showStore = true }: { o: OpportunityDTO; currency: string; canWrite: boolean; showStore?: boolean }) {
  const base = o.scenario ? computeScenario(o.scenario.kind, o.scenario.variants.BASE, currency) : null;
  return (
    <article className="rounded border border-line bg-surface" aria-label={o.title}>
      <div className="space-y-2 p-2.5">
        <div>
          <h4 className="text-[13px] font-semibold leading-5">{o.title}</h4>
          {showStore && <Link href={`/stores/${o.storeId}`} className="text-xs text-ink-2 hover:underline">{o.storeName}</Link>}
        </div>

        <div>
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="label">Potential impact</span>
            <Tag kind="SCENARIO">Scenario</Tag>
          </div>
          {base?.headline ? (
            <p className="text-xs">
              <span className={cn("num text-[13px] font-semibold", base.headline.value !== null && base.headline.value < 0 && "text-neg")}>{base.headline.text}</span>{" "}
              <span className="text-ink-3">base scenario: {base.headline.label}. Not a forecast.</span>
            </p>
          ) : (
            <p className="text-xs text-ink-3">No calculated scenario is linked. See the description below.</p>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <Meta label="Est. cost">{o.estimatedCost !== null ? <span className="num">{fmtMoney(o.estimatedCost, currency)}</span> : <span className="text-ink-3">Not estimated</span>}</Meta>
          <Meta label="Effort">{LEVEL_LABELS[o.effort]}</Meta>
          <Meta label="Data conf.">{LEVEL_LABELS[o.dataConfidence]}</Meta>
        </dl>

        {canWrite ? (
          <div>
            <div className="label mb-0.5">Status</div>
            <ActionSelect
              action={updateOpportunityStatus}
              fields={{ id: o.id }}
              name="status"
              value={o.status}
              label={`Status of ${o.title}`}
              className="w-full"
              options={OPPORTUNITY_STATUSES.map((s) => ({ value: s, label: OPPORTUNITY_STATUS_LABELS[s] }))}
            />
          </div>
        ) : (
          <dl><Meta label="Status">{OPPORTUNITY_STATUS_LABELS[o.status]}</Meta></dl>
        )}
      </div>

      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show observation, hypothesis and experiment</span>
          <span className="hidden group-open:inline">Hide details</span>
        </summary>
        <dl className="space-y-2 px-2.5 pb-2.5">
          <Meta label="Observation">{o.observation}</Meta>
          <Meta label="Hypothesis">{o.hypothesis}</Meta>
          <Meta label="Potential impact scenario — assumptions">{o.impactScenario}</Meta>
          <Meta label="Suggested experiment">{o.suggestedExperiment}</Meta>
          <Meta label="Added">{fmtDate(o.createdAt)}</Meta>
        </dl>
      </details>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-2.5 py-1.5">
        <Link
          className="btn-secondary btn-sm"
          href={o.strategyId ? `/experiments/new?strategy=${o.strategyId}` : `/experiments/new?store=${o.storeId}`}
        >
          Create experiment
        </Link>
        {o.strategyId && <Link className="btn-ghost btn-sm" href={`/strategies?tab=hypotheses&store=${o.storeId}&open=${o.strategyId}#strategy-${o.strategyId}`}>Hypothesis</Link>}
        {canWrite && (
          <>
            <Link className="btn-ghost btn-sm" href={`/strategies?tab=board&edit=${o.id}`} scroll={false} aria-label={`Edit ${o.title}`}>Edit</Link>
            <ActionButton action={deleteOpportunity} fields={{ id: o.id }} className="btn-ghost btn-sm text-neg" confirm={`Delete the opportunity “${o.title}”?`} feedback="errors">
              Delete
            </ActionButton>
          </>
        )}
      </div>
    </article>
  );
}

export async function BoardTab({ orgId, currency, canWrite, sp }: { orgId: string; currency: string; canWrite: boolean; sp: SearchParams }) {
  const [opportunities, stores] = await Promise.all([loadOpportunities(orgId), getStores(orgId)]);
  const editId = first(sp.edit);
  const editing = editId ? opportunities.find((o) => o.id === editId) ?? null : null;
  const creating = first(sp.new) === "1";
  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-ink-2">
          Opportunities are ideas on their way to an experiment. Columns are statuses; change a status with the select on each card.
          <span className="text-ink-3"> Within a column, cards are sorted newest first. No score or ranking is computed — prioritising is your decision.</span>
        </p>
        {canWrite && !creating && !editing && stores.length > 0 && (
          <Link href="/strategies?tab=board&new=1" scroll={false} className="btn-primary">New opportunity</Link>
        )}
      </div>

      {canWrite && (creating || editing) && (
        <Panel title={editing ? `Edit opportunity — ${editing.title}` : "New opportunity"}>
          <OpportunityForm key={editing?.id ?? "new"} stores={storeOptions} opportunity={editing} currency={currency} />
        </Panel>
      )}
      {editId && !editing && <Notice tone="warn" title="Opportunity not found">It may have been deleted.</Notice>}

      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities yet">
          Add a hypothesis to the board from the Strategy engine tab, or create an opportunity yourself.
        </EmptyState>
      ) : (
        <div className="scroll-thin overflow-x-auto pb-2" role="region" aria-label="Opportunity board" tabIndex={0}>
          <div className="grid min-w-max grid-flow-col auto-cols-[272px] gap-2">
            {OPPORTUNITY_STATUSES.map((status) => {
              const items = opportunities.filter((o) => o.status === status);
              return (
                <section key={status} aria-label={`${OPPORTUNITY_STATUS_LABELS[status]} (${items.length})`} className="flex min-h-[120px] flex-col rounded-md border border-line bg-surface-2">
                  <header className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
                    <h3 className="text-xs font-semibold">{OPPORTUNITY_STATUS_LABELS[status]}</h3>
                    <span className="num rounded-sm bg-line/70 px-1 text-2xs text-ink-2">{items.length}</span>
                  </header>
                  <div className="flex-1 space-y-2 p-2">
                    {items.length === 0 ? <p className="px-0.5 py-1 text-xs text-ink-3">None.</p> : items.map((o) => <OpportunityCard key={o.id} o={o} currency={currency} canWrite={canWrite} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
