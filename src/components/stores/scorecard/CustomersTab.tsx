import Link from "next/link";
import { BarsChart, TrendChart } from "@/components/charts";
import { kpiTile } from "@/components/overview/kpiTiles";
import { Kpi, KpiGrid, Notice, Panel, Tag } from "@/components/ui";
import { seriesByMonth } from "@/lib/analytics/aggregate";
import { comparePeriods } from "@/lib/analytics/periodCompare";
import { seriesColor, storeColorMap } from "@/lib/colors";
import { fmtNumber } from "@/lib/format";
import { addMonths, monthLabel, monthRange, periodLabel } from "@/lib/period";
import { getHourlyProfile, getMonthFacts } from "@/server/queries";
import { minMonth, type ScorecardProps } from "./shared";

export async function CustomersTab({ orgId, store, stores, currency, period, latest, canEdit }: ScorecardProps) {
  const chartFrom = minMonth(period.from, addMonths(period.to, -11));
  const chartMonths = monthRange(chartFrom, period.to);
  const hourlyFrom = addMonths(latest, -11);
  const [facts, hourly] = await Promise.all([
    getMonthFacts(orgId, { storeIds: [store.id], from: minMonth(period.previousYear.from, period.previous.from, chartFrom), to: period.to }),
    getHourlyProfile(orgId, { storeIds: [store.id], from: hourlyFrom, to: latest }),
  ]);
  const cmp = comparePeriods(facts, [store], period);
  const byMonth = new Map(seriesByMonth(facts, [store]).map((p) => [p.month, p]));
  const rows = chartMonths.map((m) => {
    const p = byMonth.get(m);
    return {
      label: monthLabel(m),
      customersPerDay: p?.customersPerDay ?? null,
      transactionsPerDay: p?.transactionsPerDay ?? null,
      basket: p?.averageBasket ?? null,
      perCustomer: p?.revenuePerCustomer ?? null,
    };
  });
  const color = storeColorMap(stores)[store.id] ?? seriesColor(0);
  const hasTraffic = rows.some((r) => r.customersPerDay !== null || r.transactionsPerDay !== null);
  const hasBasket = rows.some((r) => r.basket !== null || r.perCustomer !== null);
  const hourlyRows = hourly.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.transactions, color }));
  const peak = hourly.length > 0 ? hourly.reduce((a, b) => (b.transactions > a.transactions ? b : a)) : null;
  const dataLink = canEdit ? <Link href={`/stores/${store.id}/data`} className="btn-secondary btn-sm">Enter data</Link> : undefined;

  return (
    <>
      <KpiGrid cols={4}>
        <Kpi {...kpiTile(cmp, "customersPerDay", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "transactionsPerDay", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "averageBasket", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "revenuePerCustomer", currency, { size: "lg" })} />
      </KpiGrid>
      <p className="mb-3 mt-1.5 text-xs text-ink-3">
        <Tag kind="CALCULATED" className="mr-1.5" />
        <span className="num">{periodLabel(period)}</span>. Per-day figures divide the monthly total by the open days entered for that month. Customers and transactions are the counts you entered; RetailLab does not estimate them.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Customers and transactions per day" subtitle={`${monthLabel(chartFrom)} – ${monthLabel(period.to)}`}>
          {hasTraffic ? (
            <TrendChart
              data={rows}
              series={[
                { key: "customersPerDay", label: "Customers / day", color },
                { key: "transactionsPerDay", label: "Transactions / day", color: "rgb(var(--ink-3))", dashed: true },
              ]}
              format="number" height={230}
              summary={`Average customers and transactions per open day at ${store.name}, by month. Months without counts or open days are left blank.`}
            />
          ) : (
            <Notice tone="unavailable" title="No customer or transaction counts" action={dataLink}>
              Enter customers, transactions and open days per month to see traffic per day. Without them, a revenue change cannot be split into “more visits” and “bigger baskets”.
            </Notice>
          )}
        </Panel>
        <Panel title="Basket and revenue per customer" subtitle="Revenue / transactions · Revenue / customers">
          {hasBasket ? (
            <TrendChart
              data={rows}
              series={[
                { key: "basket", label: "Average basket", color: seriesColor(2) },
                { key: "perCustomer", label: "Revenue / customer", color: seriesColor(4), dashed: true },
              ]}
              format="money2" currency={currency} height={230} zeroBased={false}
              summary="Average basket (revenue / transactions) and revenue per customer (revenue / customers) by month. The axis does not start at zero so that small changes are visible."
            />
          ) : (
            <Notice tone="unavailable" title="Basket cannot be calculated" action={dataLink}>
              The basket needs monthly transactions; revenue per customer needs monthly customer counts.
            </Notice>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-3" title="Hourly transaction profile"
        subtitle={hourly.length > 0 ? `Average transactions per hour of day · months with hourly data, ${monthLabel(hourlyFrom)} – ${monthLabel(latest)}` : undefined}
      >
        {hourly.length > 0 ? (
          <>
            <BarsChart
              data={hourlyRows} format="number" height={220}
              summary={`Average transactions per hour of the day at ${store.name}.${peak ? ` Busiest hour: ${String(peak.hour).padStart(2, "0")}:00 with about ${fmtNumber(peak.transactions)} transactions.` : ""}${store.opensAt && store.closesAt ? ` Opening hours on record: ${store.opensAt}–${store.closesAt}.` : ""}`}
            />
            <p className="mt-2 text-xs text-ink-3">
              The profile shows when transactions were recorded. It cannot show demand outside opening hours — whether customers would come earlier or later is unknown until it is tested.
            </p>
          </>
        ) : (
          <Notice tone="unavailable" title="No hourly traffic data for this store">
            Hourly transaction counts (from the POS system) are not on record. With them you could see peak and quiet hours, compare the profile with opening hours and staffing, and ground an opening-hours scenario in recorded data.
            Without them, any statement about busy hours at {store.name} would be an assumption. Hourly data cannot be entered by hand in this version; it has to be imported.
          </Notice>
        )}
      </Panel>
    </>
  );
}
