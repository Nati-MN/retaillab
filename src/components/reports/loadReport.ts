import "server-only";
import { getExperiments } from "@/components/experiments/queries";
import { addMonths, monthKey } from "@/lib/period";
import type { ReportInput } from "@/lib/reports/model";
import { db } from "@/server/db";
import { getKnownEvents, getMonthFacts, getStores } from "@/server/queries";

export async function getReportRow(orgId: string, id: string) {
  return db.report.findFirst({ where: { id, organizationId: orgId }, include: { createdBy: { select: { name: true } } } });
}

/** Gathers everything a report needs, scoped to the organization and to the report's stores. */
export async function loadReportInput(
  orgId: string,
  currency: string,
  report: { periodStart: Date; periodEnd: Date; sections: string[]; storeIds: string[] },
): Promise<{ input: ReportInput; allStoreIds: string[]; missingStores: number }> {
  const allStores = await getStores(orgId);
  const selected = report.storeIds.length > 0 ? allStores.filter((s) => report.storeIds.includes(s.id)) : allStores;
  const ids = selected.map((s) => s.id);
  const period = { from: monthKey(report.periodStart), to: monthKey(report.periodEnd) };
  const storeScope = { organizationId: orgId, id: { in: ids } };

  const [facts, events, competitors, signals, sources, experiments, opportunities, findings, strategies] = await Promise.all([
    // Three years of history before the period: enough for year-over-year comparison and the anomaly rule.
    getMonthFacts(orgId, { from: addMonths(period.from, -36), to: period.to, storeIds: ids }),
    getKnownEvents(orgId),
    db.competitor.findMany({ where: { store: storeScope }, select: { storeId: true, name: true, category: true, distanceM: true, sourceId: true } }),
    db.locationSignal.findMany({ where: { store: storeScope }, select: { storeId: true, type: true, name: true, sourceId: true } }),
    db.researchSource.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, url: true, publisher: true, accessedAt: true, isDemo: true } }),
    getExperiments(orgId, { storeIds: ids }),
    db.opportunity.findMany({ where: { organizationId: orgId, storeId: { in: ids } }, orderBy: [{ store: { name: "asc" } }, { createdAt: "asc" }] }),
    db.researchFinding.findMany({
      where: { kind: "RISK", result: { organizationId: orgId, OR: [{ storeId: { in: ids } }, { storeId: null }] } },
      select: { text: true, sourceId: true, result: { select: { storeId: true } } },
      orderBy: { result: { completedAt: "asc" } },
    }),
    db.strategy.findMany({
      where: { organizationId: orgId, status: "HYPOTHESIS", OR: [{ storeId: { in: ids } }, { storeId: null }] },
      orderBy: [{ store: { name: "asc" } }, { createdAt: "asc" }],
    }),
  ]);

  return {
    allStoreIds: allStores.map((s) => s.id),
    missingStores: report.storeIds.length > 0 ? report.storeIds.length - selected.length : 0,
    input: {
      currency,
      generatedAt: new Date().toISOString().slice(0, 10),
      period,
      sections: report.sections,
      stores: selected,
      facts,
      events: events.filter((e) => e.storeId === null || ids.includes(e.storeId)),
      competitors,
      signals,
      sources: sources.map((s) => ({ ...s, accessedAt: s.accessedAt.toISOString() })),
      experiments,
      opportunities: opportunities.map((o) => ({
        storeId: o.storeId, title: o.title, observation: o.observation, hypothesis: o.hypothesis, impactScenario: o.impactScenario,
        estimatedCost: o.estimatedCost?.toNumber() ?? null, status: o.status, dataConfidence: o.dataConfidence, suggestedExperiment: o.suggestedExperiment,
      })),
      riskFindings: findings.map((f) => ({ storeId: f.result.storeId, text: f.text, sourceId: f.sourceId })),
      strategies: strategies.map((s) => ({
        storeId: s.storeId, title: s.title, hypothesis: s.hypothesis, proposedTest: s.proposedTest, metricsToWatch: s.metricsToWatch, dataConfidence: s.dataConfidence,
      })),
    },
  };
}
