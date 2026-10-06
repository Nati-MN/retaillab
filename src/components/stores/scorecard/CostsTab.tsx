import Link from "next/link";
import { BarsChart } from "@/components/charts";
import { kpiTile } from "@/components/overview/kpiTiles";
import { Kpi, KpiGrid, Missing, Notice, Panel, Tag } from "@/components/ui";
import { costBreakdown, filterFacts } from "@/lib/analytics/aggregate";
import { comparePeriods } from "@/lib/analytics/periodCompare";
import { COST_LABELS, COST_TYPES } from "@/lib/analytics/types";
import { seriesColor } from "@/lib/colors";
import { fmtMoney, fmtPct } from "@/lib/format";
import { addMonths, monthLabel, monthRange, periodLabel } from "@/lib/period";
import { getMonthFacts } from "@/server/queries";
import { minMonth, type ScorecardProps } from "./shared";

export async function CostsTab({ orgId, store, currency, period, canEdit }: ScorecardProps) {
  const chartFrom = minMonth(period.from, addMonths(period.to, -11));
  const chartMonths = monthRange(chartFrom, period.to);
  const facts = await getMonthFacts(orgId, { storeIds: [store.id], from: minMonth(period.previousYear.from, period.previous.from, chartFrom), to: period.to });
  const cmp = comparePeriods(facts, [store], period);
  const periodFacts = filterFacts(facts, period);
  const lines = costBreakdown(periodFacts, [store]).sort((a, b) => b.amount - a.amount);
  const range = periodLabel(period);
  const monthsWithCosts = periodFacts.filter((f) => f.operatingCosts !== null).length;
  const complete = periodFacts.length > 0 && monthsWithCosts === periodFacts.length;
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const byMonth = new Map(facts.map((f) => [f.month, f]));
  const types = COST_TYPES.filter((t) => chartMonths.some((m) => byMonth.get(m)?.costs[t] !== undefined));
  const rows = chartMonths.map((m) => {
    const row: { label: string } & Record<string, string | number | null> = { label: monthLabel(m) };
    for (const t of types) row[t] = byMonth.get(m)?.costs[t] ?? null;
    return row;
  });
  const missingTypes = COST_TYPES.filter((t) => !lines.some((l) => l.type === t));
  const dataLink = canEdit ? <Link href={`/stores/${store.id}/data`} className="btn-secondary btn-sm">Enter data</Link> : undefined;

  if (lines.length === 0) {
    return (
      <Notice tone="unavailable" title={`No operating costs for ${range}`} action={dataLink}>
        Cost lines (personnel, rent, energy, …) are entered per month. Without them, operating profit, cost ratios and break-even revenue cannot be calculated for {store.name}.
      </Notice>
    );
  }

  return (
    <>
      <KpiGrid cols={4}>
        <Kpi {...kpiTile(cmp, "operatingCosts", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "costRatioPct", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "grossMarginPct", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "operatingProfit", currency, { size: "lg" })} />
      </KpiGrid>
      <p className="mb-3 mt-1.5 text-xs text-ink-3">
        <Tag kind="CALCULATED" className="mr-1.5" />
        <span className="num">{range}</span>. Operating costs are the sum of the cost lines entered — costs that were not entered are not included, so operating profit is only as complete as the cost lines.
      </p>
      {!complete && (
        <Notice tone="warn" className="mb-3" title="Costs are incomplete for this period">
          Cost lines exist for <span className="num">{monthsWithCosts}</span> of <span className="num">{periodFacts.length}</span> months. Period totals for operating costs and operating profit are therefore shown as missing; the table below sums only the months that have costs.
        </Notice>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Cost breakdown" subtitle={range} flush>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cost type</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">% of revenue</th>
                  <th className="text-right">Per customer</th>
                  <th className="text-right">Per m² · month</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.type}>
                    <td className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: seriesColor(COST_TYPES.indexOf(l.type)) }} />
                        {COST_LABELS[l.type]}
                      </span>
                    </td>
                    <td className="r">{fmtMoney(l.amount, currency)}</td>
                    <td className="r">{l.shareOfRevenuePct === null ? <Missing /> : fmtPct(l.shareOfRevenuePct)}</td>
                    <td className="r">{l.perCustomer === null ? <Missing reason="Customer counts missing" /> : fmtMoney(l.perCustomer, currency, 2)}</td>
                    <td className="r">{l.perSqmMonthly === null ? <Missing reason="Sales area missing" /> : fmtMoney(l.perSqmMonthly, currency, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="border-t border-line-strong px-3 py-2">Total entered</td>
                  <td className="num border-t border-line-strong px-3 py-2 text-right">{fmtMoney(total, currency)}</td>
                  <td className="num border-t border-line-strong px-3 py-2 text-right">{complete && cmp.current.costRatioPct !== null ? fmtPct(cmp.current.costRatioPct) : <Missing reason="Costs incomplete for the period" />}</td>
                  <td className="border-t border-line-strong px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
            % of revenue = amount / revenue × 100. Per customer = amount / customers. Per m² · month = amount / months / sales area.
            {missingTypes.length > 0 && <> Not entered: {missingTypes.map((t) => COST_LABELS[t]).join(", ")} — absent, not zero.</>}
          </p>
        </Panel>
        <Panel title="Operating costs by type" subtitle={`${monthLabel(chartFrom)} – ${monthLabel(period.to)} · stacked`}>
          <BarsChart
            data={rows} series={types.map((t) => ({ key: t, label: COST_LABELS[t], color: seriesColor(COST_TYPES.indexOf(t)) }))} stacked format="money" currency={currency} height={280}
            summary={`Monthly operating costs of ${store.name} by cost type. Months without cost lines are left empty.`}
          />
        </Panel>
      </div>
    </>
  );
}
