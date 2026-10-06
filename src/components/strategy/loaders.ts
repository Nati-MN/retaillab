import "server-only";
import type { Prisma } from "@prisma/client";
import { computeKpis } from "@/lib/analytics/aggregate";
import { addMonths, periodLabel, type MonthKey } from "@/lib/period";
import { storePrefillFromKpis, type StorePrefill } from "@/lib/strategy/prefill";
import type { ScenarioKindKey, StrategyCategoryKey } from "@/lib/strategy/rules";
import { variantsFromRows, type VariantValues } from "@/lib/strategy/scenarioKinds";
import { db } from "@/server/db";
import { getLatestMonth, getMonthFacts, getStores, toSourceDTO, type SourceDTO } from "@/server/queries";

/** Read models for the strategy area. Every query is scoped by the organization id from requireOrg(). */

export interface ScenarioDTO {
  id: string;
  name: string;
  kind: ScenarioKindKey;
  derivation: string | null;
  storeId: string | null;
  storeName: string | null;
  strategyId: string | null;
  strategyTitle: string | null;
  createdAt: string;
  variants: VariantValues;
}

export type ConfidenceKey = "LOW" | "MEDIUM" | "HIGH";
export type StrategyStatusKey = "HYPOTHESIS" | "SIMULATED" | "TESTING" | "VALIDATED" | "REJECTED";
export type OpportunityStatusKey = "NEW" | "INVESTIGATING" | "READY_TO_TEST" | "TESTING" | "VALIDATED" | "REJECTED" | "INCONCLUSIVE";

export interface StrategyDTO {
  id: string;
  storeId: string | null;
  storeName: string | null;
  storeCode: string | null;
  libraryKey: string | null;
  ruleKey: string | null;
  title: string;
  category: StrategyCategoryKey;
  origin: "RULE_ENGINE" | "LLM" | "USER";
  observation: string;
  locationSignal: string | null;
  hypothesis: string;
  whyItMayMatter: string;
  proposedTest: string;
  assumptions: string[];
  risks: string[];
  metricsToWatch: string[];
  costAssumption: number | null;
  dataConfidence: ConfidenceKey;
  confidenceNote: string | null;
  status: StrategyStatusKey;
  createdAt: string;
  scenario: ScenarioDTO | null;
  opportunityId: string | null;
  experiments: { id: string; title: string; status: string }[];
}

export interface OpportunityDTO {
  id: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  strategyId: string | null;
  title: string;
  observation: string;
  hypothesis: string;
  impactScenario: string;
  estimatedCost: number | null;
  effort: "LOW" | "MEDIUM" | "HIGH";
  dataConfidence: ConfidenceKey;
  suggestedExperiment: string;
  status: OpportunityStatusKey;
  createdAt: string;
  /** Scenario of the linked hypothesis, if any — outputs are recomputed from its inputs. */
  scenario: ScenarioDTO | null;
}

type ScenarioRow = Prisma.ScenarioGetPayload<{
  include: { inputs: true; store: { select: { name: true } }; strategy: { select: { title: true } } };
}>;

const scenarioInclude = { inputs: true, store: { select: { name: true } }, strategy: { select: { title: true } } } as const;

function toScenarioDTO(s: ScenarioRow): ScenarioDTO {
  return {
    id: s.id, name: s.name, kind: s.kind, derivation: s.derivation, storeId: s.storeId, storeName: s.store?.name ?? null,
    strategyId: s.strategyId, strategyTitle: s.strategy?.title ?? null, createdAt: s.createdAt.toISOString(),
    variants: variantsFromRows(s.inputs.map((i) => ({ variant: i.variant, key: i.key, value: i.value.toNumber() }))),
  };
}

export async function loadStrategies(
  orgId: string,
  filter: { storeId?: string; category?: StrategyCategoryKey } = {},
): Promise<StrategyDTO[]> {
  const rows = await db.strategy.findMany({
    where: { organizationId: orgId, ...(filter.storeId ? { storeId: filter.storeId } : {}), ...(filter.category ? { category: filter.category } : {}) },
    include: {
      store: { select: { name: true, code: true } },
      scenarios: { include: scenarioInclude, orderBy: { createdAt: "asc" }, take: 1 },
      opportunities: { select: { id: true }, take: 1 },
      experiments: { select: { id: true, title: true, status: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: [{ store: { name: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id, storeId: s.storeId, storeName: s.store?.name ?? null, storeCode: s.store?.code ?? null,
    libraryKey: s.libraryKey, ruleKey: s.ruleKey, title: s.title, category: s.category, origin: s.origin,
    observation: s.observation, locationSignal: s.locationSignal, hypothesis: s.hypothesis, whyItMayMatter: s.whyItMayMatter,
    proposedTest: s.proposedTest, assumptions: s.assumptions, risks: s.risks, metricsToWatch: s.metricsToWatch,
    costAssumption: s.costAssumption?.toNumber() ?? null, dataConfidence: s.dataConfidence, confidenceNote: s.confidenceNote,
    status: s.status, createdAt: s.createdAt.toISOString(),
    scenario: s.scenarios[0] ? toScenarioDTO(s.scenarios[0]) : null,
    opportunityId: s.opportunities[0]?.id ?? null,
    experiments: s.experiments,
  }));
}

export async function loadOpportunities(orgId: string, filter: { storeId?: string } = {}): Promise<OpportunityDTO[]> {
  const rows = await db.opportunity.findMany({
    where: { organizationId: orgId, ...(filter.storeId ? { storeId: filter.storeId } : {}) },
    include: {
      store: { select: { name: true, code: true } },
      strategy: { select: { scenarios: { include: scenarioInclude, orderBy: { createdAt: "asc" }, take: 1 } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map((o) => ({
    id: o.id, storeId: o.storeId, storeName: o.store.name, storeCode: o.store.code, strategyId: o.strategyId, title: o.title,
    observation: o.observation, hypothesis: o.hypothesis, impactScenario: o.impactScenario,
    estimatedCost: o.estimatedCost?.toNumber() ?? null, effort: o.effort, dataConfidence: o.dataConfidence,
    suggestedExperiment: o.suggestedExperiment, status: o.status, createdAt: o.createdAt.toISOString(),
    scenario: o.strategy?.scenarios[0] ? toScenarioDTO(o.strategy.scenarios[0]) : null,
  }));
}

export async function loadScenarios(orgId: string): Promise<ScenarioDTO[]> {
  const rows = await db.scenario.findMany({
    where: { organizationId: orgId },
    include: scenarioInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toScenarioDTO);
}

export async function loadScenario(orgId: string, id: string): Promise<ScenarioDTO | null> {
  const row = await db.scenario.findFirst({ where: { id, organizationId: orgId }, include: scenarioInclude });
  return row ? toScenarioDTO(row) : null;
}

/** Each store's recorded basket, margin and open days over the last 3 data months. */
export async function loadStorePrefills(orgId: string): Promise<{ prefills: StorePrefill[]; latest: MonthKey | null }> {
  const [stores, latest] = await Promise.all([getStores(orgId), getLatestMonth(orgId)]);
  if (!latest) {
    return {
      latest,
      prefills: stores.map((s) => storePrefillFromKpis(s, computeKpis([], [s]), "no data")),
    };
  }
  const range = { from: addMonths(latest, -2), to: latest };
  const facts = await getMonthFacts(orgId, range);
  const label = periodLabel(range);
  return {
    latest,
    prefills: stores.map((s) => storePrefillFromKpis(s, computeKpis(facts.filter((f) => f.storeId === s.id), [s]), label)),
  };
}

/** External sources behind the location signals of the given stores (deduplicated per store). */
export async function loadSignalSources(orgId: string, storeIds: string[]): Promise<Map<string, SourceDTO[]>> {
  const out = new Map<string, SourceDTO[]>();
  if (storeIds.length === 0) return out;
  const rows = await db.locationSignal.findMany({
    where: { storeId: { in: storeIds }, store: { organizationId: orgId } },
    select: { storeId: true, source: true },
  });
  for (const r of rows) {
    const list = out.get(r.storeId) ?? [];
    if (!list.some((s) => s.id === r.source.id)) list.push(toSourceDTO(r.source));
    out.set(r.storeId, list);
  }
  return out;
}
