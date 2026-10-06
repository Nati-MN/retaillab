import Link from "next/link";
import { PageHeader, TabNav } from "@/components/ui";
import { BoardTab } from "@/components/strategy/BoardTab";
import { BreakEvenTab } from "@/components/strategy/BreakEvenTab";
import { HypothesesTab } from "@/components/strategy/HypothesesTab";
import { LibraryTab } from "@/components/strategy/LibraryTab";
import { OpportunityTab } from "@/components/strategy/OpportunityTab";
import { SimulatorTab } from "@/components/strategy/SimulatorTab";
import { STRATEGY_LIBRARY } from "@/lib/strategy/library";
import { db } from "@/server/db";
import { first, type SearchParams } from "@/server/period";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Strategies" };

const TABS = [
  { key: "hypotheses", label: "Strategy engine" },
  { key: "library", label: "Library" },
  { key: "simulator", label: "Simulator" },
  { key: "break-even", label: "Break-even" },
  { key: "opportunity", label: "Revenue opportunity" },
  { key: "board", label: "Opportunity board" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function StrategiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const requested = first(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "hypotheses";
  const writer = canWrite(ctx.role);
  const currency = ctx.org.currency;

  const [strategyCount, opportunityCount] = await Promise.all([
    db.strategy.count({ where: { organizationId: ctx.orgId } }),
    db.opportunity.count({ where: { organizationId: ctx.orgId } }),
  ]);
  const counts: Partial<Record<TabKey, number>> = { hypotheses: strategyCount, library: STRATEGY_LIBRARY.length, board: opportunityCount };

  return (
    <>
      <PageHeader
        title="Strategies"
        subtitle="Hypotheses from your data, a library of things retailers test, and calculators that show the arithmetic of your own assumptions. Nothing on this page is a prediction."
        actions={writer ? <Link href="/strategies/new" className="btn-secondary">Write a hypothesis</Link> : undefined}
      />
      <TabNav
        label="Strategy sections"
        active={tab}
        items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/strategies?tab=${t.key}`, count: counts[t.key] }))}
      />
      {tab === "hypotheses" && <HypothesesTab orgId={ctx.orgId} currency={currency} canWrite={writer} isDemo={ctx.org.isDemo} sp={sp} />}
      {tab === "library" && <LibraryTab sp={sp} canWrite={writer} />}
      {tab === "simulator" && <SimulatorTab orgId={ctx.orgId} currency={currency} canWrite={writer} sp={sp} />}
      {tab === "break-even" && <BreakEvenTab orgId={ctx.orgId} currency={currency} />}
      {tab === "opportunity" && <OpportunityTab orgId={ctx.orgId} currency={currency} />}
      {tab === "board" && <BoardTab orgId={ctx.orgId} currency={currency} canWrite={writer} sp={sp} />}
    </>
  );
}
