import Link from "next/link";
import { Delta, Missing, Notice, Panel, Tag } from "@/components/ui";
import { storeCategoryBreakdown } from "@/lib/analytics/storeCategories";
import { calculateShare, calculateWeightedMargin, sumStrict } from "@/lib/calc";
import { fmtMoney, fmtPct } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { getCategoryFacts } from "@/server/queries";
import type { ScorecardProps } from "./shared";

export async function CategoriesTab({ orgId, store, currency, period, canEdit }: ScorecardProps) {
  const [current, previousYear] = await Promise.all([
    getCategoryFacts(orgId, { storeIds: [store.id], from: period.from, to: period.to }),
    getCategoryFacts(orgId, { storeIds: [store.id], from: period.previousYear.from, to: period.previousYear.to }),
  ]);
  const rows = storeCategoryBreakdown(current, previousYear);
  const range = periodLabel(period);

  if (rows.length === 0) {
    return (
      <Notice tone="unavailable" title={`No category revenue for ${range}`} action={canEdit ? <Link href={`/stores/${store.id}/data`} className="btn-secondary btn-sm">Enter data</Link> : undefined}>
        Category revenue is entered per month on the data page. Without it, the assortment of {store.name} cannot be described: no shares, no category growth, no category margins.
      </Notice>
    );
  }

  const total = rows.reduce((a, r) => a + r.revenue, 0);
  const totalWaste = sumStrict(rows.map((r) => r.wasteValue));
  const totalMargin = rows.every((r) => r.marginPct !== null) ? calculateWeightedMargin(rows.map((r) => ({ revenue: r.revenue, grossMarginPct: r.marginPct }))) : null;
  const maxShare = Math.max(...rows.map((r) => r.sharePct ?? 0));
  const gaps = [
    rows.some((r) => r.marginPct === null) && "category margins",
    rows.some((r) => r.wasteValue === null) && "waste",
    rows.some((r) => r.stockoutRatePct === null) && "stockout rates",
    rows.some((r) => r.revenuePerSqm === null) && "category floor area",
    rows.some((r) => r.growthPct === null) && "a full previous year",
  ].filter((x): x is string => !!x);

  return (
    <>
      <Panel title="Categories" kind="CALCULATED" subtitle={`${range} · sorted by revenue`} flush>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Revenue</th>
                <th className="w-44">Share of store</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Growth YoY</th>
                <th className="text-right">Waste</th>
                <th className="text-right">Waste / revenue</th>
                <th className="text-right">Stockout rate</th>
                <th className="text-right">Rev / m² · mo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.categoryId}>
                  <td className="whitespace-nowrap font-medium">{r.categoryName}</td>
                  <td className="r">{fmtMoney(r.revenue, currency)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="num w-11 shrink-0 text-right">{fmtPct(r.sharePct)}</span>
                      <span aria-hidden className="h-1.5 flex-1 rounded-sm bg-line"><span className="block h-full rounded-sm bg-ink-2" style={{ width: `${maxShare > 0 ? ((r.sharePct ?? 0) / maxShare) * 100 : 0}%` }} /></span>
                    </div>
                  </td>
                  <td className="r">{r.marginPct === null ? <Missing reason="Category margin not provided" /> : fmtPct(r.marginPct)}</td>
                  <td className="r"><Delta value={r.growthPct} /></td>
                  <td className="r">{r.wasteValue === null ? <Missing reason="Waste not provided" /> : fmtMoney(r.wasteValue, currency)}</td>
                  <td className="r">{r.wasteSharePct === null ? <Missing reason="Waste not provided" /> : fmtPct(r.wasteSharePct)}</td>
                  <td className="r">{r.stockoutRatePct === null ? <Missing reason="Stockout rate not provided" /> : fmtPct(r.stockoutRatePct)}</td>
                  <td className="r">{r.revenuePerSqm === null ? <Missing reason="Category floor area not provided" /> : fmtMoney(r.revenuePerSqm, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="border-t border-line-strong px-3 py-2">All categories</td>
                <td className="num border-t border-line-strong px-3 py-2 text-right">{fmtMoney(total, currency)}</td>
                <td className="num border-t border-line-strong px-3 py-2"><span className="inline-block w-11 text-right">100.0%</span></td>
                <td className="num border-t border-line-strong px-3 py-2 text-right">{totalMargin === null ? <Missing reason="Not every category has a margin" /> : fmtPct(totalMargin)}</td>
                <td className="border-t border-line-strong px-3 py-2" />
                <td className="num border-t border-line-strong px-3 py-2 text-right">{totalWaste === null ? <Missing reason="Waste not provided for every category" /> : fmtMoney(totalWaste, currency)}</td>
                <td className="num border-t border-line-strong px-3 py-2 text-right">{totalWaste === null ? <Missing /> : fmtPct(calculateShare(totalWaste, total))}</td>
                <td className="border-t border-line-strong px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          Share = category revenue / sum of category revenue. Margin is revenue-weighted over the months that have one. Growth YoY compares with the same months one year earlier and is shown only when those are complete.
          Waste is the summed waste value and requires every month in the period. Stockout rate is the mean of the monthly rates. Rev / m² = average monthly revenue / the category’s floor area.
        </p>
      </Panel>
      {gaps.length > 0 && (
        <Notice tone="unavailable" className="mt-3" title="Some columns are empty because the data is not on record">
          Missing for {store.name}: {gaps.join(", ")}. Shown as — rather than estimated. Without category margins it is unknown which categories contribute profit; without waste data, waste-reduction ideas cannot be sized.
        </Notice>
      )}
      <p className="mt-3 text-xs text-ink-3">
        <Tag kind="FACT" className="mr-1.5" />
        This table describes what was sold. It does not say what should be stocked — a high or low share can have many reasons.{" "}
        <Link href="/analytics?tab=categories" className="link">Compare categories across stores</Link>
      </p>
    </>
  );
}
