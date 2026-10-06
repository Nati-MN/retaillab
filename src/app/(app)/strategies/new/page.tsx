import Link from "next/link";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { HypothesisForm } from "@/components/strategy/HypothesisForm";
import { getLibraryEntry } from "@/lib/strategy/library";
import { first, type SearchParams } from "@/server/period";
import { getStores } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Write a hypothesis" };

export default async function NewStrategyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const stores = await getStores(ctx.orgId);
  const library = getLibraryEntry(first(sp.library));
  const storeParam = first(sp.store);
  const defaultStoreId = stores.find((s) => s.id === storeParam)?.id;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/strategies" className="hover:text-ink">Strategies</Link>}
        title="Write a hypothesis"
        subtitle="Record your own idea in the same structure the rule engine uses: observation first, then the hypothesis, then how to test it."
      />
      {!canWrite(ctx.role) ? (
        <Notice tone="warn" title="Read-only access">Your role cannot create hypotheses. Ask an owner or analyst of this organization.</Notice>
      ) : stores.length === 0 ? (
        <EmptyState title="No stores yet" action={<Link className="btn-primary" href="/stores/new">Add a store</Link>}>
          A hypothesis belongs to a store. Add one first.
        </EmptyState>
      ) : (
        <Panel>
          <HypothesisForm stores={stores.map((s) => ({ id: s.id, name: s.name }))} library={library} currency={ctx.org.currency} defaultStoreId={defaultStoreId} />
        </Panel>
      )}
    </>
  );
}
