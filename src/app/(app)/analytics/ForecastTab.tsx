import { TrendChart } from "@/components/charts";
import { CalcBlock, EmptyState, Notice, Panel, Tag } from "@/components/ui";
import { FilterBar, Segmented, StoreSelect, analyticsHref, one, type TabProps } from "@/components/analytics/shared";
import { seriesByMonth } from "@/lib/analytics/aggregate";
import { forecastSeries } from "@/lib/calc";
import { fmtMoney, fmtNumber, fmtSignedMoney } from "@/lib/format";
import { addMonths, monthLabel, monthNumber, monthRange } from "@/lib/period";
import { getMonthFacts } from "@/server/queries";

const HORIZONS = [3, 6, 12] as const;

export async function ForecastTab({ orgId, currency, aiExplanations, stores, store, sp }: TabProps) {
  const horizon = HORIZONS.find((h) => String(h) === one(sp.h)) ?? 6;
  const explain = one(sp.explain) === "1" ? true : one(sp.explain) === "0" ? false : aiExplanations;
  const facts = await getMonthFacts(orgId, store ? { storeIds: [store.id] } : {});
  const scope = store ? store.name : `all ${stores.length} stores`;
  const points = seriesByMonth(facts, stores);

  const filters = (
    <FilterBar>
      <StoreSelect stores={stores} value={store?.id ?? "all"} />
      <Segmented label="Horizon" active={String(horizon)} items={HORIZONS.map((h) => ({ key: String(h), label: `${h} months`, href: analyticsHref(sp, { h: h === 6 ? null : String(h) }) }))} />
      <Segmented
        label="Explanations" active={explain ? "1" : "0"}
        items={[
          { key: "1", label: "On", href: analyticsHref(sp, { explain: "1" }) },
          { key: "0", label: "Off", href: analyticsHref(sp, { explain: "0" }) },
        ]}
      />
      {one(sp.explain) === undefined && <span className="text-xs text-ink-3">Default from organization setting ({aiExplanations ? "on" : "off"})</span>}
    </FilterBar>
  );

  if (points.length === 0) return <>{filters}<EmptyState title="No revenue data for this selection" /></>;
  const first = points[0]!.month;
  const last = points[points.length - 1]!.month;
  const months = monthRange(first, last);
  const byMonth = new Map(points.map((p) => [p.month, p.revenue]));
  const history = months.map((m) => ({ key: m, month: monthNumber(m), value: byMonth.get(m) ?? null }));
  const usable = history.filter((p) => p.value !== null).length;
  const result = forecastSeries(history, horizon);
  const storeCounts = months.map((m) => new Set(facts.filter((f) => f.month === m).map((f) => f.storeId)).size).filter((c) => c > 0);
  const unevenStores = !store && new Set(storeCounts).size > 1;

  if (!result) {
    return (
      <>
        {filters}
        <EmptyState title="Insufficient historical data">
          A forecast needs at least 12 months of revenue. {scope} has <span className="num">{usable}</span>. No projection is made from fewer months.
        </EmptyState>
      </>
    );
  }

  const fc = result.points.map((p) => ({ ...p, key: addMonths(last, p.step) }));
  const lastValue = history[history.length - 1]!.value;
  const data = [
    ...history.map((p, i) => ({
      label: monthLabel(p.key),
      actual: p.value,
      // Repeat the last actual on the forecast series so the dashed line starts where the solid one ends.
      forecast: i === history.length - 1 ? p.value : null,
    })),
    ...fc.map((p) => ({ label: monthLabel(p.key), actual: null, forecast: p.value, band: [p.lower, p.upper] as [number, number] })),
  ];
  const pctInterval = result.intervalZ === 1.28 ? "≈ 80%" : `z = ${result.intervalZ}`;
  const total = fc.reduce((a, p) => a + p.value, 0);
  const seasonal = result.model !== "linear-trend";

  const rawTable = (
    <div className="scroll-thin overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Month</th>
            <th className="text-right">Step</th>
            <th className="text-right">Forecast</th>
            <th className="text-right">Lower</th>
            <th className="text-right">Upper</th>
            <th className="text-right">± half-width</th>
          </tr>
        </thead>
        <tbody>
          {fc.map((p) => (
            <tr key={p.key}>
              <td className="whitespace-nowrap font-medium">{monthLabel(p.key)}</td>
              <td className="r text-ink-3">{p.step}</td>
              <td className="r">{fmtMoney(p.value, currency)}</td>
              <td className="r">{fmtMoney(p.lower, currency)}</td>
              <td className="r">{fmtMoney(p.upper, currency)}</td>
              <td className="r text-ink-2">{fmtMoney((p.upper - p.lower) / 2, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const parameters = (
    <CalcBlock
      lines={[
        { label: "Model", result: result.model },
        { label: "History used", expr: `${monthLabel(first)} – ${monthLabel(last)}`, result: `${usable} months` },
        { label: "Trend slope", expr: "least-squares, per month", result: fmtSignedMoney(result.slopePerPeriod, currency) },
        { label: "Residual standard deviation", expr: "actual − fitted, n − 1", result: fmtMoney(result.residualStdev, currency) },
        { label: "Interval z", expr: pctInterval, result: fmtNumber(result.intervalZ, 2) },
        { label: "Interval", expr: "forecast ± z × sd × √(1 + step ÷ n)", result: `n = ${usable}` },
        { label: `Σ forecast, ${horizon} months`, result: fmtMoney(total, currency), emphasis: true },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      <div>
        {filters}
        {explain && (
          <Notice tone="info" title="A statistical projection, not a certainty">
            The forecast extends the straight-line trend of past revenue{seasonal ? " and repeats each calendar month's historical seasonal index" : ""}. It answers &ldquo;what if the past pattern simply continued?&rdquo; — it does not know about anything that has not already shaped the history.
          </Notice>
        )}
        {unevenStores && (
          <Notice tone="warn" className="mt-2" title="The number of reporting stores changes over time">
            The history is the sum of all stores with data in each month ({Math.min(...storeCounts)}–{Math.max(...storeCounts)} stores). A store joining or leaving bends the trend. Select a single store for a clean series.
          </Notice>
        )}
      </div>

      <Panel title="Revenue forecast" kind="FORECAST" subtitle={`${scope} · ${monthLabel(fc[0]!.key)} – ${monthLabel(fc[fc.length - 1]!.key)} · ${result.model}`}>
        <TrendChart
          height={320}
          zeroBased={false}
          format="money"
          currency={currency}
          series={[
            { key: "actual", label: "Recorded revenue", color: "var(--s1)" },
            { key: "forecast", label: "Forecast", color: "var(--s1)", dashed: true },
          ]}
          data={data}
          bandKey="band"
          bandLabel={`Interval (${pctInterval})`}
          markers={[{ label: monthLabel(last), text: "last recorded month" }]}
          summary={`Monthly revenue, ${scope}: recorded ${monthLabel(first)} – ${monthLabel(last)} (solid), projected ${horizon} months (dashed) with the ${pctInterval} interval as a shaded band. The dotted vertical line marks the last recorded month. The y-axis does not start at zero.`}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Model output" kind="FORECAST" subtitle="Raw values" flush>{rawTable}</Panel>
        <Panel title="Parameters" kind="CALCULATED">{parameters}</Panel>
      </div>

      {explain && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Assumptions" kind="ASSUMPTION">
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
              {result.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
            <p className="mt-2 border-t border-line pt-2 text-xs text-ink-2">
              <strong className="font-semibold text-ink">Interval definition.</strong> forecast ± <span className="num">{fmtNumber(result.intervalZ, 2)}</span> × residual standard deviation × √(1 + step ÷ n).
              If past errors were normally distributed and representative of future ones, about 80% of outcomes would fall inside. It widens with the horizon, but it is a simple approximation — not a full prediction interval — and it covers only the scatter seen in the history, not structural change.
              The residuals are in-sample: the same {usable} months were used to fit the trend{seasonal ? " and the seasonal indices" : ""}, so the interval most likely understates the real uncertainty.
            </p>
          </Panel>
          <Panel title="What the forecast ignores" subtitle="Not in the model">
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
              <li>Planned or possible events: store openings and closures, refits, price or assortment changes, promotions.</li>
              <li>Competitors, local construction, weather, inflation and the wider economy.</li>
              <li>Moving holidays and the number of trading days in a month.</li>
              <li>Anything a strategy or experiment in RetailLab might change — the forecast is not a target and not a baseline that proves an effect.</li>
              {seasonal && <li>The seasonal index rests on at most {Math.floor(usable / 12)} observations per calendar month; one unusual month in the history is repeated in the projection.</li>}
            </ul>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-xs text-ink-3">
              <Tag kind="UNKNOWN" /> How accurate this model has been for {scope} is not measured: there is no held-out period to test it against.
            </p>
          </Panel>
        </div>
      )}
      {!explain && <p className="text-xs text-ink-3">Explanations are off: only raw model output and parameters are shown. Values are a statistical projection (FORECAST), not recorded data.</p>}
    </div>
  );
}
