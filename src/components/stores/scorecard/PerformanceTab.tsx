import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TrendChart } from "@/components/charts";
import { kpiTile } from "@/components/overview/kpiTiles";
import { anomalyBasis, anomalyValue } from "@/components/overview/WhatChangedList";
import { Delta, Kpi, KpiGrid, Missing, Notice, Panel, Tag } from "@/components/ui";
import { filterFacts, kpisByStore } from "@/lib/analytics/aggregate";
import { findAnomalies, type Anomaly } from "@/lib/analytics/anomalies";
import { compareWithPeers } from "@/lib/analytics/peerComparison";
import { comparePeriods } from "@/lib/analytics/periodCompare";
import type { StoreDataQuality } from "@/lib/analytics/quality";
import type { KpiKey, MonthFact } from "@/lib/analytics/types";
import { calculateAverageBasket, calculateGrowthRate } from "@/lib/calc";
import { storeColorMap } from "@/lib/colors";
import { fmtDate, fmtMoney, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/format";
import { addMonths, monthLabel, monthLabelLong, monthRange, periodLabel } from "@/lib/period";
import { db } from "@/server/db";
import { getKnownEvents, getMonthFacts } from "@/server/queries";
import { DataQualityPanel } from "../DataQualityPanel";
import { minMonth, Question, type ScorecardProps } from "./shared";

/** Generic, unvalidated directions to look into — the same list for every store. Never a finding. */
const GENERIC_EXPLANATIONS: Record<string, string[]> = {
  revenue: ["a change in customer traffic", "a change in basket size (prices, promotions, assortment)", "more or fewer open days, or a shifted holiday", "something in the surroundings (construction, events, a competitor)"],
  customers: ["a change in accessibility or surroundings", "competitor activity nearby", "opening hours or open days", "weather, holidays or local events"],
  averageBasket: ["price or promotion changes", "assortment or availability changes", "a different customer mix (e.g. more small top-up purchases)"],
  grossMarginPct: ["a shift between high- and low-margin categories", "purchase price or promotion changes", "write-offs and waste"],
  cost: ["tariff or contract changes", "one-off payments or invoices booked in this month", "a change in volume or staffing"],
};

const PEER_KEYS: { key: KpiKey; label: string; fmt: (v: number, c: string) => string; formula: string }[] = [
  { key: "monthlyRevenue", label: "Monthly revenue", fmt: (v, c) => fmtMoney(v, c), formula: "Revenue / months" },
  { key: "customersPerDay", label: "Customers / day", fmt: (v) => fmtNumber(v), formula: "Customers / open days" },
  { key: "averageBasket", label: "Average basket", fmt: (v, c) => fmtMoney(v, c, 2), formula: "Revenue / transactions" },
  { key: "revenuePerSqm", label: "Revenue / m² · month", fmt: (v, c) => fmtMoney(v, c), formula: "Monthly revenue / sales area" },
  { key: "revenuePerEmployee", label: "Revenue / employee · month", fmt: (v, c) => fmtMoney(v, c), formula: "Monthly revenue / employees" },
  { key: "grossMarginPct", label: "Gross margin", fmt: (v) => fmtPct(v), formula: "Σ(revenue × margin) / Σ revenue" },
  { key: "costRatioPct", label: "Operating cost ratio", fmt: (v) => fmtPct(v), formula: "Operating costs / revenue" },
];

/** What moved in the same comparison as the anomaly (same basis), computed from the two months involved. */
function companions(a: Anomaly, own: Map<string, MonthFact>) {
  const cur = own.get(a.month);
  const ref = own.get(addMonths(a.month, a.basis === "yoy" ? -12 : -1));
  if (!cur || !ref) return [];
  const rows = [
    { key: "revenue", label: "Revenue", value: calculateGrowthRate(cur.revenue, ref.revenue) },
    { key: "customers", label: "Customers", value: calculateGrowthRate(cur.customers, ref.customers) },
    { key: "averageBasket", label: "Basket", value: calculateGrowthRate(calculateAverageBasket(cur.revenue, cur.transactions), calculateAverageBasket(ref.revenue, ref.transactions)) },
    { key: "openDays", label: "Open days", value: calculateGrowthRate(cur.openDays, ref.openDays) },
  ];
  return rows.filter((r) => r.key !== a.metric);
}

export async function PerformanceTab({ orgId, store, stores, currency, period, latest, canEdit, quality }: ScorecardProps & { quality: StoreDataQuality }) {
  const chartFrom = minMonth(period.from, addMonths(period.to, -11));
  const chartMonths = monthRange(chartFrom, period.to);
  const factsFrom = minMonth(addMonths(latest, -35), period.previousYear.from, period.previous.from, addMonths(chartFrom, -12));
  const [facts, events, strategyCount, experiments] = await Promise.all([
    getMonthFacts(orgId, { from: factsFrom, to: latest }),
    getKnownEvents(orgId, store.id),
    db.strategy.count({ where: { organizationId: orgId, storeId: store.id } }),
    db.experiment.groupBy({ by: ["status"], where: { organizationId: orgId, OR: [{ testStoreId: store.id }, { controlStoreId: store.id }] }, _count: { _all: true } }),
  ]);
  const ownFacts = facts.filter((f) => f.storeId === store.id);
  const own = new Map(ownFacts.map((f) => [f.month, f]));
  const cmp = comparePeriods(ownFacts, [store], period);
  const color = storeColorMap(stores)[store.id] ?? "var(--s1)";
  const range = periodLabel(period);
  const base = `/stores/${store.id}`;

  const hasPrevYear = chartMonths.some((m) => own.has(addMonths(m, -12)));
  const trend = chartMonths.map((m) => ({
    label: monthLabel(m),
    revenue: own.get(m)?.revenue ?? null,
    prevYear: own.get(addMonths(m, -12))?.revenue ?? null,
  }));
  const chartEvents = events.filter((e) => e.date.slice(0, 7) >= chartFrom && e.date.slice(0, 7) <= period.to);
  const markers = chartEvents.map((e) => ({ label: monthLabel(e.date.slice(0, 7)), text: e.title }));

  const anomalies = findAnomalies(ownFacts, [store], events).slice(0, 4);
  const allAnomalies = findAnomalies(ownFacts, [store], events).length;

  const periodFacts = filterFacts(facts, period);
  const byStore = kpisByStore(periodFacts, stores);
  // Only stores with data in the period are peers.
  for (const [id, k] of byStore) if (k.months === 0 && id !== store.id) byStore.delete(id);
  const peers = compareWithPeers(store.id, byStore, PEER_KEYS.map((p) => p.key));
  const peerCount = byStore.size - 1;

  const expCount = (s: string) => experiments.find((e) => e.status === s)?._count._all ?? 0;
  const missingLabels = quality.missing.map((m) => m.label);

  if (ownFacts.length === 0) {
    return (
      <>
        <Notice tone="unavailable" title="No monthly data for this store" action={canEdit ? <Link href={`${base}/data`} className="btn-primary btn-sm">Enter data</Link> : undefined}>
          Performance, changes and comparisons are calculated from monthly revenue. Nothing is shown until at least one month is recorded.
        </Notice>
        <Question n={5}>What information is missing?</Question>
        <DataQualityPanel quality={quality} storeId={store.id} canEdit={canEdit} />
      </>
    );
  }

  return (
    <>
      <Question n={1} hint={<><span className="num">{range}</span> · vs <span className="num">{periodLabel(period.previous)}</span>{!cmp.referencesCoincide && <> and <span className="num">{periodLabel(period.previousYear)}</span></>}</>}>How is this store performing?</Question>
      <KpiGrid cols={4}>
        <Kpi {...kpiTile(cmp, "monthlyRevenue", currency, { size: "lg", formula: `Revenue / months · ${fmtMoney(cmp.current.revenue, currency)} total` })} />
        <Kpi {...kpiTile(cmp, "customersPerDay", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "averageBasket", currency, { size: "lg" })} />
        <Kpi {...kpiTile(cmp, "revenuePerSqm", currency, { size: "lg", label: "Revenue / m² · month" })} />
        <Kpi label="Employees" value={store.employees === null ? null : fmtNumber(store.employees)} missingReason="Not provided" formula="Master data · current value, no history" />
        <Kpi {...kpiTile(cmp, "grossMarginPct", currency)} />
        <Kpi {...kpiTile(cmp, "revenuePerEmployee", currency, { label: "Revenue / employee · month" })} />
        <Kpi {...kpiTile(cmp, "operatingProfit", currency)} />
      </KpiGrid>
      <p className="mb-3 mt-1.5 text-xs text-ink-3">
        <Tag kind="CALCULATED" className="mr-1.5" />
        Computed from this store’s monthly figures. A comparison shows — when the comparison period is not fully covered by data. Annual revenue is the sum of the entered months.
      </p>

      <Panel title="Revenue trend" subtitle={`${monthLabel(chartFrom)} – ${monthLabel(period.to)}${markers.length ? ` · ${markers.length} known event${markers.length === 1 ? "" : "s"} marked` : ""}`}>
        <TrendChart
          data={trend}
          series={[
            { key: "revenue", label: "Revenue", color },
            ...(hasPrevYear ? [{ key: "prevYear", label: "Same month, previous year", color: "rgb(var(--ink-3))", dashed: true }] : []),
          ]}
          markers={markers} format="money" currency={currency} height={260}
          summary={
            `Monthly revenue of ${store.name}, ${monthLabel(chartFrom)} to ${monthLabel(period.to)}.` +
            (hasPrevYear ? " The dashed line is the same month one year earlier." : " No data from one year earlier is on record.") +
            (markers.length ? " Dotted vertical lines mark known events; they are not shown as causes." : "")
          }
        />
        {chartEvents.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2 text-xs text-ink-2">
            {chartEvents.map((e) => (
              <li key={e.id}><span className="num text-ink-3">{fmtDate(e.date)}</span> · {e.title}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Question n={2} hint="Months that deviate from this store’s own typical change">What changed?</Question>
      {anomalies.length === 0 ? (
        <Notice tone="info" title="No unusual months detected">
          The rule compares each month’s change with the store’s own typical change (median ± robust spread). It needs at least 5 consecutive months;
          <span className="num"> {ownFacts.length}</span> are on record. Nothing flagged does not mean nothing happened.
        </Notice>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a) => {
            const comp = companions(a, own);
            const explanations = GENERIC_EXPLANATIONS[a.metric.startsWith("cost:") ? "cost" : a.metric] ?? [];
            const gaps = [
              ...(a.knownEvents.length === 0 ? ["Whether anything happened at or around the store in this period — no event is recorded."] : []),
              ...(quality.missing.some((m) => m.key === "hourlyTraffic") && (a.metric === "customers" || a.metric === "revenue") ? ["Hourly traffic: when during the day the change occurred."] : []),
              ...(quality.missing.some((m) => m.key === "locationResearch") ? ["Location research: what is around the store."] : []),
              ...(quality.missing.some((m) => m.key === "categoryRevenue") && a.metric !== "customers" ? ["Category revenue: which part of the assortment moved."] : []),
              "Daily or weekly figures — monthly data cannot show when in the month the change began.",
            ];
            return (
              <article key={`${a.metric}-${a.month}`} className="rounded-md border border-line bg-surface">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                  <h3 className="text-[13px] font-semibold">
                    {a.metricLabel} <span className="num">{fmtSignedPct(a.changePct)}</span> in <span className="num">{monthLabelLong(a.month)}</span>
                  </h3>
                  <span className="num text-xs text-ink-3">{anomalyValue(a, currency)} · {anomalyBasis(a)} · robust z {a.zScore > 0 ? "+" : "−"}{fmtNumber(Math.abs(a.zScore), 1)}</span>
                </header>
                <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-4">
                  <section className="bg-surface p-3">
                    <div className="mb-1.5"><Tag kind="CALCULATED">Observed</Tag></div>
                    <p className="text-xs text-ink-2">
                      {a.metricLabel} was <span className="num font-medium text-ink">{anomalyValue(a, currency)}</span>, <span className="num">{fmtSignedPct(a.changePct)}</span> {anomalyBasis(a)}. That is unusual for this store’s own history.
                    </p>
                    {comp.length > 0 && (
                      <dl className="mt-2 space-y-0.5 text-xs">
                        {comp.map((c) => (
                          <div key={c.key} className="flex items-baseline justify-between gap-2">
                            <dt className="text-ink-3">{c.label}, same comparison</dt>
                            <dd><Delta value={c.value} goodWhen="none" /></dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                  <section className="bg-surface p-3">
                    <div className="mb-1.5"><Tag kind="FACT">Known events on record</Tag></div>
                    {a.knownEvents.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {a.knownEvents.map((e) => (
                          <li key={e.date + e.title}>
                            <span className="num text-ink-3">{fmtDate(e.date)}</span> · <span className="font-medium">{e.title}</span>
                            {e.description && <div className="text-ink-2">{e.description}</div>}
                          </li>
                        ))}
                        <li className="text-ink-3">Recorded in the same or the preceding month. Timing alone does not show it caused the change.</li>
                      </ul>
                    ) : (
                      <p className="text-xs text-ink-3">None recorded for {monthLabel(a.month)} or the month before.</p>
                    )}
                  </section>
                  <section className="bg-surface p-3">
                    <div className="mb-1.5"><Tag kind="HYPOTHESIS">Possible explanations · generic</Tag></div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-2">
                      {explanations.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                    <p className="mt-1.5 text-xs text-ink-3">A standard checklist for this metric — not derived from this store’s data and not validated.</p>
                  </section>
                  <section className="bg-surface p-3">
                    <div className="mb-1.5"><Tag kind="UNKNOWN">Missing information</Tag></div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-2">
                      {gaps.map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  </section>
                </div>
              </article>
            );
          })}
          <p className="text-xs text-ink-3">
            Showing the <span className="num">{anomalies.length}</span> most recent of <span className="num">{allAnomalies}</span> flagged months.{" "}
            <Link href="/analytics?tab=anomalies" className="link">All anomalies and the detection rule</Link>
            {canEdit && <> · <Link href={`${base}/data`} className="link">Record a known event</Link></>}
          </p>
        </div>
      )}

      <Question n={3} hint={<><span className="num">{range}</span> · median of the other stores with data</>}>How does it compare?</Question>
      {peerCount < 1 ? (
        <Notice tone="unavailable" title="No other store to compare with">A comparison needs at least one other store with data in this period.</Notice>
      ) : (
        <Panel
          title="Compared with other stores" kind="FACT" flush
          actions={<Link href={`/compare?stores=${stores.map((s) => s.id).slice(0, 4).join(",")}`} className="btn-ghost btn-sm">Side by side <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th className="text-right">{store.name}</th>
                  <th className="text-right">Median of others</th>
                  <th className="text-right">Difference</th>
                  <th className="text-right">Stores in median</th>
                  <th>Formula</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p) => {
                  const def = PEER_KEYS.find((d) => d.key === p.key)!;
                  return (
                    <tr key={p.key}>
                      <td className="font-medium">{def.label}</td>
                      <td className="r font-medium">{p.value === null ? <Missing reason="Input missing for this store" /> : def.fmt(p.value, currency)}</td>
                      <td className="r">{p.peerMedian === null ? <Missing reason="No other store has this value" /> : def.fmt(p.peerMedian, currency)}</td>
                      <td className="r"><Delta value={p.difference} unit={p.unit} goodWhen="none" /></td>
                      <td className="r text-ink-2">{p.peers}</td>
                      <td className="font-mono text-2xs text-ink-3">{def.formula}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
            Difference = (store − median) / median × 100; margin and cost ratio in percentage points. Differences are not coloured: whether higher is better depends on store type and location. Stores differ in format, size and surroundings, so a gap is a fact about the data, not a verdict.
          </p>
        </Panel>
      )}

      <Question n={4}>What might explain the difference?</Question>
      <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Tag kind="HYPOTHESIS" />
          <span className="text-[13px] font-semibold">Possible explanations — none of these is established</span>
        </div>
        <p className="max-w-4xl text-xs leading-5 text-ink-2">
          The comparison above shows <em>that</em> this store differs from the others, not <em>why</em>. Differences between stores commonly relate to one or more of the following.
          This list is the same for every store; RetailLab has not tested any of it for {store.name}.
        </p>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-ink-2 sm:grid-cols-2 xl:grid-cols-5">
          <li><span className="font-medium text-ink">Traffic</span> — how many people pass and enter. <Link href={`${base}?tab=customers`} className="link">Customers</Link></li>
          <li><span className="font-medium text-ink">Assortment</span> — the category mix and its margins. <Link href={`${base}?tab=categories`} className="link">Categories</Link></li>
          <li><span className="font-medium text-ink">Location</span> — surroundings, access, parking. <Link href={`${base}?tab=location`} className="link">Location</Link></li>
          <li><span className="font-medium text-ink">Opening hours</span> — when the store can sell at all. <Link href={`${base}?tab=customers`} className="link">Hourly profile</Link></li>
          <li><span className="font-medium text-ink">Competition</span> — who else serves the area. <Link href={`${base}?tab=competition`} className="link">Competition</Link></li>
        </ul>
        <p className="mt-2 text-xs text-ink-3">
          A pattern across a handful of stores is a correlation at best. Only a controlled test at this store can show whether a change makes a difference.
        </p>
      </div>

      <Question n={5}>What information is missing?</Question>
      <DataQualityPanel quality={quality} storeId={store.id} canEdit={canEdit} />

      <Question n={6}>What can we test — and what have tests shown?</Question>
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
        <div className="bg-surface p-3">
          <div className="label">Hypotheses for this store</div>
          <div className="num mt-1 text-lg font-semibold">{fmtNumber(strategyCount)}</div>
          <p className="mt-1 text-xs text-ink-2">
            {strategyCount === 0
              ? "No hypotheses on file. They are generated by transparent rules from the data on record, or written by you."
              : "Each is an untested idea with its observation, assumptions and a proposed test — not a recommendation."}
            {missingLabels.length > 0 && <> Missing data ({missingLabels.slice(0, 3).join(", ")}{missingLabels.length > 3 ? ", …" : ""}) limits which rules can run.</>}
          </p>
          <Link href={`${base}?tab=strategies`} className="link mt-2 inline-flex items-center gap-1 text-xs">Open hypotheses <ArrowRight className="h-3 w-3" aria-hidden /></Link>
        </div>
        <div className="bg-surface p-3">
          <div className="label">Experiments involving this store</div>
          <div className="num mt-1 flex flex-wrap items-baseline gap-x-4 text-lg font-semibold">
            <span>{expCount("RUNNING")} <span className="text-xs font-normal text-ink-3">running</span></span>
            <span>{expCount("COMPLETED")} <span className="text-xs font-normal text-ink-3">completed</span></span>
            <span>{expCount("PLANNED")} <span className="text-xs font-normal text-ink-3">planned</span></span>
            {expCount("STOPPED") > 0 && <span>{expCount("STOPPED")} <span className="text-xs font-normal text-ink-3">stopped</span></span>}
          </div>
          <p className="mt-1 text-xs text-ink-2">Measured before/after results, with a control store where one was used. Results are reported with their limitations.</p>
          <Link href={`${base}?tab=experiments`} className="link mt-2 inline-flex items-center gap-1 text-xs">Open experiments <ArrowRight className="h-3 w-3" aria-hidden /></Link>
        </div>
      </div>
    </>
  );
}
