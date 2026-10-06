import { TrendChart } from "@/components/charts";
import { Bars } from "@/components/analytics/Bars";
import { EmptyState, Missing, Notice, Panel, Tag } from "@/components/ui";
import { FilterBar, StoreSelect, type TabProps } from "@/components/analytics/shared";
import { seriesByMonth } from "@/lib/analytics/aggregate";
import { calendarContext, fullYears, indexToPct, yoyPivot } from "@/lib/analytics/seasonality";
import { seasonalIndices, type SeasonalIndex } from "@/lib/calc";
import { seriesColor } from "@/lib/colors";
import { fmtNumber, fmtSignedPct } from "@/lib/format";
import { monthLabel, monthName, monthNumber, monthRange } from "@/lib/period";
import { getMonthFacts } from "@/server/queries";

export async function SeasonalityTab({ orgId, currency, country, stores, store, sp: _sp }: TabProps) {
  const facts = await getMonthFacts(orgId, store ? { storeIds: [store.id] } : {});
  const scope = store ? store.name : `all ${stores.length} stores`;
  const filters = (
    <FilterBar>
      <StoreSelect stores={stores} value={store?.id ?? "all"} />
      <span className="text-xs text-ink-3">Uses the full recorded history — a date range would remove the observations the index is built from.</span>
    </FilterBar>
  );
  const points = seriesByMonth(facts, stores);
  if (points.length === 0) {
    return <>{filters}<EmptyState title="No revenue data for this selection" /></>;
  }
  const months = monthRange(points[0]!.month, points[points.length - 1]!.month);
  const byMonth = new Map(points.map((p) => [p.month, p]));
  const revenue = months.map((m) => ({ key: m, month: monthNumber(m), value: byMonth.get(m)?.revenue ?? null }));
  const customers = months.map((m) => ({ key: m, month: monthNumber(m), value: byMonth.get(m)?.customers ?? null }));
  const usable = revenue.filter((p) => p.value !== null).length;
  const usableCustomers = customers.filter((p) => p.value !== null).length;

  // Stores reporting per month: a changing store count would distort the summed series.
  const storeCounts = months.map((m) => new Set(facts.filter((f) => f.month === m).map((f) => f.storeId)).size);
  const unevenStores = !store && new Set(storeCounts.filter((c) => c > 0)).size > 1;

  if (usable < 12) {
    return (
      <>
        {filters}
        <EmptyState title="Insufficient historical data">
          A seasonal index needs at least 12 months of revenue. {scope} has <span className="num">{usable}</span>. Nothing is estimated from fewer months.
        </EmptyState>
      </>
    );
  }

  const revIdx = seasonalIndices(revenue);
  const custIdx = seasonalIndices(customers);
  const haveCustomers = usableCustomers >= 12;
  const years = fullYears(usable);
  const pivot = yoyPivot(revenue.map((p) => ({ month: p.key, value: p.value })));
  const window = `${monthLabel(months[0]!)} – ${monthLabel(months[months.length - 1]!)}`;
  const austria = /^(austria|österreich|at)$/i.test(country.trim());
  const context = calendarContext(
    revIdx,
    revenue.filter((p) => p.value !== null).map((p) => p.key),
    austria ? "Austrian summer school holidays (about nine weeks from early July; exact dates differ by federal state)" : "Summer months (school holiday dates are not stored for this country)",
  );
  const custAt = (ms: number[]) => {
    const v = ms.map((m) => custIdx[m - 1]?.index ?? null);
    return haveCustomers && v.every((x): x is number => x !== null) ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const peak = (idx: SeasonalIndex[]) => idx.filter((i) => i.index !== null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  const bars = (idx: SeasonalIndex[], color: string) => idx.map((i) => ({ label: monthName(i.month), value: indexToPct(i.index), color }));
  const describe = (idx: SeasonalIndex[], what: string) => {
    const p = peak(idx);
    const hi = p[0];
    const lo = p[p.length - 1];
    return hi && lo
      ? `${what}: each calendar month relative to an average month (trend removed), ${window}. Highest: ${monthName(hi.month)} ${fmtSignedPct(indexToPct(hi.index))}; lowest: ${monthName(lo.month)} ${fmtSignedPct(indexToPct(lo.index))}.`
      : `${what}: no index available.`;
  };

  return (
    <div className="space-y-4">
      <div>
        {filters}
        {years < 2 ? (
          <Notice tone="warn" title="Less than two full years of history">
            {scope} has <span className="num">{usable}</span> months of revenue. Most calendar months have a single observation, so the index cannot separate a recurring seasonal pattern from a one-off month.
          </Notice>
        ) : (
          <Notice tone="warn" title={`Each calendar month has at most ${Math.max(...revIdx.map((i) => i.observations))} observations`}>
            {window} gives <span className="num">{usable}</span> months. An index averaged over two values per month is a description of those two years — one unusual month moves it substantially. Treat it as an observation, not an established seasonal pattern.
          </Notice>
        )}
        {unevenStores && (
          <Notice tone="warn" className="mt-2" title="The number of reporting stores changes over time">
            The series is the sum of all stores with data in each month ({Math.min(...storeCounts.filter((c) => c > 0))}–{Math.max(...storeCounts)} stores). A store joining or leaving shifts the level and can look like seasonality. Select a single store for a clean series.
          </Notice>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Seasonal index · revenue" kind="CALCULATED" subtitle={`${scope} · % above / below an average month`}>
          <Bars data={bars(revIdx, "var(--s1)")} format="pct" signed showValues height={260} summary={describe(revIdx, "Revenue")} />
        </Panel>
        <Panel title="Seasonal index · customers" kind="CALCULATED" subtitle={`${scope} · % above / below an average month`}>
          {haveCustomers ? (
            <Bars data={bars(custIdx, "var(--s2)")} format="pct" signed showValues height={260} summary={describe(custIdx, "Customers")} />
          ) : (
            <EmptyState title="Insufficient historical data">
              {store ? "Customer counts are" : "A customer count for every store is"} available for <span className="num">{usableCustomers}</span> months; 12 are needed. {!store && "A month is only used when every reporting store has a customer count."}
            </EmptyState>
          )}
        </Panel>
      </div>

      <Panel title="Index by calendar month" kind="CALCULATED" flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                {revIdx.map((i) => <th key={i.month} className="text-right">{monthName(i.month)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="whitespace-nowrap font-medium">Revenue index</td>
                {revIdx.map((i) => <td key={i.month} className="r">{i.index === null ? <Missing reason="No data for this month" /> : fmtNumber(i.index, 3)}</td>)}
              </tr>
              <tr>
                <td className="whitespace-nowrap font-medium">Customer index</td>
                {custIdx.map((i) => <td key={i.month} className="r">{!haveCustomers || i.index === null ? <Missing reason="No customer data" /> : fmtNumber(i.index, 3)}</td>)}
              </tr>
              <tr>
                <td className="whitespace-nowrap text-ink-2">Observations (revenue)</td>
                {revIdx.map((i) => <td key={i.month} className="r text-ink-2">{i.observations}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-line p-3 text-xs text-ink-2">
          <p><strong className="font-semibold text-ink">Method (ratio-to-trend).</strong> A straight-line trend is fitted to the whole monthly series by least squares. Each month&apos;s value is divided by the trend value at that month; the ratios are averaged per calendar month. <span className="num">1.000</span> = an average month; <span className="num">1.080</span> = 8% above. Dividing by the trend keeps steady growth from being read as seasonality.</p>
          <p className="font-mono text-2xs text-ink-3">index(month) = mean over years of [ value ÷ (intercept + slope × t) ] · chart shows (index − 1) × 100</p>
          <p className="text-ink-3">Not adjusted for: number of trading days or weekends in a month, moving holidays, price changes. February is short by construction.</p>
        </div>
      </Panel>

      <Panel title="Year-over-year comparison" kind="FACT" subtitle={`${scope} · monthly revenue, one line per calendar year`}>
        <TrendChart
          height={280}
          format="money"
          currency={currency}
          series={pivot.years.map((y, i) => ({ key: `y${y}`, label: String(y), color: seriesColor(i) }))}
          data={pivot.rows.map((r) => ({ label: monthName(r.month), ...Object.fromEntries(pivot.years.map((y) => [`y${y}`, r.values[y] ?? null])) }))}
          summary={`Recorded monthly revenue by calendar month, one line per year (${pivot.years.join(", ")}). Years are partial where the data window (${window}) starts or ends mid-year.`}
        />
      </Panel>

      <Panel title="Calendar context" subtitle="Dated calendar periods next to the observed index" flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Calendar context</th>
                <th className="text-right">Revenue index</th>
                <th className="text-right">vs average month</th>
                <th className="text-right">Customer index</th>
                <th className="text-right">Observations</th>
              </tr>
            </thead>
            <tbody>
              {context.map((r) => {
                const c = custAt(r.months);
                return (
                  <tr key={r.key}>
                    <td className="whitespace-nowrap font-medium">{r.period}</td>
                    <td className="min-w-[16rem] text-ink-2">
                      {r.context}
                      {r.note && <div className="text-xs text-ink-3">{r.note}</div>}
                    </td>
                    <td className="r">{r.index === null ? <Missing reason="No data for this period" /> : fmtNumber(r.index, 3)}</td>
                    <td className="r">{r.index === null ? <Missing reason="No data for this period" /> : fmtSignedPct(indexToPct(r.index))}</td>
                    <td className="r">{c === null ? <Missing reason="No customer index" /> : fmtNumber(c, 3)}</td>
                    <td className="r">{r.observations}{r.months.length > 1 ? " per month" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5 border-t border-line p-3 text-xs text-ink-2">
          <p className="flex flex-wrap items-center gap-1.5">
            <Tag kind="CORRELATION">Coincidence in time</Tag>
            A calendar period coinciding with a high or low index is an observation, not a proven explanation.
          </p>
          <p className="text-ink-3">
            The index describes calendar months; it does not isolate holidays. Easter Sunday is computed (Gregorian computus) and shown only for years inside the data window; a two-month period shows the mean of its monthly indices.
            Holiday dates are general calendar knowledge, not loaded from an official source{austria ? "; Austrian school holiday dates vary by federal state and are not stored" : ""}. Weather, promotions and local events in the same months are not in the system.
          </p>
        </div>
      </Panel>
    </div>
  );
}
