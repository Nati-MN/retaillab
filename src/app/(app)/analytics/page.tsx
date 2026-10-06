import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, TabNav, Tag } from "@/components/ui";
import { analyticsHref, one, type SP, type TabProps } from "@/components/analytics/shared";
import { getLatestMonth, getStores } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { AnomaliesTab } from "./AnomaliesTab";
import { CategoriesTab } from "./CategoriesTab";
import { CostsTab } from "./CostsTab";
import { ForecastTab } from "./ForecastTab";
import { PatternsTab } from "./PatternsTab";
import { SeasonalityTab } from "./SeasonalityTab";

export const metadata: Metadata = { title: "Analytics" };

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "costs", label: "Costs" },
  { key: "anomalies", label: "Anomalies" },
  { key: "seasonality", label: "Seasonality" },
  { key: "forecast", label: "Forecast" },
  { key: "patterns", label: "Multi-store patterns" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === one(sp.tab))?.key ?? "categories";
  const [stores, latest] = await Promise.all([getStores(ctx.orgId), getLatestMonth(ctx.orgId)]);
  // The store id comes from the URL: accept it only if it is one of this organization's stores.
  const store = stores.find((s) => s.id === one(sp.store)) ?? null;

  const props: TabProps = {
    orgId: ctx.orgId,
    currency: ctx.org.currency,
    isDemo: ctx.org.isDemo,
    country: ctx.org.country,
    aiExplanations: ctx.org.aiExplanations,
    stores,
    store,
    sp,
  };

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Analytics {ctx.org.isDemo && <Tag kind="DEMO" />}
          </span>
        }
        subtitle="Descriptive analysis of recorded data. Observations and calculations only — explanations are labelled as hypotheses, projections as forecasts."
      />
      <TabNav
        label="Analytics sections"
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: analyticsHref(sp, { tab: t.key === "categories" ? null : t.key }, ["store", "range", "from", "to"]),
        }))}
      />
      {stores.length === 0 || !latest ? (
        <EmptyState
          title={stores.length === 0 ? "No stores yet" : "No revenue data yet"}
          action={<Link href={stores.length === 0 ? "/stores/new" : "/stores"} className="btn-primary btn-sm">{stores.length === 0 ? "Add a store" : "Enter monthly data"}</Link>}
        >
          Analytics are calculated from monthly store data. Nothing is shown until data has been recorded.
        </EmptyState>
      ) : (
        <>
          {tab === "categories" && <CategoriesTab {...props} />}
          {tab === "costs" && <CostsTab {...props} />}
          {tab === "anomalies" && <AnomaliesTab {...props} />}
          {tab === "seasonality" && <SeasonalityTab {...props} />}
          {tab === "forecast" && <ForecastTab {...props} />}
          {tab === "patterns" && <PatternsTab {...props} />}
        </>
      )}
    </>
  );
}
