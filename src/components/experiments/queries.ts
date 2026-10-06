import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { ExperimentDTO } from "@/lib/experiments/model";

/** Experiment read model. Always scoped by the organization id from requireOrg(). */

const include = {
  testStore: { select: { id: true, name: true } },
  controlStore: { select: { id: true, name: true } },
  strategy: { select: { id: true, title: true, status: true } },
  metrics: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
} satisfies Prisma.ExperimentInclude;

type Row = Prisma.ExperimentGetPayload<{ include: typeof include }>;

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : d.toNumber());
const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toExperimentDTO(e: Row): ExperimentDTO {
  return {
    id: e.id,
    title: e.title,
    hypothesis: e.hypothesis,
    status: e.status,
    startDate: day(e.startDate),
    endDate: day(e.endDate),
    cost: num(e.cost),
    notes: e.notes,
    decision: e.decision,
    decisionNote: e.decisionNote,
    isDemo: e.isDemo,
    testStore: e.testStore,
    controlStore: e.controlStore,
    strategy: e.strategy,
    metrics: e.metrics.map((m) => ({
      id: m.id, name: m.name, unit: m.unit, isPrimary: m.isPrimary,
      testBefore: num(m.testBefore), testAfter: num(m.testAfter),
      controlBefore: num(m.controlBefore), controlAfter: num(m.controlAfter),
    })),
  };
}

export async function getExperiments(orgId: string, opts: { storeId?: string; storeIds?: string[] } = {}): Promise<ExperimentDTO[]> {
  const rows = await db.experiment.findMany({
    where: {
      organizationId: orgId,
      ...(opts.storeId ? { OR: [{ testStoreId: opts.storeId }, { controlStoreId: opts.storeId }] } : {}),
      ...(opts.storeIds ? { testStoreId: { in: opts.storeIds } } : {}),
    },
    include,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toExperimentDTO);
}

export async function getExperiment(orgId: string, id: string): Promise<ExperimentDTO | null> {
  const row = await db.experiment.findFirst({ where: { id, organizationId: orgId }, include });
  return row ? toExperimentDTO(row) : null;
}
