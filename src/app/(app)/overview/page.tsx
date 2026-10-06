import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { BarsChart, TrendChart } from "@/components/charts";
import { kpiDeltas, kpiTile } from "@/components/overview/kpiTiles";
import { WhatChangedList } from "@/components/overview/WhatChangedList";
import { Delta, EmptyState, Kpi, KpiGrid, Missing, Notice, PageHeader, Panel, RangeFilter, Sparkline, Tag } from "@/components/ui";
import { computeKpis, filterFacts, kpisByStore, seriesByMonth } from "@/lib/analytics/aggregate";
import { findAnomalies } from "@/lib/analytics/anomalies";
import { comparePeriods } from "@/lib/analytics/periodCompare";
import { COST_LABELS, COST_TYPES } from "@/lib/analytics/types";
import { calculateGrowthRate, sumOrNull } from "@/lib/calc";
import { seriesColor, storeColorMap } from "@/lib/colors";
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/format";
import { addMonths, monthLabel, monthLabelLong, monthRange, periodLabel, resolvePeriod } from "@/lib/period";
import { getPeriodContext, type SearchParams } from "@/server/period";
import { getCategoryFacts, getKnownEvents, getMonthFacts, getStores } from "@/server/queries";
import { requireOrg } from "@/server/session";

export const metadata = { title: "Overview" };

const min = (...keys: string[]) => keys.reduce((a, b) => (a < b ? a : b));

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const currency = ctx.org.currency;
  const [stores, pc] = await Promise.all([getStores(ctx.orgId), getPeriodContext(ctx.orgId, sp)]);

  const setupPending = !ctx.org.onboardingCompletedAt && !ctx.org.isDemo;
  const title = (
    <span className="flex flex-wrap items-center gap-2">
      Overview {ctx.org.isDemo && <Tag kind="DEMO" />}
    </span>
  );

  if (stores.length === 0 || !pc) {
    return (
      <>
        <PageHeader title={title} subtitle={`${ctx.org.name} · ${ctx.org.industry} · ${ctx.org.country}`} />
        {setupPending && (
          <Notice tone="info" className="mb-4" title="Setup is not finished" action={<Link href="/onboarding" className="btn-secondary btn-sm">Continue setup</Link>}>
            You can finish the guided setup or add stores and data directly.
          </Notice>
        )}
        {stores.length === 0 ? (
          <EmptyState title="No stores yet" action={<Link href="/stores/new" className="btn-primary"><Plus className="h-3.5 w-3.5" aria-hidden />Add your first store</Link>}>
            The overview is built from the monthly figures of your stores. Add a store, then enter its monthly revenue — nothing is shown until real data exists.
          </EmptyState>
        ) : (
          <EmptyState title="No monthly data yet" action={<Link href={stores.length === 1 ? `/stores/${stores[0]!.id}/data` : "/stores"} className="btn-primary">Enter monthly data</Link>}>
            {stores.length} store{stores.length === 1 ? " is" : "s are"} set up, but no monthly revenue has been entered. KPIs and charts appear as soon as the first month is recorded.
          </EmptyState>
        )}
      </>
    );
  }

  const { period, latest, earliest } = pc;
  // Charts keep at least 12 months of context even when a shorter range is selected.
  const chartFrom = min(period.from, addMonths(period.to, -11));
  const chartMonths = monthRange(chartFrom, period.to);
  // Anomaly detection needs each store's history (up to 36 months); comparisons need the two reference periods.
  const factsFrom = min(addMonths(latest, -35), period.previousYear.from, period.previous.from, addMonths(chartFrom, -12));
  const [facts, categoryFacts, events] = await Promise.all([
    getMonthFacts(ctx.orgId, { from: factsFrom, to: latest }),
    getCategoryFacts(ctx.orgId, { from: period.from, to: period.to }),
    getKnownEvents(ctx.orgId),
  ]);

  const cmp = comparePeriods(facts, stores, period);
  const k = cmp.current;
  const latestCmp = comparePeriods(facts, stores, resolvePeriod(latest, "1m"));
  const periodFacts = filterFacts(facts, period);
  const colors = storeColorMap(stores);
  const reporting = new Set(periodFacts.map((f) => f.storeId)).size;

  // ── Time series ──
  const byMonth = new Map(seriesByMonth(filterFacts(facts, { from: addMonths(chartFrom, -12), to: period.to }), stores).map((p) => [p.month, p]));
  const hasPrevYear = chartMonths.some((m) => byMonth.has(addMonths(m, -12)));
  const trend = chartMonths.map((m) => {
    const p = byMonth.get(m);
    return {
      label: monthLabel(m),
      revenue: p?.revenue ?? null,
      prevYear: byMonth.get(addMonths(m, -12))?.revenue ?? null,
      customers: p?.customers ?? null,
      basket: p?.averageBasket ?? null,
      margin: p?.grossMarginPct ?? null,
    };
  });
  const costTypes = COST_TYPES.filter((t) => facts.some((f) => f.month >= chartFrom && f.month <= period.to && f.costs[t] !== undefined));
  const costRows = chartMonths.map((m) => {
    const fs = facts.filter((f) => f.month === m);
    const row: { label: string } & Record<string, string | number | null> = { label: monthLabel(m) };
    for (const t of costTypes) row[t] = sumOrNull(fs.map((f) => f.costs[t]));
    return row;
  });
  const storesWithoutCosts = stores.filter((s) => periodFacts.some((f) => f.storeId === s.id) && periodFacts.filter((f) => f.storeId === s.id).every((f) => f.operatingCosts === null));

  // ── By store ──
  const perStore = kpisByStore(periodFacts, stores);
  const perStorePrevYear = kpisByStore(filterFacts(facts, period.previousYear), stores);
  const ranking = stores
    .map((s) => {
      const cur = perStore.get(s.id)!;
      const py = perStorePrevYear.get(s.id)!;
      const own = new Map(facts.filter((f) => f.storeId === s.id).map((f) => [f.month, f.revenue]));
      return {
        store: s,
        k: cur,
        growth: cur.months > 0 && py.months === cur.months ? calculateGrowthRate(cur.revenue, py.revenue) : null,
        spark: chartMonths.map((m) => own.get(m) ?? null),
      };
    })
    .sort((a, b) => (b.k.revenue ?? -1) - (a.k.revenue ?? -1));
  const storeBars = ranking.filter((r) => r.k.revenue !== null).map((r) => ({ label: r.store.name, value: r.k.revenue, color: colors[r.store.id] }));

  // ── By category ──
  const catTotals = new Map<string, number>();
  for (const f of categoryFacts) catTotals.set(f.categoryName, (catTotals.get(f.categoryName) ?? 0) + f.revenue);
  const catBars = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const catStores = new Set(categoryFacts.map((f) => f.storeId)).size;

  const anomalies = findAnomalies(facts, stores, events).slice(0, 6);
  const range = periodLabel(period);
  const growth = cmp.vsPreviousYear.revenue;
  const topStore = ranking[0];
  const topCat = catBars[0];

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          <>
            {ctx.org.name} · <span className="num">{stores.length}</span> store{stores.length === 1 ? "" : "s"} · <span className="num">{range}</span>
          </>
        }
        actions={<RangeFilter active={period.preset} from={period.from} to={period.to} min={earliest} max={latest} />}
      />
      <p className="-mt-2 mb-3 text-xs text-ink-3">
        Data is recorded per month.{period.preset === "1m" && <> “30 days” shows the latest complete month, <span className="num">{monthLabelLong(latest)}</span>.</>}{" "}
        {cmp.referencesCoincide
          ? <>Compared with <span className="num">{periodLabel(period.previous)}</span> — for a 12-month range the previous period and the previous year are the same months.</>
          : <>Compared with <span className="num">{periodLabel(period.previous)}</span> (previous period) and <span className="num">{periodLabel(period.previousYear)}</span> (previous year).</>}
        A comparison is shown as — when that period is not fully covered by data.
      </p>
      {setupPending && (
        <Notice tone="info" className="mb-3" title="Setup is not finished" action={<Link href="/onboarding" className="btn-secondary btn-sm">Continue setup</Link>}>
          Product categories have not been confirmed yet.
        </Notice>
      )}
      {reporting < stores.length && (
        <Notice tone="warn" className="mb-3">
          <span className="num">{reporting}</span> of <span className="num">{stores.length}</span> stores have revenue in this period. Totals cover reporting stores only.
        </Notice>
      )}

      <KpiGrid cols={5}>
        <Kpi {...kpiTile(cmp, "revenue", currency, { formula: `Σ monthly revenue · ${range}`, size: "lg" })} />
        <Kpi
          label="Revenue this month" size="lg"
          value={latestCmp.current.revenue === null ? null : fmtMoney(latestCmp.current.revenue, currency)}
          deltas={[
            { value: latestCmp.vsPrevious.revenue, label: "prev. month" },
            { value: latestCmp.vsPreviousYear.revenue, label: "prev. year" },
          ]}
          formula={`Latest month with data · ${monthLabelLong(latest)}`}
        />
        <Kpi
          label="Revenue growth" size="lg"
          value={growth === null ? null : fmtSignedPct(growth)}
          missingReason="No full previous year"
          deltas={cmp.referencesCoincide ? undefined : [{ value: cmp.vsPrevious.revenue, label: "revenue vs prev. period" }]}
          formula="(Revenue − prev. year) / prev. year"
        />
        <Kpi {...kpiTile(cmp, "averageBasket", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "customers", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "revenuePerSqm", currency, { label: "Revenue / m² · month", formula: "Avg. monthly revenue / Σ sales area" })} />
        <Kpi {...kpiTile(cmp, "revenuePerEmployee", currency, { label: "Revenue / employee · month", formula: "Avg. monthly revenue / Σ employees" })} />
        <Kpi {...kpiTile(cmp, "grossMarginPct", currency)} />
        <Kpi {...kpiTile(cmp, "operatingProfit", currency)} />
        <Kpi
          label="Number of stores"
          value={fmtNumber(stores.length)}
          formula={`${reporting} reporting in period`}
        >
          <div className="text-xs text-ink-3"><Link href="/stores" className="link">All stores</Link></div>
        </Kpi>
      </KpiGrid>
      <p className="mb-4 mt-1.5 text-xs text-ink-3">
        <Tag kind="CALCULATED" className="mr-1.5" />
        Every figure is computed from the monthly values entered for your stores. A KPI is shown as missing when any store in the period lacks one of its inputs — partial totals are not reported. Annual revenue is the sum of the entered months.
      </p>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Monthly revenue" subtitle={`All stores · ${monthLabel(chartFrom)} – ${monthLabel(period.to)}`} className="xl:col-span-2">
          <TrendChart
            data={trend}
            series={[
              { key: "revenue", label: "Revenue", color: seriesColor(0) },
              ...(hasPrevYear ? [{ key: "prevYear", label: "Same month, previous year", color: "rgb(var(--ink-3))", dashed: true }] : []),
            ]}
            format="money" currency={currency} height={300}
            summary={
              `Total monthly revenue of all reporting stores, ${monthLabel(chartFrom)} to ${monthLabel(period.to)}.` +
              (hasPrevYear ? " The dashed line is the same month one year earlier." : " No data from one year earlier is available for comparison.")
            }
          />
        </Panel>
        <Panel
          title="What changed" kind="FACT"
          subtitle="Months that deviate from a store's own typical change"
          actions={<Link href="/analytics?tab=anomalies" className="btn-ghost btn-sm">All <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
          flush
        >
          <WhatChangedList anomalies={anomalies} currency={currency} />
        </Panel>
      </div>

      <Panel title="Store ranking" subtitle={`${range} · sorted by revenue`} className="mt-3" flush actions={<Link href="/compare" className="btn-ghost btn-sm">Compare <ArrowRight className="h-3 w-3" aria-hidden /></Link>}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Store</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Growth YoY</th>
                <th className="text-right">Customers / day</th>
                <th className="text-right">Basket</th>
                <th className="text-right">Rev / m² · mo</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Revenue trend</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.store.id}>
                  <td className="num text-ink-3">{r.k.revenue === null ? "" : i + 1}</td>
                  <td className="whitespace-nowrap">
                    <Link href={`/stores/${r.store.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors[r.store.id] }} />
                      {r.store.name}
                    </Link>
                    <span className="ml-2 font-mono text-2xs text-ink-3">{r.store.code}</span>
                  </td>
                  <td className="r">{r.k.revenue === null ? <Missing reason="No revenue in this period" /> : fmtMoney(r.k.revenue, currency)}</td>
                  <td className="r"><Delta value={r.growth} /></td>
                  <td className="r">{r.k.customersPerDay === null ? <Missing reason="Customers or open days missing" /> : fmtNumber(r.k.customersPerDay)}</td>
                  <td className="r">{r.k.averageBasket === null ? <Missing reason="Transactions missing" /> : fmtMoney(r.k.averageBasket, currency, 2)}</td>
                  <td className="r">{r.k.revenuePerSqm === null ? <Missing reason="Sales area missing" /> : fmtMoney(r.k.revenuePerSqm, currency)}</td>
                  <td className="r">{r.k.grossMarginPct === null ? <Missing reason="Margin not entered" /> : fmtPct(r.k.grossMarginPct)}</td>
                  <td className="text-right"><span className="inline-flex justify-end" style={{ color: colors[r.store.id] }}><Sparkline values={r.spark} width={104} height={22} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          Growth YoY = revenue vs the same months one year earlier, shown only when that year is fully covered. Trend: monthly revenue, {monthLabel(chartFrom)} – {monthLabel(period.to)}, each on its own scale. A ranking describes the data; it does not explain it.
        </p>
      </Panel>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Revenue by store" subtitle={range}>
          {storeBars.length > 0 ? (
            <BarsChart
              data={storeBars} format="money" currency={currency} horizontal showValues height={Math.max(160, storeBars.length * 34 + 40)}
              summary={`Revenue per store, ${range}.${topStore?.k.revenue != null ? ` Highest: ${topStore.store.name} with ${fmtMoneyCompact(topStore.k.revenue, currency)}.` : ""}`}
            />
          ) : <Notice tone="unavailable">No store has revenue in this period.</Notice>}
        </Panel>
        <Panel title="Revenue by category" subtitle={catBars.length > 0 ? `${range} · ${catStores} of ${stores.length} stores report categories` : range}>
          {catBars.length > 0 ? (
            <BarsChart
              data={catBars.map((c) => ({ ...c, color: seriesColor(0) }))} format="money" currency={currency} horizontal showValues height={Math.max(160, catBars.length * 26 + 40)}
              summary={`Category revenue summed over the ${catStores} store${catStores === 1 ? "" : "s"} that report it, ${range}.${topCat ? ` Largest: ${topCat.label}.` : ""}`}
            />
          ) : (
            <Notice tone="unavailable" title="No category revenue recorded">
              Category revenue is entered per store and month on a store’s data page. Without it, assortment cannot be analysed.
            </Notice>
          )}
        </Panel>

        <Panel title="Customer traffic" subtitle="Customers per month, all stores">
          {trend.some((t) => t.customers !== null) ? (
            <TrendChart
              data={trend} series={[{ key: "customers", label: "Customers", color: seriesColor(1) }]} format="number" height={210}
              summary="Total customers per month across all stores. A month is left blank when any reporting store has no customer count for it."
            />
          ) : <Notice tone="unavailable" title="Customer counts are incomplete">A total is only shown for months in which every reporting store has a customer count. Enter customers per month on each store’s data page.</Notice>}
        </Panel>
        <Panel title="Average basket" subtitle="Revenue / transactions, all stores">
          {trend.some((t) => t.basket !== null) ? (
            <TrendChart
              data={trend} series={[{ key: "basket", label: "Average basket", color: seriesColor(2) }]} format="money2" currency={currency} height={210} zeroBased={false}
              summary="Average basket per month = total revenue / total transactions. The axis does not start at zero so that small changes are visible."
            />
          ) : <Notice tone="unavailable" title="Transactions are incomplete">The basket needs a transaction count from every reporting store for the month.</Notice>}
        </Panel>

        <Panel title="Gross margin" subtitle="Revenue-weighted, all stores">
          {trend.some((t) => t.margin !== null) ? (
            <TrendChart
              data={trend} series={[{ key: "margin", label: "Gross margin", color: seriesColor(3) }]} format="pct2" height={210} zeroBased={false}
              summary="Revenue-weighted gross margin per month over the stores that entered a margin. The axis does not start at zero; the visible range is narrow."
            />
          ) : <Notice tone="unavailable" title="No gross margin recorded">Without a margin, gross profit and operating profit cannot be calculated.</Notice>}
        </Panel>
        <Panel title="Operating costs by type" subtitle="Per month, stacked">
          {costTypes.length > 0 ? (
            <>
              <BarsChart
                data={costRows} series={costTypes.map((t) => ({ key: t, label: COST_LABELS[t], color: seriesColor(COST_TYPES.indexOf(t)) }))} stacked format="money" currency={currency} height={210}
                summary="Operating costs per month by cost type, summed over the stores that entered them."
              />
              {storesWithoutCosts.length > 0 && (
                <p className="mt-1 text-xs text-warn">No costs entered for: {storesWithoutCosts.map((s) => s.name).join(", ")}. The bars exclude these stores.</p>
              )}
            </>
          ) : <Notice tone="unavailable" title="No operating costs recorded">Cost lines are entered per store and month. Without them, operating profit and break-even cannot be calculated.</Notice>}
        </Panel>
      </div>
    </>
  );
}
