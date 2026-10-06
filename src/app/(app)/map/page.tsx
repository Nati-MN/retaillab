import Link from "next/link";
import { MapClient } from "@/components/map/MapClient";
import { MAP_LAYERS, type MapLayerKey, type MapPlace, type MapStore } from "@/components/map/types";
import { EmptyState, PageHeader, Tag } from "@/components/ui";
import { computeKpis } from "@/lib/analytics/aggregate";
import { classifyGrowth, markerDiameter } from "@/lib/analytics/mapMarkers";
import { calculateGrowthRate } from "@/lib/calc";
import { storeColorMap } from "@/lib/colors";
import { fmtDistance, fmtMoney, fmtMoneyCompact, fmtNumber, fmtSignedPct } from "@/lib/format";
import { addMonths, monthLabelLong } from "@/lib/period";
import { getMapsProvider } from "@/lib/providers/registry";
import { SIGNAL_LABELS } from "@/lib/research/findings";
import { getLatestMonth, getMonthFacts, getStores } from "@/server/queries";
import { getCompetitors, getSignals } from "@/server/research/queries";
import { requireOrg } from "@/server/session";

export const metadata = { title: "Map" };

const LAYER_KEYS = new Set<string>(MAP_LAYERS.map((l) => l.key));

export default async function MapPage() {
  const ctx = await requireOrg();
  const currency = ctx.org.currency;
  const [stores, latest, competitors, signals] = await Promise.all([
    getStores(ctx.orgId), getLatestMonth(ctx.orgId), getCompetitors(ctx.orgId), getSignals(ctx.orgId),
  ]);

  const header = (
    <PageHeader
      title="Map"
      eyebrow={ctx.org.isDemo ? <Tag kind="DEMO" /> : undefined}
      subtitle="Stores with their latest monthly revenue and year-over-year direction. Surrounding places come only from stored research and carry their source."
    />
  );
  if (stores.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No stores yet" action={<Link href="/stores/new" className="btn-primary btn-sm">Add a store</Link>}>Stores with coordinates appear on the map.</EmptyState>
      </>
    );
  }

  const facts = latest ? await getMonthFacts(ctx.orgId, { from: addMonths(latest, -12), to: latest }) : [];
  const colors = storeColorMap(stores);
  const latestRevenue = new Map<string, number>();
  for (const f of facts) if (f.month === latest) latestRevenue.set(f.storeId, f.revenue);
  const maxRevenue = latestRevenue.size > 0 ? Math.max(...latestRevenue.values()) : null;

  const mapStores: MapStore[] = stores.map((s) => {
    const now = facts.filter((f) => f.storeId === s.id && f.month === latest);
    const yearAgo = latest ? facts.find((f) => f.storeId === s.id && f.month === addMonths(latest, -12)) : undefined;
    const k = computeKpis(now, [s]);
    const growth = calculateGrowthRate(k.revenue, yearAgo?.revenue);
    const others = stores.filter((o) => o.id !== s.id).slice(0, 2).map((o) => o.id);
    return {
      id: s.id, name: s.name, city: s.city, isDemo: s.isDemo, latitude: s.latitude, longitude: s.longitude,
      color: colors[s.id]!,
      diameter: markerDiameter(k.revenue, maxRevenue),
      growthClass: classifyGrowth(growth),
      revenue: k.revenue === null ? null : fmtMoney(k.revenue, currency),
      growth: growth === null ? null : fmtSignedPct(growth),
      customersPerDay: k.customersPerDay === null ? null : fmtNumber(k.customersPerDay),
      averageBasket: k.averageBasket === null ? null : fmtMoney(k.averageBasket, currency, 2),
      revenuePerSqm: k.revenuePerSqm === null ? null : fmtMoney(k.revenuePerSqm, currency),
      compareHref: `/compare?stores=${[s.id, ...others].join(",")}`,
    };
  });

  const places: MapPlace[] = [
    ...competitors.map((c): MapPlace => ({
      id: `c-${c.id}`, layer: "COMPETITOR", storeId: c.storeId, name: c.name, category: `Competitor · ${c.category}`, detail: null,
      openingHours: c.openingHours, latitude: c.latitude, longitude: c.longitude, distance: fmtDistance(c.distanceM), isDemo: c.isDemo, source: c.source,
    })),
    ...signals.filter((s) => LAYER_KEYS.has(s.type)).map((s): MapPlace => ({
      id: `s-${s.id}`, layer: s.type as MapLayerKey, storeId: s.storeId, name: s.name, category: SIGNAL_LABELS[s.type].group, detail: s.detail,
      openingHours: null, latitude: s.latitude, longitude: s.longitude, distance: s.distanceM === null ? null : fmtDistance(s.distanceM), isDemo: s.isDemo, source: s.source,
    })),
  ];

  const sizeLegend = maxRevenue
    ? [1, 0.5, 0.25].map((share) => ({ diameter: markerDiameter(maxRevenue * share, maxRevenue), label: fmtMoneyCompact(maxRevenue * share, currency) }))
    : [];
  const maps = getMapsProvider();

  return (
    <>
      {header}
      <MapClient
        tileUrl={maps.tileUrl}
        attribution={maps.attribution}
        maxZoom={maps.maxZoom}
        stores={mapStores}
        places={places}
        monthLabel={latest ? monthLabelLong(latest) : null}
        sizeLegend={sizeLegend}
      />
    </>
  );
}
