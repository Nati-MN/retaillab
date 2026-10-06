import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { ExperimentForm, type ExperimentFormInitial } from "@/components/experiments/ExperimentForm";
import { guessMetricUnit } from "@/lib/experiments/model";
import { db } from "@/server/db";
import { first, type SearchParams } from "@/server/period";
import { getStores } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "New experiment" };

export default async function NewExperimentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const strategyParam = first(sp.strategy);
  const storeParam = first(sp.store);
  const [stores, strategy] = await Promise.all([
    getStores(ctx.orgId),
    strategyParam
      ? db.strategy.findFirst({
          where: { id: strategyParam, organizationId: ctx.orgId },
          select: { id: true, title: true, hypothesis: true, storeId: true, metricsToWatch: true },
        })
      : Promise.resolve(null),
  ]);

  const header = (
    <PageHeader
      eyebrow={<Link href="/experiments" className="hover:underline">Experiments</Link>}
      title="New experiment"
      subtitle="Define the hypothesis, the stores, the period and the metrics before anything changes in the store."
    />
  );

  if (!canWrite(ctx.role)) {
    return <>{header}<Notice tone="unavailable" title="Read-only access">Your role cannot create experiments. Ask an owner or analyst.</Notice></>;
  }
  if (stores.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No stores yet" action={<Link href="/stores/new" className="btn-primary">Add a store</Link>}>
          An experiment needs a test store. Add at least one store first.
        </EmptyState>
      </>
    );
  }

  const metrics = (strategy?.metricsToWatch ?? []).map((name) => ({ name, unit: guessMetricUnit(name) }));
  const storeIds = new Set(stores.map((s) => s.id));
  const prefStore = strategy?.storeId ?? storeParam ?? "";
  const initial: ExperimentFormInitial = {
    title: strategy?.title ?? "",
    hypothesis: strategy?.hypothesis ?? "",
    testStoreId: storeIds.has(prefStore) ? prefStore : "",
    primary: metrics[0] ?? { name: "", unit: "EUR" },
    secondary: metrics.slice(1),
  };

  return (
    <>
      {header}
      {strategyParam && !strategy && (
        <Notice tone="warn" title="Strategy not found" className="mb-4">
          The linked strategy does not exist in this organization. The form below starts empty.
        </Notice>
      )}
      <ExperimentForm
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        initial={initial}
        strategy={strategy ? { id: strategy.id, title: strategy.title } : null}
        currency={ctx.org.currency}
      />
    </>
  );
}
