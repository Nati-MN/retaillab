import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Table2 } from "lucide-react";
import { StoreExperimentsSection } from "@/components/experiments/StoreExperimentsSection";
import { StoreCompetitionSection, StoreLocationSection, StoreResearchSection } from "@/components/location/StoreLocationSections";
import { CategoriesTab } from "@/components/stores/scorecard/CategoriesTab";
import { CostsTab } from "@/components/stores/scorecard/CostsTab";
import { CustomersTab } from "@/components/stores/scorecard/CustomersTab";
import { PerformanceTab } from "@/components/stores/scorecard/PerformanceTab";
import { StoreStrategiesSection } from "@/components/strategy/StoreStrategiesSection";
import { Missing, Notice, RangeFilter, Skeleton, TabNav, Tag } from "@/components/ui";
import { STORE_TYPE_LABELS } from "@/lib/analytics/types";
import { storeColorMap } from "@/lib/colors";
import { fmtDate, fmtNumber } from "@/lib/format";
import { monthLabelLong } from "@/lib/period";
import { first, getPeriodContext, type SearchParams } from "@/server/period";
import { getStore, getStores } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";
import { getStoreQuality } from "@/server/storeQuality";

const TABS = [
  { key: "performance", label: "Performance" },
  { key: "customers", label: "Customers" },
  { key: "categories", label: "Categories" },
  { key: "costs", label: "Costs" },
  { key: "location", label: "Location" },
  { key: "competition", label: "Competition" },
  { key: "research", label: "Research" },
  { key: "strategies", label: "Strategies" },
  { key: "experiments", label: "Experiments" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const PERIOD_TABS: ReadonlySet<TabKey> = new Set(["performance", "customers", "categories", "costs"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const store = await getStore(ctx.orgId, (await params).id);
  return { title: store?.name ?? "Store" };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2">
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px]">{children}</dd>
    </div>
  );
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const sp = await searchParams;
  const [store, stores, pc] = await Promise.all([getStore(ctx.orgId, id), getStores(ctx.orgId), getPeriodContext(ctx.orgId, sp)]);
  if (!store) notFound();

  const currency = ctx.org.currency;
  const canEdit = canWrite(ctx.role);
  const tabParam = first(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "performance";
  const base = `/stores/${store.id}`;
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to"] as const) {
    const v = first(sp[k]);
    if (v) keep.set(k, v);
  }
  const href = (key: string) => {
    const p = new URLSearchParams(keep);
    if (key !== "performance") p.set("tab", key);
    const q = p.toString();
    return q ? `${base}?${q}` : base;
  };
  const color = storeColorMap(stores)[store.id];
  const section = { orgId: ctx.orgId, store, currency };
  const hours = store.opensAt && store.closesAt ? `${store.opensAt}–${store.closesAt}` : null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label mb-1"><Link href="/stores" className="hover:text-ink">Stores</Link> / {store.code}</div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl leading-7">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            {store.name}
            {store.isDemo && <Tag kind="DEMO" />}
          </h1>
          <p className="mt-0.5 text-ink-2">
            <span className="font-mono text-xs">{store.code}</span> · {STORE_TYPE_LABELS[store.type]} · {store.city}
          </p>
        </div>
        {canEdit && (
          <div className="no-print flex items-center gap-2">
            <Link href={`${base}/edit`} className="btn-secondary"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</Link>
            <Link href={`${base}/data`} className="btn-primary"><Table2 className="h-3.5 w-3.5" aria-hidden />Enter data</Link>
          </div>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        <Fact label="Address"><span title={`${store.address}, ${store.city}`}>{store.address}</span></Fact>
        <Fact label="Opening hours">
          {hours ? <span className="num">{hours}{store.openDaysPerWeek !== null && <span className="text-ink-3"> · {store.openDaysPerWeek} days/week</span>}</span> : <><Missing reason="Opening hours not provided" /> <span className="text-xs text-ink-3">Missing</span></>}
        </Fact>
        <Fact label="Sales area">{store.areaSqm === null ? <><Missing reason="Sales area not provided" /> <span className="text-xs text-ink-3">Missing</span></> : <span className="num">{fmtNumber(store.areaSqm)} m²</span>}</Fact>
        <Fact label="Employees">{store.employees === null ? <><Missing reason="Employees not provided" /> <span className="text-xs text-ink-3">Missing</span></> : <span className="num">{fmtNumber(store.employees)}</span>}</Fact>
        <Fact label="Parking">{store.parkingSpaces === null ? <><Missing reason="Parking spaces not provided" /> <span className="text-xs text-ink-3">Missing</span></> : <span className="num">{store.parkingSpaces === 0 ? "None (0 spaces)" : `${fmtNumber(store.parkingSpaces)} spaces`}</span>}</Fact>
        <Fact label="Opened">{store.openingDate ? <span className="num">{fmtDate(store.openingDate)}</span> : <><Missing reason="Opening date not provided" /> <span className="text-xs text-ink-3">Missing</span></>}</Fact>
      </dl>

      <TabNav label="Store sections" active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key) }))} />

      {PERIOD_TABS.has(tab) && pc && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <RangeFilter active={pc.period.preset} from={pc.period.from} to={pc.period.to} min={pc.earliest} max={pc.latest} />
          <p className="text-xs text-ink-3">
            Monthly data{pc.period.preset === "1m" && <> · “30 days” = latest complete month, <span className="num">{monthLabelLong(pc.latest)}</span></>}
          </p>
        </div>
      )}

      <Suspense key={`${tab}-${keep.toString()}`} fallback={<div aria-busy="true" className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}>
        {PERIOD_TABS.has(tab) ? (
          pc ? (
            <PeriodTab tab={tab} props={{ orgId: ctx.orgId, store, stores, currency, period: pc.period, latest: pc.latest, canEdit }} />
          ) : (
            <NoData storeId={store.id} orgId={ctx.orgId} canEdit={canEdit} tab={tab} />
          )
        ) : tab === "location" ? (
          <StoreLocationSection {...section} />
        ) : tab === "competition" ? (
          <StoreCompetitionSection {...section} />
        ) : tab === "research" ? (
          <StoreResearchSection {...section} />
        ) : tab === "strategies" ? (
          <StoreStrategiesSection {...section} />
        ) : (
          <StoreExperimentsSection {...section} />
        )}
      </Suspense>
    </>
  );
}

async function PeriodTab({ tab, props }: { tab: TabKey; props: Parameters<typeof CustomersTab>[0] }) {
  if (tab === "customers") return <CustomersTab {...props} />;
  if (tab === "categories") return <CategoriesTab {...props} />;
  if (tab === "costs") return <CostsTab {...props} />;
  const quality = (await getStoreQuality(props.orgId, [props.store])).get(props.store.id)!;
  return <PerformanceTab {...props} quality={quality} />;
}

/** The organization has no monthly data at all: only completeness can be shown. */
async function NoData({ storeId, orgId, canEdit, tab }: { storeId: string; orgId: string; canEdit: boolean; tab: TabKey }) {
  const store = (await getStore(orgId, storeId))!;
  const quality = (await getStoreQuality(orgId, [store])).get(store.id)!;
  const { DataQualityPanel } = await import("@/components/stores/DataQualityPanel");
  return (
    <>
      <Notice tone="unavailable" className="mb-4" title="No monthly data yet" action={canEdit ? <Link href={`/stores/${storeId}/data`} className="btn-primary btn-sm">Enter data</Link> : undefined}>
        Performance, customers, categories and costs are calculated from monthly figures. Nothing is shown until the first month of revenue is recorded.
      </Notice>
      {tab === "performance" && <DataQualityPanel quality={quality} storeId={storeId} canEdit={canEdit} />}
    </>
  );
}
