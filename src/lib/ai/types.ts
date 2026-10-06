import type { Kpis, KpiKey } from "@/lib/analytics/types";
import type { BasketChangeResult, RevenueOpportunityResult } from "@/lib/calc";
import type { RevenueChangeDecomposition } from "@/lib/calc/revenueChange";
import type { MonthKey } from "@/lib/period";

export type { RevenueChangeDecomposition };

/**
 * Shapes shared by the analyst's router (pure), tools (server), answer
 * composer (pure) and panel (client). Everything here is plain JSON.
 */

// ── Store references ─────────────────────────────────────────────────────────

export interface StoreLite {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface StoreRef {
  storeId: string;
  storeName: string;
  storeCode: string;
}

export interface Window {
  from: MonthKey;
  to: MonthKey;
}

// ── Plans ────────────────────────────────────────────────────────────────────

export type ToolName =
  | "list_stores"
  | "get_store_kpis"
  | "compare_stores"
  | "find_declining_traffic"
  | "find_anomalies"
  | "explain_revenue_change"
  | "calculate_basket_change"
  | "calculate_revenue_scenario"
  | "list_experiments"
  | "get_research";

export type PeriodKey = "1m" | "3m" | "6m" | "12m" | "ytd";

export interface PlannedCall {
  tool: ToolName;
  input: Record<string, unknown>;
}

export type Intent =
  | "list_stores"
  | "store_kpis"
  | "compare"
  | "declining_traffic"
  | "anomalies"
  | "explain_revenue"
  | "basket_change"
  | "revenue_scenario"
  | "experiments"
  | "research"
  | "clarify"
  | "none";

export interface Plan {
  intent: Intent;
  calls: PlannedCall[];
  /** How ambiguous wording was interpreted ("Interpreting 'Store 4' as …"). Shown at the top of the answer. */
  interpretations: string[];
  /** Set when intent is "clarify": what the user needs to specify. */
  clarification?: string;
  /** Direction the question takes for granted ("why did revenue decline?"). The answer points out when the data disagrees. */
  presumes?: "decline" | "increase";
}

// ── Tool results ─────────────────────────────────────────────────────────────

export interface EventLite {
  storeCode: string | null;
  storeName: string | null;
  date: string;
  title: string;
  description: string | null;
}

export interface ListStoresResult {
  tool: "list_stores";
  stores: (StoreRef & { city: string; type: string; areaSqm: number | null; employees: number | null; position: number })[];
}

export interface StoreKpisResult {
  tool: "get_store_kpis";
  store: StoreRef;
  window: Window | null;
  baseline: Window | null;
  kpis: Kpis | null;
  previousYear: Kpis | null;
  changeVsPreviousYear: Record<KpiKey, number | null> | null;
}

export interface CompareStoresResult {
  tool: "compare_stores";
  window: Window | null;
  stores: { store: StoreRef; kpis: Kpis }[];
  /** Deterministic statements derived from the KPI table (highest / lowest per metric). */
  facts: string[];
}

export interface TrafficRow {
  store: StoreRef;
  customers: number | null;
  customersPreviousYear: number | null;
  changePct: number | null;
}

export interface DecliningTrafficResult {
  tool: "find_declining_traffic";
  months: 3 | 6;
  window: Window | null;
  baseline: Window | null;
  rows: TrafficRow[];
  declining: TrafficRow[];
  notComparable: { store: StoreRef; reason: string }[];
}

export interface AnomalyLite {
  store: StoreRef;
  metric: string;
  metricLabel: string;
  month: MonthKey;
  value: number;
  changePct: number;
  basis: "yoy" | "mom";
  zScore: number;
  direction: "up" | "down";
  monetary: boolean;
  knownEvents: EventLite[];
}

export interface AnomaliesResult {
  tool: "find_anomalies";
  window: Window | null;
  historyWindow: Window | null;
  store: StoreRef | null;
  metric: string | null;
  anomalies: AnomalyLite[];
  /** Flagged months in the 12 months up to the latest month (same store / metric filter), for context when the window has none. */
  flaggedLast12Months: number;
  method: string;
}

export interface ExplainRevenueResult {
  tool: "explain_revenue_change";
  store: StoreRef | null;
  window: Window | null;
  baseline: Window | null;
  basis: "previous_year" | "previous_period" | null;
  currentRevenue: number | null;
  previousRevenue: number | null;
  currentTransactions: number | null;
  previousTransactions: number | null;
  revenueChangePct: number | null;
  decomposition: RevenueChangeDecomposition | null;
  knownEvents: EventLite[];
  unknowns: string[];
}

export interface BasketChangeToolResult {
  tool: "calculate_basket_change";
  store: StoreRef | null;
  month: MonthKey | null;
  transactions: number | null;
  averageBasket: number | null;
  basketDelta: number;
  result: BasketChangeResult | null;
  assumption: string;
}

export interface RevenueScenarioToolResult {
  tool: "calculate_revenue_scenario";
  store: StoreRef | null;
  month: MonthKey | null;
  transactionsPerDay: number | null;
  averageBasket: number | null;
  openDays: number | null;
  trafficChangePct: number;
  basketChangePct: number;
  result: RevenueOpportunityResult | null;
  assumption: string;
}

export interface ExperimentLite {
  id: string;
  title: string;
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "STOPPED";
  testStore: StoreRef;
  controlStore: StoreRef | null;
  startDate: string | null;
  endDate: string | null;
  hypothesis: string;
  decision: string | null;
}

export interface ExperimentsResult {
  tool: "list_experiments";
  status: ExperimentLite["status"] | null;
  experiments: ExperimentLite[];
  totalAllStatuses: number;
}

export interface SourceLite {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string;
  excerpt: string;
  reliability: "OFFICIAL" | "COMMUNITY" | "COMMERCIAL" | "UNKNOWN" | "DEMO";
  isDemo: boolean;
}

export interface ResearchToolResult {
  tool: "get_research";
  store: StoreRef;
  stored: boolean;
  research: {
    lastResearchAt: string | null;
    provider: string | null;
    radiusM: number | null;
    competitors: { name: string; category: string; distanceM: number; sourceId: string }[];
    signals: { type: string; name: string; distanceM: number | null; sourceId: string }[];
    findings: { kind: "FACT" | "OPPORTUNITY" | "RISK" | "UNKNOWN"; text: string; sourceId: string | null }[];
    sources: SourceLite[];
  };
}

export type ToolResult =
  | ListStoresResult
  | StoreKpisResult
  | CompareStoresResult
  | DecliningTrafficResult
  | AnomaliesResult
  | ExplainRevenueResult
  | BasketChangeToolResult
  | RevenueScenarioToolResult
  | ExperimentsResult
  | ResearchToolResult;

// ── Answer blocks ────────────────────────────────────────────────────────────

export type BlockKind = "FACT" | "CALCULATED" | "ASSUMPTION" | "CORRELATION" | "HYPOTHESIS" | "FORECAST" | "EXPERIMENT_RESULT" | "UNKNOWN" | "SCENARIO" | "DEMO";

export interface CalcLineDTO {
  label: string;
  expr?: string;
  result: string;
  emphasis?: boolean;
  note?: string;
}

export type Block =
  | { type: "text"; text: string; kind?: BlockKind; tone?: "interpretation" | "plain" | "unavailable" }
  | { type: "table"; title: string; kind?: BlockKind; columns: string[]; rows: { label: string; sub?: string; values: string[] }[]; note?: string }
  | { type: "calc"; title: string; kind: BlockKind; lines: CalcLineDTO[] }
  | { type: "facts"; title: string; kind: BlockKind; items: string[] }
  | { type: "hypotheses"; items: string[] }
  | { type: "unknowns"; items: string[] }
  | { type: "sources"; items: { text: string; label?: string; sourceId: string | null }[]; sources: SourceLite[]; title: string }
  | { type: "links"; links: { label: string; href: string }[] }
  | { type: "suggestions"; title: string; items: string[] };

export interface ToolCallRecord {
  tool: ToolName;
  description: string;
  input: Record<string, unknown>;
  /** Readable form of parameters that are internal ids (store ids → "Name (CODE)"). */
  inputLabels?: Record<string, string>;
  /** Human-readable description of the data the tool read ("Monthly facts Jul 26 – Sep 26, 1 store"). */
  dataWindow: string;
  ok: boolean;
  error?: string;
}

export interface AnalystResponse {
  mode: "rules" | "llm";
  blocks: Block[];
  toolCalls: ToolCallRecord[];
}
