import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { TrendChart, type ValueFormat } from "@/components/charts";
import { Chip, EmptyState, Notice, Panel, Tag } from "@/components/ui";
import { ParamSelect } from "@/components/analytics/ParamSelect";
import { FilterBar, Segmented, StoreSelect, Swatch, analyticsHref, one, type TabProps } from "@/components/analytics/shared";
import { ANOMALY_METRIC_LABELS, findAnomalies, type Anomaly, type AnomalyMetric } from "@/lib/analytics/anomalies";
import { anomalyGuidance, metricSeries, typicalChange } from "@/lib/analytics/anomalyContext";
import { storeColorMap } from "@/lib/colors";
import { fmtDate, fmtMoney, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/format";
import { addMonths, monthLabel, monthLabelLong } from "@/lib/period";
import { getKnownEvents, getLatestMonth, getMonthFacts } from "@/server/queries";

function metricFormat(metric: AnomalyMetric): ValueFormat {
  if (metric === "customers") return "number";
  if (metric === "averageBasket") return "money2";
  if (metric === "grossMarginPct") return "pct";
  return "money";
}

function fmtMetric(v: number | null, metric: AnomalyMetric, currency: string): string {
  if (metric === "customers") return fmtNumber(v);
  if (metric === "averageBasket") return fmtMoney(v, currency, 2);
  if (metric === "grossMarginPct") return fmtPct(v);
  return fmtMoney(v, currency);
}

function SectionLabel({ children, tag }: { children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5">
      <h4 className="label text-ink-2">{children}</h4>
      {tag}
    </div>
  );
}

export async function AnomaliesTab({ orgId, currency, stores, store, sp }: TabProps) {
  const latest = await getLatestMonth(orgId);
  if (!latest) return <EmptyState title="No revenue data yet" />;
  const from = addMonths(latest, -23);
  const [facts, events] = await Promise.all([getMonthFacts(orgId, { from, to: latest }), getKnownEvents(orgId)]);
  const all = findAnomalies(facts, stores, events);
  const colors = storeColorMap(stores);

  const windowMonths = one(sp.window) === "24" ? 24 : 12;
  const metric = one(sp.m) && ANOMALY_METRIC_LABELS[one(sp.m)!] ? one(sp.m)! : "all";
  const dir = one(sp.dir) === "up" || one(sp.dir) === "down" ? (one(sp.dir) as "up" | "down") : "all";
  const cutoff = addMonths(latest, -(windowMonths - 1));
  const inWindow = all.filter((a) => a.month >= cutoff);
  const shown = inWindow.filter((a) => (!store || a.storeId === store.id) && (metric === "all" || a.metric === metric) && (dir === "all" || a.direction === dir));
  const metricsPresent = [...new Set(all.map((a) => a.metric))];
  const analysed = ["revenue", "customers", "averageBasket", "grossMarginPct", "cost:ENERGY", "cost:WASTE", "cost:PERSONNEL"];
  const monthsOfData = new Set(facts.map((f) => f.month)).size;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg leading-7">Something changed.</h2>
        <p className="max-w-3xl text-ink-2">
          Months in which a metric moved unusually compared with that store&apos;s own typical change. Each entry is an observation.
          RetailLab does not know the cause and does not guess one: recorded events are listed as context, candidate explanations are labelled as hypotheses.
        </p>
      </div>

      <div>
        <FilterBar>
          <StoreSelect stores={stores} value={store?.id ?? "all"} />
          <ParamSelect
            param="m" label="Metric" value={metric} defaultValue="all"
            options={[{ value: "all", label: "All metrics" }, ...analysed.map((m) => ({ value: m, label: `${ANOMALY_METRIC_LABELS[m] ?? m}${metricsPresent.includes(m as AnomalyMetric) ? "" : " (none flagged)"}` }))]}
          />
          <Segmented
            label="Direction" active={dir}
            items={[
              { key: "all", label: "Both", href: analyticsHref(sp, { dir: null }) },
              { key: "up", label: "Up", href: analyticsHref(sp, { dir: "up" }) },
              { key: "down", label: "Down", href: analyticsHref(sp, { dir: "down" }) },
            ]}
          />
          <Segmented
            label="Flagged in" active={String(windowMonths)}
            items={[
              { key: "12", label: "Last 12 months", href: analyticsHref(sp, { window: null }) },
              { key: "24", label: "Last 24 months", href: analyticsHref(sp, { window: "24" }) },
            ]}
          />
        </FilterBar>
        <p className="text-xs text-ink-3">
          <span className="num">{shown.length}</span> of <span className="num">{inWindow.length}</span> anomalies flagged between {monthLabel(cutoff)} and {monthLabel(latest)} match the filters
          · detection ran over {monthLabel(from)} – {monthLabel(latest)} (<span className="num">{monthsOfData}</span> months with data) for {stores.length} stores.
        </p>
      </div>

      <details className="rounded-md border border-line bg-surface">
        <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold">How detection works</summary>
        <div className="space-y-2 border-t border-line px-3 py-3 text-xs text-ink-2">
          <p>A fixed, transparent rule — no machine learning, no model that could &ldquo;know&rdquo; a reason.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              For each store and metric, every month is compared with <strong className="font-semibold text-ink">the same month one year earlier</strong> (percentage change).
              This needs at least <span className="num">16</span> months of history; with less, each month is compared with the previous month instead.
            </li>
            <li>
              The <strong className="font-semibold text-ink">typical change</strong> of the series is the median of those changes. The <strong className="font-semibold text-ink">spread</strong> is
              <span className="num"> 1.4826 ×</span> the median absolute deviation from that median — a robust stand-in for the standard deviation that a single extreme month cannot inflate
              (if it is zero, the ordinary standard deviation is used).
            </li>
            <li>
              A month is flagged when both hold: its <strong className="font-semibold text-ink">robust z</strong> = (change − typical change) ÷ spread is at least <span className="num">2.5</span> in either direction,
              and the change differs from the typical change by at least <span className="num">5</span> percentage points (<span className="num">3</span> for gross margin).
            </li>
          </ol>
          <p>
            Consequence: a store growing steadily at +12% is not flagged; a store that normally grows +2% and shows −12% is.
            Analysed metrics: revenue, customer traffic, average basket, gross margin, and energy, waste and personnel cost. A series needs at least 4 comparable months.
            &ldquo;Unusual for this series&rdquo; says nothing about why — and with 12 year-over-year changes per series the typical change itself is a rough estimate.
          </p>
        </div>
      </details>

      {shown.length === 0 ? (
        <EmptyState title={inWindow.length === 0 ? "No anomalies flagged" : "No anomaly matches these filters"}>
          {monthsOfData < 5
            ? "Insufficient historical data: at least 5 months are needed before a month can be compared with the series' typical change."
            : "No month deviates from its series' typical change by more than the thresholds. That is a statement about the rule, not a guarantee that nothing happened."}
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {shown.map((a) => <AnomalyCard key={`${a.storeId}-${a.metric}-${a.month}`} a={a} currency={currency} color={colors[a.storeId] ?? "var(--s1)"} series={metricSeries(facts, a.storeId, a.metric, from, latest)} />)}
        </ol>
      )}
    </div>
  );
}

function AnomalyCard({ a, currency, color, series }: { a: Anomaly; currency: string; color: string; series: { month: string; value: number | null }[] }) {
  const compareMonth = addMonths(a.month, a.basis === "yoy" ? -12 : -1);
  const compareValue = series.find((p) => p.month === compareMonth)?.value ?? null;
  const typical = typicalChange(series.map((p) => p.value), a.basis);
  const g = anomalyGuidance(a.metric);
  const Icon = a.direction === "up" ? ArrowUpRight : ArrowDownRight;
  const basisText = a.basis === "yoy" ? "same month last year" : "previous month";
  return (
    <li>
      <Panel
        title={<span className="flex min-w-0 flex-wrap items-center gap-x-2"><span><Swatch color={color} />{a.storeName}</span><span className="font-normal text-ink-2">{a.metricLabel} · {monthLabelLong(a.month)}</span></span>}
        actions={<Chip tone="neutral"><Icon className="mr-0.5 h-3 w-3" aria-hidden />{a.direction === "up" ? "Higher than typical" : "Lower than typical"}</Chip>}
        flush
      >
        <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-px bg-line sm:grid-cols-2">
            <section className="bg-surface p-3">
              <SectionLabel tag={<Tag kind="CALCULATED" />}>Observed anomaly</SectionLabel>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="num text-lg font-semibold">{fmtMetric(a.value, a.metric, currency)}</span>
                <span className="num font-medium">{fmtSignedPct(a.changePct)}</span>
                <span className="text-xs text-ink-3">vs {basisText}</span>
              </div>
              <dl className="mt-1.5 space-y-0.5 text-xs text-ink-2">
                <div className="flex justify-between gap-3"><dt>{monthLabel(compareMonth)} ({basisText})</dt><dd className="num">{fmtMetric(compareValue, a.metric, currency)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Typical change of this series</dt><dd className="num">{fmtSignedPct(typical)}</dd></div>
                <div className="flex justify-between gap-3"><dt>How unusual (robust z)</dt><dd className="num font-medium text-ink">{a.zScore > 0 ? "+" : "−"}{fmtNumber(Math.abs(a.zScore), 1)}</dd></div>
              </dl>
              <p className="mt-1.5 font-mono text-[10px] leading-4 text-ink-3">z = (change − typical change) ÷ spread · flagged at |z| ≥ 2.5{a.metric === "grossMarginPct" ? " · change is relative (% of the margin value), not points" : ""}</p>
            </section>
            <section className="bg-surface p-3">
              <SectionLabel tag={<Tag kind="FACT">On record</Tag>}>Known events</SectionLabel>
              {a.knownEvents.length === 0 ? (
                <p className="text-xs text-ink-3">No event recorded for this period.</p>
              ) : (
                <>
                  <ul className="space-y-1.5 text-xs">
                    {a.knownEvents.map((e) => (
                      <li key={`${e.date}-${e.title}`}>
                        <div className="font-medium"><span className="num text-ink-3">{fmtDate(e.date)}</span> · {e.title}</div>
                        {e.description && <div className="text-ink-2">{e.description}</div>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-ink-3">Recorded by your organization in the same or the previous month. Timing alone does not establish that it caused the change.</p>
                </>
              )}
            </section>
            <section className="bg-surface p-3">
              <SectionLabel tag={<Tag kind="HYPOTHESIS" />}>Possible explanations</SectionLabel>
              <dl className="space-y-1 text-xs">
                <div><dt className="inline font-medium text-ink-2">Internal: </dt><dd className="inline text-ink-2">{g.internal.join(" · ")}</dd></div>
                <div><dt className="inline font-medium text-ink-2">External: </dt><dd className="inline text-ink-2">{g.external.join(" · ")}</dd></div>
              </dl>
              <p className="mt-1.5 text-xs text-ink-3">Generic candidates for this type of metric — not derived from this store&apos;s data, none verified.</p>
            </section>
            <section className="bg-surface p-3">
              <SectionLabel tag={<Tag kind="UNKNOWN">Not in the system</Tag>}>Missing information</SectionLabel>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-2">
                {g.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </section>
          </div>
          <div className="border-t border-line p-3 lg:border-l lg:border-t-0">
            <TrendChart
              height={170}
              format={metricFormat(a.metric)}
              currency={currency}
              zeroBased={false}
              series={[{ key: "v", label: a.metricLabel, color }]}
              data={series.map((p) => ({ label: monthLabel(p.month), v: p.value }))}
              markers={[{ label: monthLabel(a.month), text: "flagged month" }]}
              summary={`${a.metricLabel} per month, ${a.storeName}. The dotted vertical line marks ${monthLabel(a.month)}. The y-axis does not start at zero.`}
            />
          </div>
        </div>
      </Panel>
    </li>
  );
}
