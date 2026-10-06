import type { KpiKey, Kpis } from "@/lib/analytics/types";
import { fmtDate, fmtDistance, fmtMoney, fmtNumber, fmtPct, fmtSignedMoney, fmtSignedPct, fmtSignedPts, humanize, MISSING } from "@/lib/format";
import { monthLabel, monthLabelLong, periodLabel } from "@/lib/period";
import { CAPABILITIES, EXAMPLE_QUESTIONS } from "./router";
import type {
  AnomaliesResult, BasketChangeToolResult, Block, CompareStoresResult, DecliningTrafficResult, EventLite, ExperimentsResult,
  ExplainRevenueResult, ListStoresResult, Plan, ResearchToolResult, RevenueScenarioToolResult, StoreKpisResult, ToolResult,
} from "./types";

/**
 * Turns tool results into answer blocks. Pure: no numbers are computed here —
 * every figure is taken from a tool result (which got it from src/lib/calc)
 * and only formatted. Sentences are fixed templates; nothing is improvised.
 */

export interface ComposeContext {
  currency: string;
}

export const NO_ANSWER = "I can't answer that from the available tools.";

const signedNumber = (v: number, decimals = 0) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNumber(Math.abs(v), decimals)}`;
const eventLine = (e: EventLite) => `${fmtDate(e.date)} — ${e.title}${e.storeName ? ` · ${e.storeName}` : ""}${e.description ? `. ${e.description}` : ""}`;

const KPI_ROWS: { key: KpiKey; label: string; fmt: (v: number | null, c: string) => string; pts?: boolean }[] = [
  { key: "revenue", label: "Revenue", fmt: (v, c) => fmtMoney(v, c) },
  { key: "monthlyRevenue", label: "Monthly revenue", fmt: (v, c) => fmtMoney(v, c) },
  { key: "customers", label: "Customers", fmt: (v) => fmtNumber(v) },
  { key: "customersPerDay", label: "Customers / day", fmt: (v) => fmtNumber(v) },
  { key: "averageBasket", label: "Average basket", fmt: (v, c) => fmtMoney(v, c, 2) },
  { key: "revenuePerSqm", label: "Monthly revenue / m²", fmt: (v, c) => fmtMoney(v, c) },
  { key: "revenuePerEmployee", label: "Monthly revenue / employee", fmt: (v, c) => fmtMoney(v, c) },
  { key: "grossMarginPct", label: "Gross margin", fmt: (v) => fmtPct(v), pts: true },
  { key: "operatingProfit", label: "Operating profit", fmt: (v, c) => fmtMoney(v, c) },
  { key: "costRatioPct", label: "Operating costs / revenue", fmt: (v) => fmtPct(v), pts: true },
];

function kpiCell(k: Kpis | null, key: KpiKey, fmt: (v: number | null, c: string) => string, c: string): string {
  return k ? fmt(k[key], c) : MISSING;
}

// ── Per-tool composers ───────────────────────────────────────────────────────

function basketBlocks(r: BasketChangeToolResult, c: ComposeContext): Block[] {
  const scope = r.store ? r.store.storeName : "all stores together";
  const month = r.month ? monthLabelLong(r.month) : null;
  if (!r.result || r.transactions === null || r.averageBasket === null || !month) {
    return [
      { type: "text", tone: "unavailable", text: `This cannot be calculated for ${scope}: ${month ? `transaction counts are missing for ${month}` : "no monthly data is on record"}. A basket needs both revenue and transactions.` },
      ...(r.store ? [{ type: "links" as const, links: [{ label: `Enter monthly data for ${r.store.storeName}`, href: `/stores/${r.store.storeId}/data` }] }] : []),
    ];
  }
  const x = r.result;
  const cur = c.currency;
  const m2 = (v: number) => fmtMoney(v, cur, 2);
  const m0 = (v: number) => fmtMoney(v, cur);
  const tx = fmtNumber(r.transactions);
  return [
    { type: "text", text: `Basket scenario for ${scope}, based on ${month} — the latest month on record.` },
    {
      type: "calc", title: "Current", kind: "CALCULATED",
      lines: [
        { label: "Transactions / month", result: tx, note: `recorded for ${month}` },
        { label: "Basket", expr: "revenue ÷ transactions", result: m2(r.averageBasket) },
        { label: "Current revenue", expr: `${tx} × ${m2(r.averageBasket)}`, result: m0(x.currentRevenue), note: "the basket is shown rounded; the calculation uses the exact value" },
      ],
    },
    {
      type: "calc", title: "Scenario", kind: "SCENARIO",
      lines: [
        { label: "New basket", expr: `${m2(r.averageBasket)} ${r.basketDelta < 0 ? "−" : "+"} ${m2(Math.abs(r.basketDelta))}`, result: m2(x.newBasket) },
        { label: "Scenario revenue", expr: `${tx} × ${m2(x.newBasket)}`, result: m0(x.scenarioRevenue) },
        { label: "Difference per month", expr: `${m0(x.scenarioRevenue)} − ${m0(x.currentRevenue)}`, result: fmtSignedMoney(x.monthlyDifference, cur), emphasis: true },
        { label: "Annualized scenario", expr: `${fmtSignedMoney(x.monthlyDifference, cur)} × 12`, result: fmtSignedMoney(x.annualizedDifference, cur), emphasis: true },
      ],
    },
    { type: "text", kind: "SCENARIO", text: r.assumption },
    {
      type: "unknowns",
      items: [
        "Whether the basket can be changed by this amount, and by what means.",
        "Whether a different basket would change the number of transactions.",
        "The effect on margin — it depends on which products make up the difference.",
      ],
    },
    {
      type: "links",
      links: [
        { label: "Open the scenario simulator", href: "/strategies?tab=simulator" },
        ...(r.store ? [{ label: `${r.store.storeName} scorecard`, href: `/stores/${r.store.storeId}` }] : []),
      ],
    },
  ];
}

function scenarioBlocks(r: RevenueScenarioToolResult, c: ComposeContext): Block[] {
  const scope = r.store ? r.store.storeName : "all stores together";
  const month = r.month ? monthLabelLong(r.month) : null;
  if (!r.result || r.transactionsPerDay === null || r.averageBasket === null || r.openDays === null || !month) {
    return [{ type: "text", tone: "unavailable", text: `This cannot be calculated for ${scope}: ${month ? `transactions or open days are missing for ${month}` : "no monthly data is on record"}.` }];
  }
  const x = r.result;
  const cur = c.currency;
  const m2 = (v: number) => fmtMoney(v, cur, 2);
  const m0 = (v: number) => fmtMoney(v, cur);
  const tpd = fmtNumber(r.transactionsPerDay, 1);
  const days = fmtNumber(r.openDays);
  return [
    { type: "text", text: `Revenue scenario for ${scope}, based on ${month} — the latest month on record.` },
    {
      type: "calc", title: "Current", kind: "CALCULATED",
      lines: [
        { label: r.store ? "Transactions / day" : "Transactions / store-day", expr: "transactions ÷ open days", result: tpd },
        { label: "Basket", expr: "revenue ÷ transactions", result: m2(r.averageBasket) },
        { label: r.store ? "Open days" : "Open days (all stores)", result: days, note: `recorded for ${month}` },
        { label: "Current revenue", expr: `${tpd} × ${m2(r.averageBasket)} × ${days}`, result: m0(x.currentRevenue) },
      ],
    },
    {
      type: "calc", title: "Scenario", kind: "SCENARIO",
      lines: [
        { label: "New transactions / day", expr: `${tpd} ${fmtSignedPct(r.trafficChangePct)}`, result: fmtNumber(x.newCustomersPerDay, 1) },
        { label: "New basket", expr: `${m2(r.averageBasket)} ${fmtSignedPct(r.basketChangePct)}`, result: m2(x.newBasket) },
        { label: "Scenario revenue", expr: `${fmtNumber(x.newCustomersPerDay, 1)} × ${m2(x.newBasket)} × ${days}`, result: m0(x.scenarioRevenue) },
        { label: "Difference per month", expr: `${m0(x.scenarioRevenue)} − ${m0(x.currentRevenue)}`, result: fmtSignedMoney(x.revenueDifference, cur), emphasis: true },
        { label: "of which traffic", expr: "Δ transactions × basket × days", result: fmtSignedMoney(x.trafficEffect, cur) },
        { label: "of which basket", expr: "transactions × Δ basket × days", result: fmtSignedMoney(x.basketEffect, cur) },
        { label: "of which both together", expr: "Δ transactions × Δ basket × days", result: fmtSignedMoney(x.interactionEffect, cur) },
      ],
    },
    { type: "text", kind: "SCENARIO", text: r.assumption },
    { type: "unknowns", items: ["Whether these changes are achievable, and at what cost.", "Whether a change in traffic would itself change the average basket."] },
    { type: "links", links: [{ label: "Open the revenue opportunity calculator", href: "/strategies?tab=opportunity" }] },
  ];
}

function explainBlocks(r: ExplainRevenueResult, c: ComposeContext): Block[] {
  const scope = r.store ? r.store.storeName : "all stores together";
  const cur = c.currency;
  const blocks: Block[] = [];
  if (!r.window || r.currentRevenue === null) {
    blocks.push({ type: "text", tone: "unavailable", text: `There is no revenue data for ${scope}${r.window ? ` in ${periodLabel(r.window)}` : ""}.` });
    blocks.push({ type: "unknowns", items: r.unknowns });
    return blocks;
  }
  const w = periodLabel(r.window);
  if (!r.baseline || r.previousRevenue === null) {
    blocks.push({ type: "text", kind: "FACT", text: `Revenue of ${scope} in ${w} was ${fmtMoney(r.currentRevenue, cur)}. There is no comparable earlier period on record, so a change cannot be calculated.` });
    blocks.push({ type: "unknowns", items: r.unknowns });
    return blocks;
  }
  const b = periodLabel(r.baseline);
  const basisText = r.basis === "previous_year" ? "the same months one year earlier" : "the period immediately before (no data a year earlier)";
  const diff = r.decomposition?.revenueChange ?? null;
  const direction = r.revenueChangePct === null ? "changed" : r.revenueChangePct < 0 ? "declined" : r.revenueChangePct > 0 ? "increased" : "was unchanged";
  blocks.push({
    type: "text", kind: "CALCULATED",
    text: `Revenue of ${scope} ${direction}: ${fmtMoney(r.currentRevenue, cur)} in ${w} against ${fmtMoney(r.previousRevenue, cur)} in ${b} (${basisText})${diff !== null ? ` — ${fmtSignedMoney(diff, cur)}, ${fmtSignedPct(r.revenueChangePct)}` : r.revenueChangePct !== null ? ` — ${fmtSignedPct(r.revenueChangePct)}` : ""}.`,
  });
  const d = r.decomposition;
  if (d && r.currentTransactions !== null && r.previousTransactions !== null) {
    const m2 = (v: number) => fmtMoney(v, cur, 2);
    blocks.push({
      type: "calc", title: "How the change is composed", kind: "CALCULATED",
      lines: [
        { label: "Transactions", expr: `${fmtNumber(r.previousTransactions)} → ${fmtNumber(r.currentTransactions)}`, result: signedNumber(d.transactionsChange) },
        { label: "Average basket", expr: `${m2(d.previousBasket)} → ${m2(d.currentBasket)}`, result: fmtSignedMoney(d.basketChange, cur, 2) },
        { label: "Transactions effect", expr: `${signedNumber(d.transactionsChange)} × ${m2(d.previousBasket)}`, result: fmtSignedMoney(d.transactionsEffect, cur), note: "Δ transactions × earlier basket" },
        { label: "Basket effect", expr: `${fmtNumber(r.previousTransactions)} × ${fmtSignedMoney(d.basketChange, cur, 2)}`, result: fmtSignedMoney(d.basketEffect, cur), note: "earlier transactions × Δ basket" },
        { label: "Both together", expr: `${signedNumber(d.transactionsChange)} × ${fmtSignedMoney(d.basketChange, cur, 2)}`, result: fmtSignedMoney(d.interactionEffect, cur), note: "Δ transactions × Δ basket" },
        { label: "Revenue change", expr: "sum of the three", result: fmtSignedMoney(d.revenueChange, cur), emphasis: true },
      ],
    });
    const tAbs = Math.abs(d.transactionsEffect);
    const bAbs = Math.abs(d.basketEffect);
    const facts: string[] = [];
    if (tAbs === bAbs) facts.push("The transactions effect and the basket effect are equally large.");
    else if (tAbs > bAbs) facts.push(`The larger part is the transactions effect (${fmtSignedMoney(d.transactionsEffect, cur)}): the number of transactions ${d.transactionsChange < 0 ? "fell" : "rose"} by ${fmtNumber(Math.abs(d.transactionsChange))}.`);
    else facts.push(`The larger part is the basket effect (${fmtSignedMoney(d.basketEffect, cur)}): the average basket ${d.basketChange < 0 ? "fell" : "rose"} by ${fmtMoney(Math.abs(d.basketChange), cur, 2)}.`);
    if (d.transactionsEffect !== 0 && d.basketEffect !== 0 && Math.sign(d.transactionsEffect) !== Math.sign(d.basketEffect)) {
      facts.push("The two effects point in opposite directions and partly offset each other.");
    }
    blocks.push({ type: "facts", title: "What the split shows", kind: "CALCULATED", items: facts });

    const hyp: string[] = [];
    if (d.transactionsEffect < 0) hyp.push("Fewer shopping trips — for example a new competitor nearby, changed access or parking, or shorter opening hours.");
    if (d.transactionsEffect > 0) hyp.push("More shopping trips — for example a competitor closing, new housing or offices nearby, or longer opening hours.");
    if (d.basketEffect < 0) hyp.push("Smaller baskets — for example customers trading down, items out of stock, or fewer promotions.");
    if (d.basketEffect > 0) hyp.push("Larger baskets — for example price increases, assortment changes, or fewer but bigger shopping trips.");
    if (hyp.length > 0) blocks.push({ type: "hypotheses", items: hyp });
  }
  blocks.push({
    type: "facts", title: `Events on record, ${monthLabel(r.baseline.from)} to ${monthLabel(r.window.to)}`, kind: "FACT",
    items: r.knownEvents.length > 0
      ? [...r.knownEvents.map(eventLine), "A recorded event in the same period is not shown to be the cause."]
      : [`No events are recorded for ${scope} in this window.`],
  });
  blocks.push({ type: "unknowns", items: r.unknowns });
  blocks.push({
    type: "links",
    links: [
      ...(r.store ? [{ label: `${r.store.storeName} scorecard`, href: `/stores/${r.store.storeId}` }, { label: "Stored research for this store", href: `/research?store=${r.store.storeId}` }] : []),
      { label: "Unusual changes", href: "/analytics?tab=anomalies" },
      { label: "Test a hypothesis with an experiment", href: "/experiments/new" },
    ],
  });
  return blocks;
}

function compareBlocks(r: CompareStoresResult, c: ComposeContext): Block[] {
  if (!r.window || r.stores.length === 0) return [{ type: "text", tone: "unavailable", text: "There is no monthly data on record to compare." }];
  const names = r.stores.map((s) => s.store.storeName);
  return [
    { type: "text", text: `Comparison of ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}, ${periodLabel(r.window)}.` },
    {
      type: "table", title: "KPIs", kind: "CALCULATED", columns: names,
      rows: KPI_ROWS.filter((k) => k.key !== "customers").map((k) => ({ label: k.label, values: r.stores.map((s) => kpiCell(s.kpis, k.key, k.fmt, c.currency)) })),
      note: `${MISSING} means the value cannot be calculated because an input is missing.`,
    },
    { type: "facts", title: "What the table shows", kind: "CALCULATED", items: r.facts },
    { type: "text", kind: "CORRELATION", text: "These are differences between stores, not explanations. Stores differ in size, location and customer mix; the table does not show why one is ahead." },
    { type: "links", links: [{ label: "Open the full comparison", href: `/compare?stores=${r.stores.map((s) => s.store.storeId).join(",")}` }] },
  ];
}

function decliningBlocks(r: DecliningTrafficResult): Block[] {
  if (!r.window || !r.baseline) return [{ type: "text", tone: "unavailable", text: "There is no monthly data on record." }];
  const w = periodLabel(r.window);
  const b = periodLabel(r.baseline);
  const blocks: Block[] = [];
  if (r.rows.length === 0) {
    blocks.push({ type: "text", tone: "unavailable", text: `No store has customer counts for both ${w} and ${b}, so traffic cannot be compared.` });
  } else if (r.declining.length === 0) {
    blocks.push({ type: "text", kind: "CALCULATED", text: `No store had fewer customers in ${w} than in ${b}. ${r.rows.length} store(s) were compared.` });
  } else {
    blocks.push({
      type: "text", kind: "CALCULATED",
      text: `${r.declining.length} of ${r.rows.length} compared store(s) had fewer customers in ${w} than in ${b}: ${r.declining.map((x) => `${x.store.storeName} (${fmtSignedPct(x.changePct)})`).join(", ")}.`,
    });
  }
  if (r.rows.length > 0) {
    const sorted = [...r.rows].sort((x, y) => (x.changePct ?? 0) - (y.changePct ?? 0));
    blocks.push({
      type: "table", title: `Customers, last ${r.months} months vs a year earlier`, kind: "CALCULATED",
      columns: [w, b, "Change"],
      rows: sorted.map((x) => ({ label: x.store.storeName, sub: x.store.storeCode, values: [fmtNumber(x.customers), fmtNumber(x.customersPreviousYear), fmtSignedPct(x.changePct)] })),
      note: "Change = (current − year earlier) ÷ year earlier × 100. Comparing the same months removes seasonality.",
    });
  }
  if (r.notComparable.length > 0) {
    blocks.push({ type: "unknowns", items: r.notComparable.map((n) => `${n.store.storeName}: not comparable — ${n.reason}.`) });
  }
  if (r.declining.length > 0) {
    blocks.push({ type: "unknowns", items: ["Why traffic is lower. Customer counts show that it happened, not what caused it."] });
  }
  blocks.push({
    type: "links",
    links: [
      ...(r.declining.length >= 2 ? [{ label: "Compare these stores", href: `/compare?stores=${r.declining.slice(0, 4).map((x) => x.store.storeId).join(",")}` }] : []),
      ...(r.declining.length === 1 ? [{ label: `${r.declining[0]!.store.storeName} scorecard`, href: `/stores/${r.declining[0]!.store.storeId}` }] : []),
      { label: "Unusual changes", href: "/analytics?tab=anomalies" },
    ],
  });
  return blocks;
}

function anomalyValue(metric: string, v: number, cur: string): string {
  if (metric === "averageBasket") return fmtMoney(v, cur, 2);
  if (metric === "revenue" || metric.startsWith("cost:")) return fmtMoney(v, cur);
  if (metric === "grossMarginPct") return fmtPct(v);
  return fmtNumber(v);
}

function anomalyBlocks(r: AnomaliesResult, c: ComposeContext): Block[] {
  if (!r.window) return [{ type: "text", tone: "unavailable", text: "There is no monthly data on record." }];
  const w = periodLabel(r.window);
  const scope = `${r.store ? r.store.storeName : "all stores"}${r.metric ? `, ${r.anomalies[0]?.metricLabel ?? r.metric}` : ""}`;
  const blocks: Block[] = [];
  if (r.anomalies.length === 0) {
    blocks.push({ type: "text", kind: "CALCULATED", text: `No unusual change is flagged in ${w} (${scope}). That means no month in this window met the rule below — not that nothing changed.` });
    if (r.flaggedLast12Months > 0) {
      blocks.push({ type: "text", kind: "CALCULATED", text: `In the 12 months up to ${monthLabel(r.window.to)}, ${r.flaggedLast12Months} month(s) are flagged by the same rule.` });
      blocks.push({ type: "suggestions", title: "Widen the window", items: [`Find unusual changes${r.store ? ` at ${r.store.storeName}` : ""} in the last 12 months.`] });
    }
  } else {
    blocks.push({ type: "text", kind: "CALCULATED", text: `${r.anomalies.length} unusual change(s) flagged in ${w} (${scope}). "Unusual" means unusual for that store's own history.` });
    blocks.push({
      type: "table", title: "Flagged months", kind: "CALCULATED",
      columns: ["Value", "Change", "z"],
      rows: r.anomalies.slice(0, 12).map((a) => ({
        label: `${a.store.storeName} · ${a.metricLabel}`,
        sub: `${monthLabel(a.month)} · ${a.basis === "yoy" ? "vs same month last year" : "vs previous month"}`,
        values: [anomalyValue(a.metric, a.value, c.currency), fmtSignedPct(a.changePct), signedNumber(a.zScore, 1)],
      })),
      note: r.anomalies.length > 12 ? `Showing 12 of ${r.anomalies.length}. The Analytics page lists all.` : undefined,
    });
    const seen = new Set<string>();
    const events: string[] = [];
    for (const a of r.anomalies) {
      for (const e of a.knownEvents) {
        const line = eventLine(e);
        if (!seen.has(line)) {
          seen.add(line);
          events.push(line);
        }
      }
    }
    blocks.push({
      type: "facts", title: "Recorded events near the flagged months", kind: "FACT",
      items: events.length > 0 ? [...events, "A recorded event near a flagged month is not shown to be its cause."] : ["No events are recorded in or just before the flagged months."],
    });
    blocks.push({ type: "unknowns", items: ["The cause of each flagged change."] });
  }
  blocks.push({ type: "text", text: `Rule: ${r.method}${r.historyWindow ? ` History used: ${periodLabel(r.historyWindow)}.` : ""}` });
  blocks.push({ type: "links", links: [{ label: "Open unusual changes", href: "/analytics?tab=anomalies" }] });
  return blocks;
}

function experimentBlocks(r: ExperimentsResult): Block[] {
  const status = r.status ? r.status.toLowerCase() : null;
  const links = { type: "links" as const, links: [{ label: "All experiments", href: "/experiments" }, { label: "Create experiment", href: "/experiments/new" }] };
  if (r.experiments.length === 0) {
    return [
      { type: "text", kind: "FACT", text: status ? `No experiment is ${status} right now. ${r.totalAllStatuses} experiment(s) exist in total.` : "No experiments are on record." },
      links,
    ];
  }
  return [
    { type: "text", kind: "FACT", text: `${r.experiments.length} experiment(s)${status ? ` with status ${status}` : ""}${r.status ? ` — ${r.totalAllStatuses} in total` : ""}.` },
    {
      type: "table", title: status ? `${humanize(r.status!)} experiments` : "Experiments", kind: "FACT",
      columns: ["Status", "Test store", "Control", "Start", "End"],
      rows: r.experiments.map((e) => ({
        label: e.title, sub: e.hypothesis,
        values: [humanize(e.status), e.testStore.storeName, e.controlStore?.storeName ?? "None", e.startDate ? fmtDate(e.startDate) : "Not set", e.endDate ? fmtDate(e.endDate) : "Not set"],
      })),
    },
    { type: "links", links: [...r.experiments.slice(0, 4).map((e) => ({ label: e.title, href: `/experiments/${e.id}` })), ...links.links] },
  ];
}

function researchBlocks(r: ResearchToolResult): Block[] {
  const name = r.store.storeName;
  const href = `/research?store=${r.store.storeId}`;
  // `research` may have been withheld by the privacy filter when this runs on filtered output.
  const res = typeof r.research === "object" && r.research !== null ? r.research : null;
  if (!r.stored || !res) {
    return [
      { type: "text", tone: "unavailable", text: `No research is stored for ${name}. The analyst only reads stored research — it does not run external research on its own.` },
      { type: "links", links: [{ label: `Run research for ${name} on the Research page`, href }] },
    ];
  }
  const blocks: Block[] = [
    {
      type: "text", kind: "FACT",
      text: `Stored research for ${name}${res.lastResearchAt ? `, last run ${fmtDate(res.lastResearchAt)}` : ""}${res.provider ? ` with the "${res.provider}" provider` : ""}${res.radiusM ? `, radius ${fmtDistance(res.radiusM)}` : ""}. Nothing was fetched just now — to refresh it, use the Research page.`,
    },
  ];
  if (res.sources.some((s) => s.isDemo)) blocks.push({ type: "text", kind: "DEMO", text: "These places and sources are fictional demo data." });
  if (res.competitors.length > 0) {
    blocks.push({
      type: "sources", title: `Competitors on record (${res.competitors.length})`, sources: res.sources,
      items: res.competitors.slice(0, 10).map((x) => ({ text: `${x.name} — ${fmtDistance(x.distanceM)}`, label: x.category, sourceId: x.sourceId })),
    });
  } else {
    blocks.push({ type: "text", tone: "unavailable", text: "No competitors are stored for this store." });
  }
  const facts = res.findings.filter((f) => f.kind === "FACT");
  const ideas = res.findings.filter((f) => f.kind === "OPPORTUNITY" || f.kind === "RISK");
  const unknown = res.findings.filter((f) => f.kind === "UNKNOWN");
  if (facts.length > 0) blocks.push({ type: "sources", title: "Findings with a source", sources: res.sources, items: facts.map((f) => ({ text: f.text, sourceId: f.sourceId })) });
  if (ideas.length > 0) blocks.push({ type: "sources", title: "Possible opportunities and risks — not validated", sources: res.sources, items: ideas.map((f) => ({ text: f.text, label: humanize(f.kind), sourceId: f.sourceId })) });
  if (res.signals.length > 0) {
    blocks.push({
      type: "sources", title: `Location signals on record (${res.signals.length})`, sources: res.sources,
      items: res.signals.slice(0, 8).map((s) => ({ text: `${s.name}${s.distanceM !== null ? ` — ${fmtDistance(s.distanceM)}` : ""}`, label: humanize(s.type), sourceId: s.sourceId })),
    });
  }
  blocks.push({
    type: "unknowns",
    items: unknown.length > 0 ? unknown.map((f) => f.text) : ["Competitor revenue and footfall — not publicly available.", "Whether any of these places affects this store's sales."],
  });
  blocks.push({ type: "links", links: [{ label: `Research page for ${name}`, href }, { label: "Open map", href: "/map" }] });
  return blocks;
}

function storeKpiBlocks(r: StoreKpisResult, c: ComposeContext): Block[] {
  if (!r.window || !r.kpis) {
    return [
      { type: "text", tone: "unavailable", text: `There is no monthly data for ${r.store.storeName}${r.window ? ` in ${periodLabel(r.window)}` : ""}.` },
      { type: "links", links: [{ label: `Enter monthly data for ${r.store.storeName}`, href: `/stores/${r.store.storeId}/data` }] },
    ];
  }
  const w = periodLabel(r.window);
  const hasPrev = !!r.previousYear && !!r.baseline;
  return [
    { type: "text", text: `KPIs of ${r.store.storeName} (${r.store.storeCode}) for ${w}${hasPrev ? `, against ${periodLabel(r.baseline!)}` : ""}.` },
    {
      type: "table", title: "KPIs", kind: "CALCULATED",
      columns: hasPrev ? [w, periodLabel(r.baseline!), "Change"] : [w],
      rows: KPI_ROWS.map((k) => ({
        label: k.label,
        values: hasPrev
          ? [
              kpiCell(r.kpis, k.key, k.fmt, c.currency),
              kpiCell(r.previousYear, k.key, k.fmt, c.currency),
              r.changeVsPreviousYear ? (k.pts ? fmtSignedPts(r.changeVsPreviousYear[k.key]) : fmtSignedPct(r.changeVsPreviousYear[k.key])) : MISSING,
            ]
          : [kpiCell(r.kpis, k.key, k.fmt, c.currency)],
      })),
      note: hasPrev
        ? r.changeVsPreviousYear ? "Change vs the same months one year earlier; margin and cost ratio in percentage points." : "The earlier period covers a different number of months, so no change is shown."
        : "No data for the same months a year earlier.",
    },
    { type: "links", links: [{ label: `${r.store.storeName} scorecard`, href: `/stores/${r.store.storeId}` }] },
  ];
}

function listStoreBlocks(r: ListStoresResult): Block[] {
  if (r.stores.length === 0) return [{ type: "text", tone: "unavailable", text: "This organization has no stores yet." }, { type: "links", links: [{ label: "Add store", href: "/stores/new" }] }];
  return [
    { type: "text", kind: "FACT", text: `${r.stores.length} store(s), in alphabetical order by name. "Store 3" in a question means position 3 in this list.` },
    {
      type: "table", title: "Stores", kind: "FACT", columns: ["#", "Code", "City", "Type", "m²"],
      rows: r.stores.map((s) => ({ label: s.storeName, values: [String(s.position), s.storeCode, s.city, s.type, fmtNumber(s.areaSqm)] })),
    },
    { type: "links", links: [{ label: "All stores", href: "/stores" }] },
  ];
}

export function blocksForResult(r: ToolResult, c: ComposeContext): Block[] {
  switch (r.tool) {
    case "calculate_basket_change": return basketBlocks(r, c);
    case "calculate_revenue_scenario": return scenarioBlocks(r, c);
    case "explain_revenue_change": return explainBlocks(r, c);
    case "compare_stores": return compareBlocks(r, c);
    case "find_declining_traffic": return decliningBlocks(r);
    case "find_anomalies": return anomalyBlocks(r, c);
    case "list_experiments": return experimentBlocks(r);
    case "get_research": return researchBlocks(r);
    case "get_store_kpis": return storeKpiBlocks(r, c);
    case "list_stores": return listStoreBlocks(r);
  }
}

export function noAnswerBlocks(examples: readonly string[] = EXAMPLE_QUESTIONS): Block[] {
  return [
    { type: "text", tone: "unavailable", text: `${NO_ANSWER} No language model is connected, so I can only run the deterministic tools below.` },
    { type: "facts", title: "What I can do", kind: "FACT", items: [...CAPABILITIES] },
    { type: "suggestions", title: "Try one of these", items: [...examples] },
  ];
}

export interface ToolFailure {
  tool: string;
  error: string;
}

/** Full answer for a rule-based plan. `results` are in the order of `plan.calls`; a failure replaces its result. */
export function composeAnswer(plan: Plan, results: readonly (ToolResult | ToolFailure)[], c: ComposeContext, examples?: readonly string[]): Block[] {
  if (plan.intent === "none") return noAnswerBlocks(examples);
  if (plan.intent === "clarify") {
    return [
      { type: "text", tone: "unavailable", text: plan.clarification ?? "Please be more specific." },
      { type: "suggestions", title: "For example", items: [...(examples ?? EXAMPLE_QUESTIONS)].slice(0, 4) },
    ];
  }
  const blocks: Block[] = plan.interpretations.map((text) => ({ type: "text", tone: "interpretation", text }));
  const first = results[0];
  if (plan.presumes && first && !("error" in first) && first.tool === "explain_revenue_change" && first.revenueChangePct !== null) {
    const actual = first.revenueChangePct < 0 ? "decline" : first.revenueChangePct > 0 ? "increase" : null;
    if (actual && actual !== plan.presumes) {
      blocks.push({ type: "text", tone: "interpretation", text: `The question assumes a${plan.presumes === "increase" ? "n increase" : " decline"}, but in this window the data shows a${actual === "increase" ? "n increase" : " decline"}. A different period may show something else — add one to the question, for example "last month" or "last 12 months".` });
    }
  }
  for (const r of results) {
    if ("error" in r) blocks.push({ type: "text", tone: "unavailable", text: `The tool ${r.tool} could not run: ${r.error}` });
    else blocks.push(...blocksForResult(r, c));
  }
  return blocks;
}
