import "server-only";
import { z } from "zod";
import { computeKpis, compareKpis } from "@/lib/analytics/aggregate";
import { ANOMALY_METRIC_LABELS, findAnomalies } from "@/lib/analytics/anomalies";
import type { Kpis, StoreDTO } from "@/lib/analytics/types";
import { STORE_TYPE_LABELS } from "@/lib/analytics/types";
import { resolveToolPeriod, shiftWindow } from "@/lib/ai/period";
import { resolveStoreRef, sortStoresByName } from "@/lib/ai/stores";
import type {
  AnomaliesResult, BasketChangeToolResult, CompareStoresResult, DecliningTrafficResult, EventLite, ExperimentsResult,
  ExplainRevenueResult, ListStoresResult, ResearchToolResult, RevenueScenarioToolResult, StoreKpisResult, StoreRef,
  ToolName, ToolResult, TrafficRow, Window,
} from "@/lib/ai/types";
import { calculateBasketChange, calculateGrowthRate, calculateRevenueOpportunity } from "@/lib/calc";
import { decomposeRevenueChange } from "@/lib/calc/revenueChange";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { addMonths, monthRange, periodLabel } from "@/lib/period";
import type { AIToolSpec } from "@/lib/providers/types";
import { db } from "../db";
import { getKnownEvents, getLatestMonth, getMonthFacts, getStores, toSourceDTO, type KnownEventDTO } from "../queries";
import type { OrgContext } from "../session";

/**
 * Analyst tools. Every number the analyst shows comes out of one of these.
 *
 * Rules:
 *  - Read only through src/server/queries.ts or `db` filtered by ctx.orgId.
 *    The organization id always comes from the session, never from the input.
 *  - Compute only through src/lib/calc and src/lib/analytics.
 *  - Return structured data. Wording is added later by a pure composer;
 *    a tool never states a cause.
 */

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export interface ToolOutput {
  result: ToolResult;
  /** What the tool read, in words — shown under "Tools used". */
  dataWindow: string;
}

export interface AnalystTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: ToolName;
  description: string;
  schema: S;
  /** JSON Schema of the input, for an AIProvider. */
  jsonSchema: Record<string, unknown>;
  execute(ctx: OrgContext, input: z.infer<S>): Promise<ToolOutput>;
}

const periodSchema = z.string().regex(/^(\d{1,2}m|ytd)$/, 'Use "<n>m" (1–24 months) or "ytd"').default("12m");
const storeRefSchema = z.string().trim().min(1).max(80);
const J = {
  store: { type: "string", description: "Store id, code, name, city, or ordinal such as 'Store 4' (4th store alphabetically)." },
  period: { type: "string", pattern: "^(\\d{1,2}m|ytd)$", description: "Latest n months with data ('3m') or 'ytd'." },
};

const ref = (s: { id: string; name: string; code: string }): StoreRef => ({ storeId: s.id, storeName: s.name, storeCode: s.code });
const win = (w: Window | null) => (w ? periodLabel(w) : "no data");

/** Store resolver for tool inputs: accepts an id or any reference the pure resolver understands. */
function resolveOne(stores: StoreDTO[], reference: string): StoreDTO {
  const r = resolveStoreRef(reference, stores);
  if (!r.ok) throw new ToolInputError(r.error);
  return stores.find((s) => s.id === r.store.id)!;
}

function eventLite(e: KnownEventDTO, stores: StoreDTO[]): EventLite {
  const s = e.storeId ? stores.find((x) => x.id === e.storeId) : null;
  return { storeCode: s?.code ?? null, storeName: s?.name ?? null, date: e.date, title: e.title, description: e.description };
}

// ── list_stores ──────────────────────────────────────────────────────────────

const listStores: AnalystTool<z.ZodObject<Record<string, never>>> = {
  name: "list_stores",
  description: "Lists the organization's stores in alphabetical order by name.",
  schema: z.object({}),
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  async execute(ctx) {
    const stores = sortStoresByName(await getStores(ctx.orgId));
    const result: ListStoresResult = {
      tool: "list_stores",
      stores: stores.map((s, i) => ({ ...ref(s), city: s.city, type: STORE_TYPE_LABELS[s.type], areaSqm: s.areaSqm, employees: s.employees, position: i + 1 })),
    };
    return { result, dataWindow: `Store master data, ${stores.length} store(s)` };
  },
};

// ── get_store_kpis ───────────────────────────────────────────────────────────

const storeKpisSchema = z.object({ store: storeRefSchema, period: periodSchema });
const getStoreKpis: AnalystTool<typeof storeKpisSchema> = {
  name: "get_store_kpis",
  description: "KPIs of one store for a period, with the change against the same months one year earlier.",
  schema: storeKpisSchema,
  jsonSchema: { type: "object", properties: { store: J.store, period: J.period }, required: ["store"], additionalProperties: false },
  async execute(ctx, input) {
    const stores = await getStores(ctx.orgId);
    const store = resolveOne(stores, input.store);
    const latest = await getLatestMonth(ctx.orgId);
    if (!latest) {
      const result: StoreKpisResult = { tool: "get_store_kpis", store: ref(store), window: null, baseline: null, kpis: null, previousYear: null, changeVsPreviousYear: null };
      return { result, dataWindow: "No monthly data on record" };
    }
    const w = resolveToolPeriod(latest, input.period);
    const baseline = shiftWindow(w, -12);
    const facts = await getMonthFacts(ctx.orgId, { from: baseline.from, to: w.to, storeIds: [store.id] });
    const cur = facts.filter((f) => f.month >= w.from && f.month <= w.to);
    const prev = facts.filter((f) => f.month >= baseline.from && f.month <= baseline.to);
    const kpis = cur.length > 0 ? computeKpis(cur, [store]) : null;
    const previousYear = prev.length > 0 ? computeKpis(prev, [store]) : null;
    const comparable = kpis && previousYear && kpis.months === previousYear.months;
    const result: StoreKpisResult = {
      tool: "get_store_kpis", store: ref(store), window: { from: w.from, to: w.to }, baseline: previousYear ? baseline : null,
      kpis, previousYear, changeVsPreviousYear: comparable ? compareKpis(kpis, previousYear) : null,
    };
    return { result, dataWindow: `Monthly facts and costs of ${store.name}, ${win(w)} and ${win(baseline)} (${facts.length} store-months)` };
  },
};

// ── compare_stores ───────────────────────────────────────────────────────────

const compareSchema = z.object({ stores: z.array(storeRefSchema).min(2).max(4), period: periodSchema });

type Fmt = (v: number | null, currency: string) => string;
const COMPARE_METRICS: { key: keyof Kpis; label: string; fmt: Fmt; higherLabel: string; lowerLabel: string }[] = [
  { key: "monthlyRevenue", label: "Monthly revenue", fmt: (v, c) => fmtMoney(v, c), higherLabel: "Highest", lowerLabel: "lowest" },
  { key: "customersPerDay", label: "Customers per day", fmt: (v) => fmtNumber(v), higherLabel: "Highest", lowerLabel: "lowest" },
  { key: "averageBasket", label: "Average basket", fmt: (v, c) => fmtMoney(v, c, 2), higherLabel: "Highest", lowerLabel: "lowest" },
  { key: "revenuePerSqm", label: "Monthly revenue per m²", fmt: (v, c) => fmtMoney(v, c), higherLabel: "Highest", lowerLabel: "lowest" },
  { key: "grossMarginPct", label: "Gross margin", fmt: (v) => fmtPct(v), higherLabel: "Highest", lowerLabel: "lowest" },
  { key: "costRatioPct", label: "Operating costs as share of revenue", fmt: (v) => fmtPct(v), higherLabel: "Highest", lowerLabel: "lowest" },
];

const compareStores: AnalystTool<typeof compareSchema> = {
  name: "compare_stores",
  description: "KPI table for 2–4 stores over the same period, plus statements of which store is highest and lowest per metric.",
  schema: compareSchema,
  jsonSchema: { type: "object", properties: { stores: { type: "array", items: J.store, minItems: 2, maxItems: 4 }, period: J.period }, required: ["stores"], additionalProperties: false },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const picked: StoreDTO[] = [];
    for (const r of input.stores) {
      const s = resolveOne(all, r);
      if (!picked.some((p) => p.id === s.id)) picked.push(s);
    }
    if (picked.length < 2) throw new ToolInputError("A comparison needs at least two different stores.");
    const latest = await getLatestMonth(ctx.orgId);
    if (!latest) return { result: { tool: "compare_stores", window: null, stores: [], facts: [] }, dataWindow: "No monthly data on record" };
    const w = resolveToolPeriod(latest, input.period);
    const facts = await getMonthFacts(ctx.orgId, { from: w.from, to: w.to, storeIds: picked.map((s) => s.id) });
    const rows = picked.map((s) => ({ store: ref(s), kpis: computeKpis(facts.filter((f) => f.storeId === s.id), [s]) }));
    const cur = ctx.org.currency;
    const lines: string[] = [];
    for (const m of COMPARE_METRICS) {
      const withValue = rows.filter((r) => typeof r.kpis[m.key] === "number");
      const missing = rows.filter((r) => typeof r.kpis[m.key] !== "number");
      if (withValue.length < 2) {
        lines.push(`${m.label}: cannot be compared — ${missing.map((r) => r.store.storeName).join(", ")} ${missing.length === 1 ? "has" : "have"} no data for it.`);
        continue;
      }
      const sorted = [...withValue].sort((a, b) => (b.kpis[m.key] as number) - (a.kpis[m.key] as number));
      const hi = sorted[0]!;
      const lo = sorted[sorted.length - 1]!;
      const hiV = hi.kpis[m.key] as number;
      const loV = lo.kpis[m.key] as number;
      const isPct = m.key === "grossMarginPct" || m.key === "costRatioPct";
      const gap = isPct ? `a gap of ${fmtNumber(hiV - loV, 1)} pts` : `${fmtPct(calculateGrowthRate(hiV, loV))} above the lowest`;
      lines.push(
        `${m.label}: ${m.higherLabel.toLowerCase()} at ${hi.store.storeName} (${m.fmt(hiV, cur)}), ${m.lowerLabel} at ${lo.store.storeName} (${m.fmt(loV, cur)}) — ${gap}.` +
          (missing.length > 0 ? ` No data for ${missing.map((r) => r.store.storeName).join(", ")}.` : ""),
      );
    }
    const result: CompareStoresResult = { tool: "compare_stores", window: { from: w.from, to: w.to }, stores: rows, facts: lines };
    return { result, dataWindow: `Monthly facts and costs of ${picked.map((s) => s.name).join(", ")}, ${win(w)} (${facts.length} store-months)` };
  },
};

// ── find_declining_traffic ───────────────────────────────────────────────────

const decliningSchema = z.object({ months: z.union([z.literal(3), z.literal(6)]).default(3) });
const findDecliningTraffic: AnalystTool<typeof decliningSchema> = {
  name: "find_declining_traffic",
  description: "Stores whose customer count over the last 3 or 6 months is below the same months one year earlier, with both numbers.",
  schema: decliningSchema,
  jsonSchema: { type: "object", properties: { months: { type: "integer", enum: [3, 6] } }, additionalProperties: false },
  async execute(ctx, input) {
    const stores = sortStoresByName(await getStores(ctx.orgId));
    const latest = await getLatestMonth(ctx.orgId);
    if (!latest) {
      return { result: { tool: "find_declining_traffic", months: input.months, window: null, baseline: null, rows: [], declining: [], notComparable: [] }, dataWindow: "No monthly data on record" };
    }
    const w = resolveToolPeriod(latest, `${input.months}m`);
    const baseline = shiftWindow(w, -12);
    const facts = await getMonthFacts(ctx.orgId, { from: baseline.from, to: w.to });
    const rows: TrafficRow[] = [];
    const notComparable: DecliningTrafficResult["notComparable"] = [];
    for (const s of stores) {
      const cur = facts.filter((f) => f.storeId === s.id && f.month >= w.from && f.month <= w.to && f.customers !== null);
      const prev = facts.filter((f) => f.storeId === s.id && f.month >= baseline.from && f.month <= baseline.to && f.customers !== null);
      if (cur.length < input.months) {
        notComparable.push({ store: ref(s), reason: `customer counts exist for ${cur.length} of ${input.months} months in ${win(w)}` });
        continue;
      }
      if (prev.length < input.months) {
        notComparable.push({ store: ref(s), reason: `customer counts exist for ${prev.length} of ${input.months} months in ${win(baseline)}` });
        continue;
      }
      const customers = computeKpis(cur, [s]).customers;
      const customersPreviousYear = computeKpis(prev, [s]).customers;
      rows.push({ store: ref(s), customers, customersPreviousYear, changePct: calculateGrowthRate(customers, customersPreviousYear) });
    }
    const declining = rows.filter((r) => r.changePct !== null && r.changePct < 0).sort((a, b) => a.changePct! - b.changePct!);
    const result: DecliningTrafficResult = { tool: "find_declining_traffic", months: input.months, window: { from: w.from, to: w.to }, baseline, rows, declining, notComparable };
    return { result, dataWindow: `Customer counts of ${stores.length} store(s), ${win(w)} and ${win(baseline)}` };
  },
};

// ── find_anomalies ───────────────────────────────────────────────────────────

const anomaliesSchema = z.object({
  period: periodSchema.default("3m"),
  store: storeRefSchema.optional(),
  metric: z.string().max(40).optional(),
});
const MONETARY_METRIC = (m: string) => m === "revenue" || m === "averageBasket" || m.startsWith("cost:");

const findAnomaliesTool: AnalystTool<typeof anomaliesSchema> = {
  name: "find_anomalies",
  description: "Months in which a metric changed unusually for that store's own history (robust z-score rule), with events the organization recorded around that time. Observations only.",
  schema: anomaliesSchema,
  jsonSchema: {
    type: "object",
    properties: { period: J.period, store: J.store, metric: { type: "string", enum: Object.keys(ANOMALY_METRIC_LABELS) } },
    additionalProperties: false,
  },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const store = input.store ? resolveOne(all, input.store) : null;
    if (input.metric && !(input.metric in ANOMALY_METRIC_LABELS)) throw new ToolInputError(`Unknown metric "${input.metric}".`);
    const latest = await getLatestMonth(ctx.orgId);
    const method = "A month is flagged when its change (vs the same month a year earlier when at least 16 months exist, otherwise vs the previous month) deviates from that store's typical change by a robust z-score of 2.5 or more and by at least 5 percentage points (3 for gross margin).";
    if (!latest) {
      return { result: { tool: "find_anomalies", window: null, historyWindow: null, store: store ? ref(store) : null, metric: input.metric ?? null, anomalies: [], flaggedLast12Months: 0, method }, dataWindow: "No monthly data on record" };
    }
    const w = resolveToolPeriod(latest, input.period);
    const history: Window = { from: addMonths(latest, -35), to: latest };
    const scope = store ? [store] : all;
    const [facts, events] = await Promise.all([
      getMonthFacts(ctx.orgId, { from: history.from, to: history.to, storeIds: scope.map((s) => s.id) }),
      getKnownEvents(ctx.orgId, store?.id),
    ]);
    const allFound = findAnomalies(facts, scope, events).filter((a) => !input.metric || a.metric === input.metric);
    const found = allFound.filter((a) => a.month >= w.from && a.month <= w.to);
    const yearStart = addMonths(latest, -11);
    const firstMonth = facts.reduce<string | null>((m, f) => (m === null || f.month < m ? f.month : m), null);
    const result: AnomaliesResult = {
      tool: "find_anomalies",
      window: { from: w.from, to: w.to },
      historyWindow: firstMonth ? { from: firstMonth, to: latest } : null,
      store: store ? ref(store) : null,
      metric: input.metric ?? null,
      method,
      flaggedLast12Months: allFound.filter((a) => a.month >= yearStart).length,
      anomalies: found.map((a) => {
        const s = scope.find((x) => x.id === a.storeId)!;
        return {
          store: ref(s), metric: a.metric, metricLabel: a.metricLabel, month: a.month, value: a.value, changePct: a.changePct,
          basis: a.basis, zScore: a.zScore, direction: a.direction, monetary: MONETARY_METRIC(a.metric),
          knownEvents: a.knownEvents.map((e) => ({
            storeCode: e.storeId ? s.code : null, storeName: e.storeId ? s.name : null, date: e.date, title: e.title, description: e.description,
          })),
        };
      }),
    };
    return {
      result,
      dataWindow: `Monthly facts of ${store ? store.name : `${scope.length} store(s)`}, history ${firstMonth ? win({ from: firstMonth, to: latest }) : "none"}; flagged months reported for ${win(w)}; ${events.length} recorded event(s)`,
    };
  },
};

// ── explain_revenue_change ───────────────────────────────────────────────────

const explainSchema = z.object({ store: storeRefSchema.optional(), period: periodSchema.default("3m") });
const explainRevenueChange: AnalystTool<typeof explainSchema> = {
  name: "explain_revenue_change",
  description: "Splits the revenue change of a store (or all stores) between a period and the same months a year earlier into a transactions effect and a basket effect, lists recorded events and what is unknown. Never states a cause.",
  schema: explainSchema,
  jsonSchema: { type: "object", properties: { store: J.store, period: J.period }, additionalProperties: false },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const store = input.store ? resolveOne(all, input.store) : null;
    const scope = store ? [store] : all;
    const latest = await getLatestMonth(ctx.orgId);
    const empty: ExplainRevenueResult = {
      tool: "explain_revenue_change", store: store ? ref(store) : null, window: null, baseline: null, basis: null,
      currentRevenue: null, previousRevenue: null, currentTransactions: null, previousTransactions: null,
      revenueChangePct: null, decomposition: null, knownEvents: [], unknowns: ["No monthly revenue data is on record."],
    };
    if (!latest) return { result: empty, dataWindow: "No monthly data on record" };
    const w = resolveToolPeriod(latest, input.period);
    const yoy = shiftWindow(w, -12);
    const prevPeriod = shiftWindow(w, -w.months);
    const readFrom = yoy.from < prevPeriod.from ? yoy.from : prevPeriod.from;
    const [facts, events] = await Promise.all([
      getMonthFacts(ctx.orgId, { from: readFrom, to: w.to, storeIds: scope.map((s) => s.id) }),
      getKnownEvents(ctx.orgId, store?.id),
    ]);
    const inWin = (x: Window) => facts.filter((f) => f.month >= x.from && f.month <= x.to);
    const expected = monthRange(w.from, w.to).length * scope.length;
    const cur = inWin(w);
    // Compare like with like: the baseline must cover the same store-months as the current window.
    const yoyFacts = inWin(yoy);
    const ppFacts = inWin(prevPeriod);
    const basis: ExplainRevenueResult["basis"] = yoyFacts.length === cur.length && cur.length > 0 ? "previous_year" : ppFacts.length === cur.length && cur.length > 0 ? "previous_period" : null;
    const baseline = basis === "previous_year" ? yoy : basis === "previous_period" ? prevPeriod : null;
    const prev = basis === "previous_year" ? yoyFacts : basis === "previous_period" ? ppFacts : [];
    const kCur = computeKpis(cur, scope);
    const kPrev = computeKpis(prev, scope);
    const decomposition = basis ? decomposeRevenueChange(kPrev.revenue, kPrev.transactions, kCur.revenue, kCur.transactions) : null;

    const unknowns: string[] = [];
    if (cur.length === 0) unknowns.push(`No revenue rows exist for ${win(w)}.`);
    else if (cur.length < expected) unknowns.push(`Revenue rows exist for ${cur.length} of ${expected} store-months in ${win(w)} — the totals cover only those.`);
    if (cur.length > 0 && !basis) unknowns.push(`No comparable earlier period: neither ${win(yoy)} nor ${win(prevPeriod)} has data for the same store-months.`);
    if (basis && !decomposition) unknowns.push("Transaction counts are missing for at least one month, so the change cannot be split into a transactions effect and a basket effect.");
    unknowns.push(
      "The cause of the change. The split above is arithmetic; it shows how the change is composed, not why it happened.",
      "Price changes, promotions and assortment changes — not recorded in RetailLab.",
      "Whether customers moved to a competitor — competitor revenue and footfall are not publicly available.",
      "Weather, roadworks and local events — unknown unless entered as a known event.",
    );
    const evFrom = `${baseline?.from ?? w.from}-01`;
    const evTo = `${addMonths(w.to, 1)}-01`;
    const result: ExplainRevenueResult = {
      ...empty,
      window: { from: w.from, to: w.to },
      baseline,
      basis,
      currentRevenue: cur.length > 0 ? kCur.revenue : null,
      previousRevenue: basis ? kPrev.revenue : null,
      currentTransactions: cur.length > 0 ? kCur.transactions : null,
      previousTransactions: basis ? kPrev.transactions : null,
      revenueChangePct: basis ? calculateGrowthRate(kCur.revenue, kPrev.revenue) : null,
      decomposition,
      knownEvents: events.filter((e) => e.date >= evFrom && e.date < evTo).map((e) => eventLite(e, all)),
      unknowns,
    };
    return {
      result,
      dataWindow: `Monthly revenue and transactions of ${store ? store.name : `${scope.length} store(s)`}, ${win(w)}${baseline ? ` and ${win(baseline)}` : ""}; recorded events ${evFrom.slice(0, 7)} to ${w.to}`,
    };
  },
};

// ── calculate_basket_change ──────────────────────────────────────────────────

export const BASKET_ASSUMPTION = "This calculation assumes transaction volume remains unchanged.";

const basketSchema = z.object({ store: storeRefSchema.optional(), basketDelta: z.number().finite().min(-10_000).max(10_000) });
const calculateBasketChangeTool: AnalystTool<typeof basketSchema> = {
  name: "calculate_basket_change",
  description: "Scenario: revenue if the average basket changed by an absolute amount while transactions stay as in the latest month. For one store or all stores.",
  schema: basketSchema,
  jsonSchema: { type: "object", properties: { store: J.store, basketDelta: { type: "number", description: "Change of the average basket in currency units, e.g. 0.5" } }, required: ["basketDelta"], additionalProperties: false },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const store = input.store ? resolveOne(all, input.store) : null;
    const scope = store ? [store] : all;
    const latest = await getLatestMonth(ctx.orgId);
    const base: BasketChangeToolResult = { tool: "calculate_basket_change", store: store ? ref(store) : null, month: latest, transactions: null, averageBasket: null, basketDelta: input.basketDelta, result: null, assumption: BASKET_ASSUMPTION };
    if (!latest) return { result: base, dataWindow: "No monthly data on record" };
    const facts = await getMonthFacts(ctx.orgId, { from: latest, to: latest, storeIds: scope.map((s) => s.id) });
    const k = computeKpis(facts, scope);
    const result: BasketChangeToolResult = { ...base, transactions: k.transactions, averageBasket: k.averageBasket, result: calculateBasketChange(k.transactions, k.averageBasket, input.basketDelta) };
    return { result, dataWindow: `Revenue and transactions of ${store ? store.name : `${scope.length} store(s)`}, ${win({ from: latest, to: latest })} (${facts.length} store-months)` };
  },
};

// ── calculate_revenue_scenario ───────────────────────────────────────────────

const scenarioSchema = z.object({
  store: storeRefSchema.optional(),
  trafficChangePct: z.number().finite().min(-100).max(1000).default(0),
  basketChangePct: z.number().finite().min(-100).max(1000).default(0),
});
const calculateRevenueScenario: AnalystTool<typeof scenarioSchema> = {
  name: "calculate_revenue_scenario",
  description: "Scenario: revenue if transactions per day and/or the average basket changed by a percentage, based on the latest month. Decomposed into traffic, basket and interaction effects.",
  schema: scenarioSchema,
  jsonSchema: { type: "object", properties: { store: J.store, trafficChangePct: { type: "number" }, basketChangePct: { type: "number" } }, additionalProperties: false },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const store = input.store ? resolveOne(all, input.store) : null;
    const scope = store ? [store] : all;
    const latest = await getLatestMonth(ctx.orgId);
    const base: RevenueScenarioToolResult = {
      tool: "calculate_revenue_scenario", store: store ? ref(store) : null, month: latest, transactionsPerDay: null, averageBasket: null, openDays: null,
      trafficChangePct: input.trafficChangePct, basketChangePct: input.basketChangePct, result: null,
      assumption: "This calculation assumes the stated percentage changes happen and nothing else changes (same open days, no effect of one on the other).",
    };
    if (!latest) return { result: base, dataWindow: "No monthly data on record" };
    const facts = await getMonthFacts(ctx.orgId, { from: latest, to: latest, storeIds: scope.map((s) => s.id) });
    const k = computeKpis(facts, scope);
    const result: RevenueScenarioToolResult = {
      ...base,
      transactionsPerDay: k.transactionsPerDay,
      averageBasket: k.averageBasket,
      openDays: k.openDays,
      result: k.transactionsPerDay !== null && k.averageBasket !== null && k.openDays !== null
        ? calculateRevenueOpportunity({ customersPerDay: k.transactionsPerDay, averageBasket: k.averageBasket, days: k.openDays, trafficChangePct: input.trafficChangePct, basketChangePct: input.basketChangePct })
        : null,
    };
    return { result, dataWindow: `Revenue, transactions and open days of ${store ? store.name : `${scope.length} store(s)`}, ${win({ from: latest, to: latest })} (${facts.length} store-months)` };
  },
};

// ── list_experiments ─────────────────────────────────────────────────────────

const experimentsSchema = z.object({ status: z.enum(["PLANNED", "RUNNING", "COMPLETED", "STOPPED"]).optional() });
const listExperiments: AnalystTool<typeof experimentsSchema> = {
  name: "list_experiments",
  description: "Lists experiments, optionally filtered by status.",
  schema: experimentsSchema,
  jsonSchema: { type: "object", properties: { status: { type: "string", enum: ["PLANNED", "RUNNING", "COMPLETED", "STOPPED"] } }, additionalProperties: false },
  async execute(ctx, input) {
    const [rows, total] = await Promise.all([
      db.experiment.findMany({
        where: { organizationId: ctx.orgId, ...(input.status ? { status: input.status } : {}) },
        include: { testStore: { select: { id: true, name: true, code: true } }, controlStore: { select: { id: true, name: true, code: true } } },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      db.experiment.count({ where: { organizationId: ctx.orgId } }),
    ]);
    const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
    const result: ExperimentsResult = {
      tool: "list_experiments",
      status: input.status ?? null,
      totalAllStatuses: total,
      experiments: rows.map((e) => ({
        id: e.id, title: e.title, status: e.status, testStore: ref(e.testStore), controlStore: e.controlStore ? ref(e.controlStore) : null,
        startDate: d(e.startDate), endDate: d(e.endDate), hypothesis: e.hypothesis, decision: e.decision,
      })),
    };
    return { result, dataWindow: `Experiment records${input.status ? ` with status ${input.status}` : ""} (${rows.length} of ${total})` };
  },
};

// ── get_research ─────────────────────────────────────────────────────────────

const researchSchema = z.object({ store: storeRefSchema });
const getResearch: AnalystTool<typeof researchSchema> = {
  name: "get_research",
  description: "Stored location research for a store: competitors, location signals and findings, each with its source. Reads what is stored; does not run new external research.",
  schema: researchSchema,
  jsonSchema: { type: "object", properties: { store: J.store }, required: ["store"], additionalProperties: false },
  async execute(ctx, input) {
    const all = await getStores(ctx.orgId);
    const store = resolveOne(all, input.store); // resolved inside ctx.orgId — the id is safe to query by
    const [competitors, signals, latestResult] = await Promise.all([
      db.competitor.findMany({ where: { storeId: store.id, store: { organizationId: ctx.orgId } }, orderBy: { distanceM: "asc" }, take: 25 }),
      db.locationSignal.findMany({ where: { storeId: store.id, store: { organizationId: ctx.orgId } }, orderBy: { distanceM: "asc" }, take: 40 }),
      db.researchResult.findFirst({ where: { organizationId: ctx.orgId, storeId: store.id }, orderBy: { completedAt: "desc" }, include: { findings: true } }),
    ]);
    const sourceIds = [...new Set([
      ...competitors.map((c) => c.sourceId), ...signals.map((s) => s.sourceId),
      ...(latestResult?.findings.flatMap((f) => (f.sourceId ? [f.sourceId] : [])) ?? []),
    ])];
    const sources = sourceIds.length > 0
      ? await db.researchSource.findMany({ where: { organizationId: ctx.orgId, id: { in: sourceIds } }, orderBy: { title: "asc" } })
      : [];
    const result: ResearchToolResult = {
      tool: "get_research",
      store: ref(store),
      stored: competitors.length + signals.length + (latestResult?.findings.length ?? 0) > 0,
      research: {
        lastResearchAt: latestResult?.completedAt.toISOString() ?? null,
        provider: latestResult?.provider ?? null,
        radiusM: latestResult?.radiusM ?? null,
        competitors: competitors.map((c) => ({ name: c.name, category: c.category, distanceM: c.distanceM, sourceId: c.sourceId })),
        signals: signals.map((s) => ({ type: s.type, name: s.name, distanceM: s.distanceM, sourceId: s.sourceId })),
        findings: (latestResult?.findings ?? []).map((f) => ({ kind: f.kind, text: f.text, sourceId: f.sourceId })),
        sources: sources.map(toSourceDTO),
      },
    };
    return {
      result,
      dataWindow: `Stored research for ${store.name}: ${competitors.length} competitor(s), ${signals.length} location signal(s), ${latestResult?.findings.length ?? 0} finding(s), ${sources.length} source(s). No external request was made.`,
    };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const ANALYST_TOOLS = [
  listStores, getStoreKpis, compareStores, findDecliningTraffic, findAnomaliesTool, explainRevenueChange,
  calculateBasketChangeTool, calculateRevenueScenario, listExperiments, getResearch,
] as const;

const BY_NAME = new Map<string, AnalystTool>(ANALYST_TOOLS.map((t) => [t.name, t as unknown as AnalystTool]));

export function getTool(name: string): AnalystTool | null {
  return BY_NAME.get(name) ?? null;
}

export function toolSpecs(): AIToolSpec[] {
  return ANALYST_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.jsonSchema }));
}

/** Validates the input with the tool's schema and runs it. Throws ToolInputError for bad input. */
export async function executeTool(ctx: OrgContext, name: string, rawInput: unknown): Promise<ToolOutput & { input: Record<string, unknown>; description: string }> {
  const tool = getTool(name);
  if (!tool) throw new ToolInputError(`Unknown tool "${name}".`);
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) throw new ToolInputError(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} — ${i.message}`).join("; ")}`);
  const out = await tool.execute(ctx, parsed.data);
  return { ...out, input: parsed.data as Record<string, unknown>, description: tool.description };
}
