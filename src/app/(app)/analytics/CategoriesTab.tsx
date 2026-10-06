import { ScatterPlot } from "@/components/charts";
import { Delta, EmptyState, Missing, Notice, Panel, RangeFilter, Tag } from "@/components/ui";
import { FilterBar, MethodList, StoreSelect, names, type TabProps } from "@/components/analytics/shared";
import { aggregateCategories, categoryMatrix, QUADRANT_LABELS, type Quadrant } from "@/lib/analytics/categories";
import { fmtMoney, fmtPct, fmtSignedPct } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { getPeriodContext } from "@/server/period";
import { getCategoryFacts } from "@/server/queries";

const EXPLORE: Record<Quadrant, string[]> = {
  HIGH_GROWTH_HIGH_MARGIN: [
    "Is availability keeping up? Compare the stockout rate with the other categories.",
    "Is the growth present in every store, or carried by one or two?",
    "Does the space share match the revenue share (revenue / m²)?",
  ],
  HIGH_GROWTH_LOW_MARGIN: [
    "Is the growth driven by promotions or price reductions? (Promotion data is not in RetailLab.)",
    "Is the low margin structural for this category, or has it moved recently?",
    "How much of the margin is lost to waste?",
  ],
  LOW_GROWTH_HIGH_MARGIN: [
    "Is the category stable or slowly losing volume? Check the year-over-year line per store.",
    "Are stockouts limiting sales?",
    "Has placement, space or assortment changed in the period?",
  ],
  LOW_GROWTH_LOW_MARGIN: [
    "What role does the category play — does it bring customers who then buy elsewhere in the store? (Basket-level data is not in RetailLab.)",
    "Is waste or stockout unusually high compared with the other categories?",
    "Do individual stores deviate from the pattern?",
  ],
};

// ScatterPlot order: [topLeft, topRight, bottomLeft, bottomRight] with x = growth, y = margin.
const QUADRANT_ORDER: Quadrant[] = ["LOW_GROWTH_HIGH_MARGIN", "HIGH_GROWTH_HIGH_MARGIN", "LOW_GROWTH_LOW_MARGIN", "HIGH_GROWTH_LOW_MARGIN"];

export async function CategoriesTab({ orgId, currency, stores, store, sp }: TabProps) {
  const pc = await getPeriodContext(orgId, sp);
  if (!pc) return <EmptyState title="No revenue data yet" />;
  const { period } = pc;
  const storeIds = store ? [store.id] : undefined;
  const [current, previous] = await Promise.all([
    getCategoryFacts(orgId, { from: period.from, to: period.to, storeIds }),
    getCategoryFacts(orgId, { from: period.previousYear.from, to: period.previousYear.to, storeIds }),
  ]);
  const a = aggregateCategories(current, previous);
  const matrix = categoryMatrix(a);
  const scope = store ? store.name : `all ${stores.length} stores`;

  const storesWithRows = new Set(current.map((f) => f.storeId));
  const withoutRows = (store ? [store] : stores).filter((s) => !storesWithRows.has(s.id));
  const cov = a.coverage;
  const fields = [
    { label: "margin", c: cov.margin },
    { label: "waste", c: cov.waste },
    { label: "stockout", c: cov.stockout },
  ];
  const excludedAny = fields.some((f) => f.c.none.length > 0 || f.c.partial.length > 0);
  const marginStores = cov.margin.full.length + cov.margin.partial.length;
  const partialGrowth = a.rows.some((r) => r.growthMatched < r.growthTotal);

  const filters = (
    <FilterBar>
      <StoreSelect stores={stores} value={store?.id ?? "all"} />
      <RangeFilter active={period.preset} from={period.from} to={period.to} min={pc.earliest} max={pc.latest} />
    </FilterBar>
  );

  if (a.rows.length === 0) {
    return (
      <>
        {filters}
        <EmptyState title="No category data for this selection">
          No category revenue has been recorded for {scope} in {periodLabel(period)}.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {filters}
        {excludedAny && (
          <Notice tone="warn" title="Some stores did not record every category field">
            <ul className="list-disc space-y-0.5 pl-4">
              {fields.filter((f) => f.c.none.length > 0).map((f) => (
                <li key={f.label}>
                  <strong className="font-semibold">{f.label === "stockout" ? "Stockout rate" : f.label === "margin" ? "Margin" : "Waste"}</strong>{" "}
                  {store ? "is not recorded for this store" : <>excludes <strong className="font-semibold">{names(f.c.none, stores)}</strong> (not recorded)</>}
                  {!store && <> — calculated over {f.c.full.length + f.c.partial.length} of {storesWithRows.size} stores.</>}
                  {store && "."}
                </li>
              ))}
              {fields.filter((f) => f.c.partial.length > 0).map((f) => (
                <li key={`${f.label}-p`}>{f.label === "stockout" ? "Stockout rate" : f.label === "margin" ? "Margin" : "Waste"} is recorded for only part of the period in {names(f.c.partial, stores)}; months without a value are left out.</li>
              ))}
            </ul>
            <p className="mt-1">Revenue, share and growth include every store. Ratios use only the revenue of the store-months that recorded the field — a missing value is never treated as zero.</p>
          </Notice>
        )}
        {withoutRows.length > 0 && !store && (
          <Notice tone="unavailable" className="mt-2">No category data at all for: {withoutRows.map((s) => s.name).join(", ")}.</Notice>
        )}
      </div>

      <Panel
        title="Category performance"
        kind="CALCULATED"
        subtitle={`${scope} · ${periodLabel(period)} · growth vs ${periodLabel(period.previousYear)}`}
        flush
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Share</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Growth YoY</th>
                <th className="text-right">Revenue / m² / mo</th>
                <th className="text-right">Waste</th>
                <th className="text-right">Waste % of rev.</th>
                <th className="text-right">Stockout rate</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.categoryId}>
                  <td className="whitespace-nowrap font-medium">{r.categoryName}</td>
                  <td className="r">{fmtMoney(r.revenue, currency)}</td>
                  <td className="r">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span aria-hidden className="hidden h-1.5 w-14 overflow-hidden rounded-sm bg-line sm:inline-block">
                        <span className="block h-full bg-ink-3" style={{ width: `${Math.min(100, (r.sharePct ?? 0) * 2.5)}%` }} />
                      </span>
                      {fmtPct(r.sharePct)}
                    </span>
                  </td>
                  <td className="r">{r.marginPct === null ? <Missing reason="No category margin recorded" /> : fmtPct(r.marginPct)}</td>
                  <td className="r">
                    {r.growthPct === null ? <Missing reason="No data for the same months one year earlier" /> : (
                      <span className="inline-flex items-center justify-end gap-1">
                        <Delta value={r.growthPct} />
                        {r.growthMatched < r.growthTotal && <sup className="text-ink-3" title={`${r.growthMatched} of ${r.growthTotal} store-months have a prior-year counterpart`}>a</sup>}
                      </span>
                    )}
                  </td>
                  <td className="r">{r.revenuePerSqm === null ? <Missing reason="No category floor area recorded" /> : fmtMoney(r.revenuePerSqm, currency)}</td>
                  <td className="r">{r.wasteValue === null ? <Missing reason="No waste recorded" /> : fmtMoney(r.wasteValue, currency)}</td>
                  <td className="r">{r.wastePct === null ? <Missing reason="No waste recorded" /> : fmtPct(r.wastePct, 2)}</td>
                  <td className="r">{r.stockoutRatePct === null ? <Missing reason="No stockout rate recorded" /> : fmtPct(r.stockoutRatePct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-semibold">
                <td className="px-3 py-2">All categories</td>
                <td className="num px-3 py-2 text-right">{fmtMoney(a.totalRevenue, currency)}</td>
                <td className="num px-3 py-2 text-right">{fmtPct(100)}</td>
                <td className="num px-3 py-2 text-right">{a.totalMarginPct === null ? <Missing reason="No category margin recorded" /> : fmtPct(a.totalMarginPct)}</td>
                <td className="num px-3 py-2 text-right">{a.totalGrowthPct === null ? <Missing reason="No data for the same months one year earlier" /> : fmtSignedPct(a.totalGrowthPct)}</td>
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-normal text-ink-3">
                  {partialGrowth && <span><sup>a</sup> growth on the store-months that exist in both years only</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-line p-3">
          <MethodList
            items={[
              { term: "Share", formula: "category revenue ÷ Σ category revenue × 100" },
              { term: "Margin", formula: "Σ(revenue × margin) ÷ Σ revenue", note: "over store-months with a recorded margin" },
              { term: "Growth YoY", formula: "(revenue − revenue same months one year earlier) ÷ revenue one year earlier × 100", note: "matched store-months only" },
              { term: "Revenue / m² / month", formula: "Σ revenue ÷ Σ (category m² × months)", note: "over store-months with a recorded category area" },
              { term: "Waste % of revenue", formula: "Σ waste value ÷ Σ revenue × 100", note: "over store-months with recorded waste" },
              { term: "Stockout rate", formula: "mean of the recorded monthly stockout rates", note: "unweighted, per store-month" },
            ]}
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Growth × margin matrix" kind="CALCULATED" subtitle={`${scope} · ${periodLabel(period)}`}>
          {matrix.points.length === 0 ? (
            <EmptyState title="Matrix cannot be drawn">
              {matrix.marginDivider === null
                ? `No category margin is recorded for ${scope}, so categories cannot be placed on the margin axis.`
                : "No revenue is recorded for the same months one year earlier, so growth cannot be calculated."}
            </EmptyState>
          ) : (
            <>
              <ScatterPlot
                points={matrix.points.map((p) => ({ label: p.categoryName, x: p.growthPct, y: p.marginPct, size: p.revenue }))}
                xLabel="Growth YoY"
                yLabel="Margin"
                xFormat="pct"
                yFormat="pct"
                sizeLabel="Revenue"
                sizeFormat="money"
                currency={currency}
                height={400}
                xRef={matrix.growthDivider ?? undefined}
                yRef={matrix.marginDivider ?? undefined}
                quadrants={QUADRANT_ORDER.map((q) => QUADRANT_LABELS[q].toUpperCase()) as [string, string, string, string]}
                summary={`Each bubble is one category: year-over-year revenue growth (x) against revenue-weighted margin (y); bubble area follows revenue. Dashed dividers: total growth ${fmtSignedPct(matrix.growthDivider)} and average margin ${fmtPct(matrix.marginDivider)}.`}
              />
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-2">
                <p>
                  <strong className="font-semibold text-ink">How the dividers are defined.</strong>{" "}
                  Vertical divider = year-over-year growth of total category revenue for {scope} (<span className="num">{fmtSignedPct(matrix.growthDivider)}</span>).
                  Horizontal divider = revenue-weighted average margin across all categories (<span className="num">{fmtPct(matrix.marginDivider)}</span>).
                  “High” means at or above the divider — relative to this selection&apos;s own average, not to any external benchmark.
                </p>
                {!store && cov.margin.none.length > 0 && (
                  <p>The margin axis is based on {marginStores} stores (without {names(cov.margin.none, stores)}); the growth axis and bubble size include all stores with category data.</p>
                )}
                {matrix.omitted.length > 0 && <p>Not placed (growth or margin missing): {matrix.omitted.join(", ")}.</p>}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Explore" subtitle="Questions to investigate — not recommendations">
          <Notice tone="info" className="mb-3">
            The matrix describes; it does not recommend delisting. Low growth / low margin categories may still drive visits.
          </Notice>
          {matrix.points.length === 0 ? (
            <p className="text-xs text-ink-3">Questions per quadrant appear once the matrix can be drawn.</p>
          ) : (
            <div className="grid gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-2">
              {QUADRANT_ORDER.map((q) => {
                const cats = matrix.points.filter((p) => p.quadrant === q);
                return (
                  <section key={q} className="bg-surface p-2.5">
                    <h3 className="label mb-1">{QUADRANT_LABELS[q]}</h3>
                    <p className="mb-1.5 text-xs font-medium">{cats.length > 0 ? cats.map((c) => c.categoryName).join(", ") : <span className="font-normal text-ink-3">No category in this quadrant</span>}</p>
                    {cats.length > 0 && (
                      <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
                        {EXPLORE[q].map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <Tag kind="UNKNOWN" /> Why a category sits where it does is not in the data. Category roles, cross-category baskets and promotions are not recorded.
          </p>
        </Panel>
      </div>
    </div>
  );
}
