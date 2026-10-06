import Link from "next/link";
import { StorePicker } from "@/components/compare/StorePicker";
import { BarsChart, TrendChart } from "@/components/charts";
import { EmptyState, Formula, Missing, Notice, PageHeader, Panel, RangeFilter, Tag } from "@/components/ui";
import { filterFacts, kpisByStore } from "@/lib/analytics/aggregate";
import {
  bestIndices, categoryShares, COMPARE_METRICS, COMPARISON_HYPOTHESIS, compareValues, formatCompareValue,
  generateCategoryFact, generateComparisonFacts, indexedRevenueTrend, parseStoreSelection,
  type CompareMetricKey, type CompareStore,
} from "@/lib/analytics/compare";
import { STORE_TYPE_LABELS, type StoreDTO } from "@/lib/analytics/types";
import { storeColorMap } from "@/lib/colors";
import { fmtDate, fmtNumber, fmtPct } from "@/lib/format";
import { monthLabel, monthLabelLong, monthRange, periodLabel } from "@/lib/period";
import { first, getPeriodContext, type SearchParams } from "@/server/period";
import { getCategoryFacts, getMonthFacts, getStores } from "@/server/queries";
import { requireOrg } from "@/server/session";

export const metadata = { title: "Compare stores" };

const SLOT = ["A", "B", "C", "D"] as const;
const CHART_METRICS: { key: CompareMetricKey; format: "money" | "money2" | "number" | "pct" }[] = [
  { key: "revenuePerSqm", format: "money" },
  { key: "revenuePerEmployee", format: "money" },
  { key: "customersPerDay", format: "number" },
  { key: "averageBasket", format: "money2" },
  { key: "grossMarginPct", format: "pct" },
  { key: "costRatioPct", format: "pct" },
];

function openingHours(s: StoreDTO): string | null {
  return s.opensAt && s.closesAt ? `${s.opensAt}–${s.closesAt}` : null;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const currency = ctx.org.currency;
  const [allStores, pc] = await Promise.all([getStores(ctx.orgId), getPeriodContext(ctx.orgId, sp)]);

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      title="Compare stores"
      eyebrow={ctx.org.isDemo ? <Tag kind="DEMO" /> : undefined}
      subtitle="Up to four stores side by side. Differences are stated as calculated facts; explanations are kept separate and labelled as hypotheses."
      actions={actions}
    />
  );

  if (allStores.length === 0) {
    return (
      <>
        {header()}
        <EmptyState title="No stores yet" action={<Link href="/stores/new" className="btn-primary btn-sm">Add a store</Link>}>
          Add at least two stores to compare them.
        </EmptyState>
      </>
    );
  }

  const colors = storeColorMap(allStores);
  const selectedIds = parseStoreSelection(first(sp.stores), allStores.map((s) => s.id));
  const stores = selectedIds.map((id) => allStores.find((s) => s.id === id)!);
  const picker = (
    <Panel title="Stores" subtitle="Choose up to four" className="mb-4">
      <StorePicker stores={allStores.map((s) => ({ id: s.id, name: s.name }))} selected={selectedIds} colors={colors} />
    </Panel>
  );

  if (!pc) {
    return (
      <>
        {header()}
        {picker}
        <EmptyState title="No revenue data yet">Comparison needs monthly revenue for at least two stores. Enter monthly data on a store&apos;s data page.</EmptyState>
      </>
    );
  }
  const { period } = pc;
  const range = <RangeFilter active={period.preset} from={period.from} to={period.to} min={pc.earliest} max={pc.latest} />;

  if (stores.length === 0) {
    return (
      <>
        {header(range)}
        {picker}
        <EmptyState title="No stores selected">Select at least two stores above to compare them.</EmptyState>
      </>
    );
  }

  const [facts, catFacts] = await Promise.all([
    getMonthFacts(ctx.orgId, { from: period.previousYear.from, to: period.to, storeIds: selectedIds }),
    getCategoryFacts(ctx.orgId, { from: period.from, to: period.to, storeIds: selectedIds }),
  ]);
  const current = kpisByStore(filterFacts(facts, period), stores);
  const prevYear = kpisByStore(filterFacts(facts, period.previousYear), stores);
  const compared: CompareStore[] = stores.map((s) => ({
    id: s.id,
    name: s.name,
    values: compareValues(current.get(s.id)!, prevYear.get(s.id) ?? null, period.months),
  }));
  const enough = stores.length >= 2;
  const months = monthRange(period.from, period.to);

  // Indexed revenue trend
  const revenueAt = new Map(facts.map((f) => [`${f.storeId}|${f.month}`, f.revenue]));
  const trend = indexedRevenueTrend(months, selectedIds, (id, m) => revenueAt.get(`${id}|${m}`) ?? null);
  const lastRow = trend.rows[trend.rows.length - 1];

  // Categories
  const shares = categoryShares(catFacts, selectedIds);
  const storesWithCategories = new Set(catFacts.map((f) => f.storeId));

  // Insights
  const factLines = enough ? generateComparisonFacts(compared, currency) : [];
  const categoryFact = enough ? generateCategoryFact(shares, stores) : null;
  if (categoryFact) factLines.push(categoryFact);

  const incomplete = stores.filter((s) => (current.get(s.id)?.months ?? 0) < period.months);

  const profileRows: { label: string; cell: (s: StoreDTO) => string | null }[] = [
    { label: "Format", cell: (s) => STORE_TYPE_LABELS[s.type] },
    { label: "Opening hours", cell: openingHours },
    { label: "Open days / week", cell: (s) => (s.openDaysPerWeek === null ? null : fmtNumber(s.openDaysPerWeek)) },
    { label: "Store size", cell: (s) => (s.areaSqm === null ? null : `${fmtNumber(s.areaSqm)} m²`) },
    { label: "Employees", cell: (s) => (s.employees === null ? null : fmtNumber(s.employees)) },
    { label: "Parking spaces", cell: (s) => (s.parkingSpaces === null ? null : fmtNumber(s.parkingSpaces)) },
    { label: "Opened", cell: (s) => (s.openingDate ? fmtDate(s.openingDate) : null) },
  ];

  const colHead = (s: StoreDTO, i: number) => (
    <th key={s.id} scope="col" className="text-right">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2 w-2 rounded-[1px]" style={{ background: colors[s.id] }} />
        <span className="text-ink-3">{SLOT[i]}</span>
      </span>
      <Link href={`/stores/${s.id}`} className="block font-sans text-xs font-semibold normal-case tracking-normal text-ink hover:underline">{s.name}</Link>
    </th>
  );
  const sectionRow = (label: string) => (
    <tr><th scope="colgroup" colSpan={stores.length + 1} className="bg-surface-2 !py-1.5 text-left">{label}</th></tr>
  );

  return (
    <>
      {header(range)}
      {picker}

      {!enough && (
        <Notice tone="info" title="Select a second store" className="mb-4">
          One store is selected. Its figures are shown below; charts and insights need at least two stores.
        </Notice>
      )}
      {incomplete.length > 0 && (
        <Notice tone="warn" title="Incomplete period" className="mb-4">
          {incomplete.map((s) => `${s.name} has ${current.get(s.id)?.months ?? 0} of ${period.months} months`).join("; ")} in {periodLabel(period)}.
          Totals cover only the months on file; per-month and per-day figures remain comparable.
        </Notice>
      )}

      <Panel
        title="Comparison"
        subtitle={`${periodLabel(period)} · YoY against ${periodLabel(period.previousYear)}`}
        kind="CALCULATED"
        flush
        className="mb-4"
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th scope="col" className="w-56 align-bottom">Metric</th>
                {stores.map(colHead)}
              </tr>
            </thead>
            <tbody>
              {sectionRow("Performance")}
              {COMPARE_METRICS.map((m) => {
                const values = compared.map((c) => c.values[m.key]);
                const best = bestIndices(values, m.direction);
                return (
                  <tr key={m.key}>
                    <th scope="row" className="!font-sans !text-[13px] !font-normal !normal-case !tracking-normal !text-ink">
                      {m.label}
                      <div className="font-mono text-[10px] text-ink-3">{m.formula}</div>
                    </th>
                    {values.map((v, i) => (
                      <td key={stores[i]!.id} className="r">
                        {v === null ? (
                          <Missing reason="Not enough data to calculate" />
                        ) : (
                          <span className={best.includes(i) ? "font-semibold" : undefined}>
                            {best.includes(i) && <span className="mr-1 text-accent" title="Most favourable value in this row">◆<span className="sr-only"> most favourable</span></span>}
                            {formatCompareValue(v, m.unit, currency)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {sectionRow("Category performance — share of category revenue")}
              {shares.length === 0 ? (
                <tr><td colSpan={stores.length + 1} className="text-ink-3">No category data in this period.</td></tr>
              ) : shares.map((row) => (
                <tr key={row.categoryName}>
                  <th scope="row" className="!font-sans !text-[13px] !font-normal !normal-case !tracking-normal !text-ink">{row.categoryName}</th>
                  {stores.map((s) => (
                    <td key={s.id} className="r">
                      {storesWithCategories.has(s.id) ? fmtPct(row.shares[s.id]) : <Missing reason="No category data for this store" />}
                    </td>
                  ))}
                </tr>
              ))}
              {sectionRow("Store profile")}
              {profileRows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="!font-sans !text-[13px] !font-normal !normal-case !tracking-normal !text-ink">{r.label}</th>
                  {stores.map((s) => {
                    const v = r.cell(s);
                    return <td key={s.id} className="r">{v ?? <Missing reason="Not recorded for this store" />}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          <span className="text-accent">◆</span> marks the most favourable value in a row (highest; for cost ratio the lowest). Size-dependent rows such as operating costs carry no marker.
          — means the value cannot be calculated from the data on file. Category share = category revenue / Σ category revenue of the store × 100.
        </p>
      </Panel>

      {enough && (
        <>
          <Panel title="Normalized metrics" subtitle="Ratios that do not depend on store size" kind="CALCULATED" className="mb-4">
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
              {CHART_METRICS.map(({ key, format }) => {
                const def = COMPARE_METRICS.find((m) => m.key === key)!;
                const missing = compared.filter((c) => c.values[key] === null).map((c) => c.name);
                return (
                  <div key={key}>
                    <h3 className="mb-1 text-xs font-semibold">{def.label}</h3>
                    <BarsChart
                      horizontal
                      showValues
                      height={Math.max(160, 52 + stores.length * 30)}
                      format={format}
                      currency={currency}
                      data={compared.map((c) => ({ label: c.name, value: c.values[key], color: colors[c.id] }))}
                      summary={`${def.label} per store, ${periodLabel(period)}. ${def.formula}.${missing.length ? ` Missing for ${missing.join(", ")}.` : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Indexed revenue trend" subtitle={trend.baseMonth ? `${monthLabelLong(trend.baseMonth)} = 100 for every store` : undefined} kind="CALCULATED">
              {trend.baseMonth && trend.rows.length >= 2 && lastRow ? (
                <TrendChart
                  format="number1"
                  zeroBased={false}
                  height={260}
                  data={trend.rows.map((r) => ({ label: monthLabel(r.month), ...r.values }))}
                  series={stores.map((s) => ({ key: s.id, label: s.name, color: colors[s.id]! }))}
                  summary={
                    `Each store's monthly revenue divided by its own revenue in ${monthLabelLong(trend.baseMonth)}, × 100. Every line starts at 100, so stores of different size can be compared by direction rather than volume. ` +
                    `In ${monthLabelLong(lastRow.month)}: ${stores.map((s) => `${s.name} ${fmtNumber(lastRow.values[s.id], 1)}`).join(", ")}. The axis does not start at zero.`
                  }
                />
              ) : (
                <Notice tone="unavailable" title="No trend to show">
                  {trend.baseMonth
                    ? "The selected range contains a single month. Choose a longer range to see an indexed trend."
                    : "There is no month in this range in which every selected store has revenue, so a common base month cannot be set."}
                </Notice>
              )}
            </Panel>

            <Panel title="Category mix" subtitle="Share of each store's category revenue" kind="CALCULATED">
              {shares.length > 0 ? (
                <BarsChart
                  format="pct"
                  height={260}
                  data={shares.map((r) => ({ label: r.categoryName, ...Object.fromEntries(stores.map((s) => [s.id, storesWithCategories.has(s.id) ? r.shares[s.id] ?? null : null])) }))}
                  series={stores.map((s) => ({ key: s.id, label: s.name, color: colors[s.id]! }))}
                  summary={`Share of category revenue per category and store, ${periodLabel(period)}. Each store's bars add up to 100%.`}
                />
              ) : (
                <Notice tone="unavailable" title="No category data">No category revenue is recorded for the selected stores in this period.</Notice>
              )}
            </Panel>
          </div>

          <h2 className="mb-2 text-[13px] font-semibold">Insights</h2>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel title="What the numbers show" subtitle="Generated from the table above by fixed formulas" kind="CALCULATED" flush>
              {factLines.length === 0 ? (
                <p className="p-3 text-xs text-ink-3">No differences can be calculated from the data on file for the selected stores.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {factLines.map((f) => (
                    <li key={f.key} className="flex items-start gap-3 px-3 py-2">
                      <Tag kind="CALCULATED" className="mt-0.5" />
                      <div className="min-w-0">
                        <p>{f.text}</p>
                        <Formula>{f.formula}</Formula>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Why the stores differ" subtitle="Not established by this data" kind="HYPOTHESIS">
              <p className="mb-2">{COMPARISON_HYPOTHESIS}</p>
              <p className="mb-3 text-xs text-ink-2">
                A difference between stores is an observation, not a cause. Two stores can differ for reasons that are not recorded here at all.
                To find out whether a specific factor matters, test it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/strategies?tab=hypotheses" className="btn-secondary btn-sm">Review hypotheses</Link>
                <Link href="/experiments/new" className="btn-secondary btn-sm">Plan an experiment</Link>
                <Link href={`/research?store=${stores[0]!.id}`} className="btn-secondary btn-sm">Research surroundings</Link>
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
