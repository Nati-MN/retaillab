import Link from "next/link";
import type { StoreDTO } from "@/lib/analytics/types";
import { EmptyState, Panel, Tag } from "@/components/ui";
import { getLatestMonth, getStores } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";
import { OpportunityCard } from "./BoardTab";
import { loadOpportunities, loadSignalSources, loadStrategies } from "./loaders";
import { StrategyCard } from "./StrategyCard";

/** Props shared by all store-detail sections owned by other feature areas. */
export interface StoreSectionProps {
  orgId: string;
  store: StoreDTO;
  currency: string;
}

/** Store detail tab: this store's hypotheses and opportunities. */
export async function StoreStrategiesSection({ orgId, store, currency }: StoreSectionProps) {
  const ctx = await requireOrg();
  const writer = ctx.orgId === orgId && canWrite(ctx.role);
  const [strategies, opportunities, latest, stores, sources] = await Promise.all([
    loadStrategies(orgId, { storeId: store.id }),
    loadOpportunities(orgId, { storeId: store.id }),
    getLatestMonth(orgId),
    getStores(orgId),
    loadSignalSources(orgId, [store.id]),
  ]);
  const storeIds = stores.map((s) => s.id);

  return (
    <div className="space-y-3">
      <Panel
        title="Hypotheses"
        kind="HYPOTHESIS"
        subtitle="Ideas to test for this store — produced by the deterministic rule engine or written by a user. None is validated unless its status says so."
        actions={
          <>
            <Link className="btn-secondary btn-sm" href={`/strategies?tab=hypotheses&store=${store.id}`}>Run analysis</Link>
            <Link className="btn-ghost btn-sm" href="/strategies?tab=library">Library</Link>
            {writer && <Link className="btn-ghost btn-sm" href={`/strategies/new?store=${store.id}`}>Write a hypothesis</Link>}
          </>
        }
        bodyClassName="space-y-2"
      >
        {strategies.length === 0 ? (
          <EmptyState title="No hypotheses yet" action={<Link className="btn-secondary" href={`/strategies?tab=hypotheses&store=${store.id}`}>Open the strategy engine</Link>}>
            No rule has produced a hypothesis for {store.name}, and none has been written by a user. Rules stay silent when the data they need is missing
            or when the store does not differ from its peers.
          </EmptyState>
        ) : (
          strategies.map((s) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              currency={currency}
              canWrite={writer}
              latestMonth={latest}
              signalSources={sources.get(store.id) ?? []}
              compareStoreIds={storeIds}
              hideStore
            />
          ))
        )}
      </Panel>

      <Panel
        title="Opportunities"
        subtitle="This store's entries on the opportunity board, newest first. No score is computed."
        actions={
          <>
            <Tag kind="SCENARIO" />
            <Link className="btn-secondary btn-sm" href="/strategies?tab=board">Open board</Link>
          </>
        }
      >
        {opportunities.length === 0 ? (
          <p className="text-xs text-ink-3">No opportunities for this store yet. Add a hypothesis to the board to track it towards an experiment.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {opportunities.map((o) => <OpportunityCard key={o.id} o={o} currency={currency} canWrite={writer} showStore={false} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
