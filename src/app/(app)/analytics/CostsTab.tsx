import { TrendChart } from "@/components/charts";
import { Bars } from "@/components/analytics/Bars";
import { EmptyState, Kpi, KpiGrid, Missing, Notice, Panel, RangeFilter } from "@/components/ui";
import { FilterBar, MethodList, Segmented, StoreSelect, Swatch, analyticsHref, names, one, type TabProps } from "@/components/analytics/shared";
import { filterFacts } from "@/lib/analytics/aggregate";
import { cellValue, costComparison, costTable, costTrend, COST_METRIC_LABELS, type CostCell, type CostMetric } from "@/lib/analytics/costs";
import { COST_LABELS, COST_TYPES, type CostTypeKey } from "@/lib/analytics/types";
import { seriesColor, storeColorMap } from "@/lib/colors";
import { fmtMoney, fmtMoneyCompact, fmtPct } from "@/lib/format";
import { addMonths, monthLabel, periodLabel } from "@/lib/period";
import { getPeriodContext } from "@/server/period";
import { getMonthFacts } from "@/server/queries";

const METRICS: CostMetric[] = ["share", "perCustomer", "perSqm", "abs"];

function fmtMetric(v: number | null, metric: CostMetric, currency: string): string {
  if (metric === "share") return fmtPct(v, 2);
  if (metric === "abs") return fmtMoney(v, currency);
  return fmtMoney(v, currency, 2);
}

const typeColor = (t: CostTypeKey) => seriesColor(COST_TYPES.indexOf(t));

export async function CostsTab({ orgId, currency, stores, store, sp }: TabProps) {
  const pc = await getPeriodContext(orgId, sp);
  if (!pc) return <EmptyState title="No revenue data yet" />;
  const { period } = pc;
  const metric: CostMetric = METRICS.find((m) => m === one(sp.metric)) ?? "share";
  const trendFrom = addMonths(period.to, -23) < pc.earliest ? pc.earliest : addMonths(period.to, -23);
  const allFacts = await getMonthFacts(orgId, { from: trendFrom < period.from ? trendFrom : period.from, to: period.to });
  const periodFacts = filterFacts(allFacts, period);
  const selStores = store ? [store] : stores;
  const selFacts = store ? periodFacts.filter((f) => f.storeId === store.id) : periodFacts;
  const scope = store ? store.name : `all ${stores.length} stores`;
  const colors = storeColorMap(stores);

  const table = costTable(selFacts, selStores);
  const comparison = costComparison(periodFacts, stores);
  const trend = costTrend(store ? allFacts.filter((f) => f.storeId === store.id) : allFacts, trendFrom, period.to);

  const filters = (
    <FilterBar>
      <StoreSelect stores={stores} value={store?.id ?? "all"} />
      <RangeFilter active={period.preset} from={period.from} to={period.to} min={pc.earliest} max={pc.latest} />
    </FilterBar>
  );

  if (table.total.amount === null) {
    return (
      <>
        {filters}
        <EmptyState title="No cost data for this selection">No cost rows have been recorded for {scope} in {periodLabel(period)}.</EmptyState>
      </>
    );
  }

  const recordedTypes = COST_TYPES.filter((t) => table.byType[t].amount !== null);
  const absentTypes = COST_TYPES.filter((t) => table.byType[t].amount === null);
  const incomplete = COST_TYPES.filter((t) => table.byType[t].missingStoreIds.length > 0 || table.byType[t].partialStoreIds.length > 0);
  const exclusion = (c: CostCell) => [
    c.missingStoreIds.length > 0 ? `not recorded for ${names(c.missingStoreIds, stores)}` : null,
    c.partialStoreIds.length > 0 ? `recorded for only some months in ${names(c.partialStoreIds, stores)}` : null,
  ].filter(Boolean).join("; ");
  const totalLabel = incomplete.length > 0 ? `Total recorded (excl. ${incomplete.map((t) => COST_LABELS[t]).join(", ")} where not recorded)` : "Total";

  // Footnotes of the cross-store table: stores whose total lacks a cost line.
  const storeGaps = comparison
    .map((c) => ({ ...c, gaps: COST_TYPES.filter((t) => c.table.byType[t].amount === null && c.table.total.amount !== null), partial: COST_TYPES.filter((t) => c.table.byType[t].partialStoreIds.length > 0) }))
    .filter((c) => c.gaps.length > 0 || c.partial.length > 0);
  const noCosts = comparison.filter((c) => c.table.total.amount === null);

  return (
    <div className="space-y-4">
      <div>
        {filters}
        {incomplete.length > 0 && (
          <Notice tone="warn" title="Cost records are incomplete">
            {incomplete.map((t) => (
              <div key={t}><strong className="font-semibold">{COST_LABELS[t]}</strong>: {exclusion(table.byType[t])}.</div>
            ))}
            <div className="mt-1">A cost type that was not recorded is shown as missing, not as zero. Totals are labelled as excluding it, and each line&apos;s ratios use only the revenue, customers and area of the store-months that recorded it.</div>
          </Notice>
        )}
      </div>

      <KpiGrid cols={4}>
        <Kpi label={incomplete.length > 0 ? "Recorded costs (incomplete)" : "Operating costs"} value={fmtMoney(table.total.amount, currency)} formula="Σ recorded cost rows in the period" />
        <Kpi label="% of revenue" value={table.total.sharePct === null ? null : fmtPct(table.total.sharePct)} formula="Σ costs ÷ Σ revenue × 100" />
        <Kpi label="Cost per customer" value={table.total.perCustomer === null ? null : fmtMoney(table.total.perCustomer, currency, 2)} missingReason="Customer count missing for part of the selection" formula="Σ costs ÷ Σ customers" />
        <Kpi label="Cost per m² / month" value={table.total.perSqmMonthly === null ? null : fmtMoney(table.total.perSqmMonthly, currency, 2)} missingReason="Store area missing" formula="Σ costs ÷ Σ (store m² × months)" />
      </KpiGrid>

      <Panel title="Cost breakdown" kind="CALCULATED" subtitle={`${scope} · ${periodLabel(period)}`} flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Cost type</th>
                <th className="text-right">Absolute</th>
                <th className="text-right">% of revenue</th>
                <th className="text-right">Per customer</th>
                <th className="text-right">Per m² / month</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {COST_TYPES.map((t) => {
                const c = table.byType[t];
                const none = c.amount === null;
                return (
                  <tr key={t}>
                    <td className="whitespace-nowrap font-medium"><Swatch color={typeColor(t)} />{COST_LABELS[t]}</td>
                    <td className="r">{none ? <Missing reason="Not recorded" /> : fmtMoney(c.amount, currency)}</td>
                    <td className="r">{c.sharePct === null ? <Missing reason="Not recorded" /> : fmtPct(c.sharePct, 2)}</td>
                    <td className="r">{c.perCustomer === null ? <Missing reason={none ? "Not recorded" : "Customer count missing"} /> : fmtMoney(c.perCustomer, currency, 2)}</td>
                    <td className="r">{c.perSqmMonthly === null ? <Missing reason={none ? "Not recorded" : "Store area missing"} /> : fmtMoney(c.perSqmMonthly, currency, 2)}</td>
                    <td className="min-w-[14rem] text-xs text-ink-3">{none ? "Not recorded for this selection" : exclusion(c) ? `Excludes stores: ${exclusion(c)}` : "All stores, all months"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-2">{totalLabel}</td>
                <td className="num px-3 py-2 text-right">{fmtMoney(table.total.amount, currency)}</td>
                <td className="num px-3 py-2 text-right">{fmtPct(table.total.sharePct, 2)}</td>
                <td className="num px-3 py-2 text-right">{fmtMoney(table.total.perCustomer, currency, 2)}</td>
                <td className="num px-3 py-2 text-right">{fmtMoney(table.total.perSqmMonthly, currency, 2)}</td>
                <td className="px-3 py-2 text-xs font-normal text-ink-3">{incomplete.length > 0 ? "Lower bound: missing lines are not estimated" : ""}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-line p-3">
          <MethodList
            items={[
              { term: "% of revenue", formula: "Σ cost ÷ Σ revenue × 100", note: "revenue of the store-months that recorded the cost type" },
              { term: "Per customer", formula: "Σ cost ÷ Σ customers", note: "missing if any of those store-months lacks a customer count" },
              { term: "Per m² / month", formula: "Σ cost ÷ Σ (store m² × months)" },
              { term: "Total", formula: "Σ of all recorded cost rows", note: "no estimate is added for missing lines" },
            ]}
          />
        </div>
      </Panel>

      <Panel
        title="Cross-store comparison"
        kind="CALCULATED"
        subtitle={`${COST_METRIC_LABELS[metric]} · ${periodLabel(period)}`}
        actions={<Segmented label="Metric" active={metric} items={METRICS.map((m) => ({ key: m, label: COST_METRIC_LABELS[m], href: analyticsHref(sp, { metric: m === "share" ? null : m }) }))} />}
        flush
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Cost type</th>
                {comparison.map((c) => (
                  <th key={c.storeId} className="text-right">
                    <span className={store?.id === c.storeId ? "text-ink" : undefined}><Swatch color={colors[c.storeId] ?? "var(--s1)"} />{c.storeName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COST_TYPES.map((t) => (
                <tr key={t}>
                  <td className="whitespace-nowrap font-medium">{COST_LABELS[t]}</td>
                  {comparison.map((c) => {
                    const cellV = c.table.byType[t];
                    const v = cellValue(cellV, metric);
                    return (
                      <td key={c.storeId} className="r">
                        {v === null ? <Missing reason={cellV.amount === null ? "Cost type not recorded for this store" : "Denominator missing"} /> : fmtMetric(v, metric, currency)}
                        {cellV.partialStoreIds.length > 0 && <sup className="text-ink-3">p</sup>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-2">Total recorded</td>
                {comparison.map((c) => {
                  const gaps = COST_TYPES.filter((t) => c.table.byType[t].amount === null);
                  const v = cellValue(c.table.total, metric);
                  return (
                    <td key={c.storeId} className="num px-3 py-2 text-right">
                      {v === null ? <Missing reason="No cost rows recorded" /> : fmtMetric(v, metric, currency)}
                      {v !== null && gaps.length > 0 && <sup className="text-warn">*</sup>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="space-y-1 border-t border-line p-3 text-xs text-ink-3">
          {storeGaps.map((c) => (
            <p key={c.storeId}>
              {c.gaps.length > 0 && <><sup className="text-warn">*</sup> <span className="text-ink-2">{c.storeName}</span>: no {c.gaps.map((t) => COST_LABELS[t]).join(", ")} cost recorded — its total excludes {c.gaps.length === 1 ? "that line" : "those lines"} and is not comparable like-for-like with the other stores. </>}
              {c.partial.length > 0 && <><sup>p</sup> {c.storeName}: {c.partial.map((t) => COST_LABELS[t]).join(", ")} recorded for part of the period only.</>}
            </p>
          ))}
          {noCosts.length > 0 && <p>No cost rows at all in this period: {noCosts.map((c) => c.storeName).join(", ")}.</p>}
          <p>Each column is one store&apos;s own figures: cost ÷ that store&apos;s revenue, customers, or area × months. Differences between stores are observations; store format, lease terms and location differ and are not adjusted for.</p>
        </div>
      </Panel>

      <Panel title="Cost structure by store" kind="CALCULATED" subtitle={`Cost types as % of each store's revenue · ${periodLabel(period)}`}>
        <Bars
          horizontal
          stacked
          format="pct"
          height={Math.max(220, 44 * comparison.length + 60)}
          series={recordedTypesAcross(comparison).map((t) => ({ key: t, label: COST_LABELS[t], color: typeColor(t) }))}
          data={comparison.filter((c) => c.table.total.amount !== null).map((c) => ({
            label: c.storeName,
            ...Object.fromEntries(COST_TYPES.map((t) => [t, c.table.byType[t].sharePct])),
          }))}
          summary={`Stacked cost structure: each bar is one store, each segment a cost type as a percentage of that store's revenue; the bar length is total recorded costs ÷ revenue.${storeGaps.some((c) => c.gaps.length > 0) ? ` Bars with a missing cost type are shorter because the line is absent, not because the cost is zero (${storeGaps.filter((c) => c.gaps.length > 0).map((c) => `${c.storeName}: no ${c.gaps.map((t) => COST_LABELS[t]).join(", ")}`).join("; ")}).` : ""}`}
        />
      </Panel>

      <Panel
        title="Cost trend"
        kind="CALCULATED"
        subtitle={`${scope} · monthly amount per cost type · ${monthLabel(trendFrom)} – ${monthLabel(period.to)} (up to 24 months, independent of the range filter)`}
      >
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {recordedTypes.map((t) => {
            const vals = trend.map((p) => p.amounts[t]).filter((v): v is number => v !== null);
            const firstV = vals[0] ?? null;
            const lastV = vals[vals.length - 1] ?? null;
            return (
              <div key={t} className="min-w-0">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold"><Swatch color={typeColor(t)} />{COST_LABELS[t]}</h3>
                  <span className="num text-xs text-ink-2">{fmtMoneyCompact(lastV, currency)}</span>
                </div>
                <TrendChart
                  height={120}
                  format="money"
                  currency={currency}
                  series={[{ key: "v", label: COST_LABELS[t], color: typeColor(t) }]}
                  data={trend.map((p) => ({ label: monthLabel(p.month), v: p.amounts[t] }))}
                  summary={`${fmtMoneyCompact(firstV, currency)} → ${fmtMoneyCompact(lastV, currency)} per month.${table.byType[t].missingStoreIds.length > 0 ? ` Without ${names(table.byType[t].missingStoreIds, stores)}.` : ""}`}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 border-t border-line pt-2 text-xs text-ink-3">
          Each small chart has its own y-axis starting at zero — compare shapes across charts, not heights. Amounts are the sum of recorded cost rows per month{store ? "" : " across stores"}; gaps mean nothing was recorded.
          {absentTypes.length > 0 && ` Not recorded for this selection: ${absentTypes.map((t) => COST_LABELS[t]).join(", ")}.`}
        </p>
      </Panel>
    </div>
  );
}

function recordedTypesAcross(cmp: ReturnType<typeof costComparison>): CostTypeKey[] {
  return COST_TYPES.filter((t) => cmp.some((c) => c.table.byType[t].amount !== null));
}
