import "server-only";
import { db } from "../db";
import { toSourceDTO, type SourceDTO } from "../queries";

/** Read models for stored research: competitors, location signals and research results (always organization-scoped). */

export interface CompetitorDTO {
  id: string;
  storeId: string;
  name: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  distanceM: number;
  openingHours: string | null;
  rating: number | null;
  reviewCount: number | null;
  lastCheckedAt: string;
  isDemo: boolean;
  source: SourceDTO;
}

export type SignalType =
  | "PUBLIC_TRANSPORT" | "PARKING" | "SCHOOL" | "UNIVERSITY" | "OFFICE" | "RESIDENTIAL"
  | "SHOPPING_CENTER" | "POINT_OF_INTEREST" | "POPULATION" | "DEVELOPMENT" | "ROAD_ACCESS";

export interface SignalDTO {
  id: string;
  storeId: string;
  type: SignalType;
  name: string;
  detail: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  isDemo: boolean;
  source: SourceDTO;
}

export async function getCompetitors(orgId: string, storeId?: string): Promise<CompetitorDTO[]> {
  const rows = await db.competitor.findMany({
    where: { store: { organizationId: orgId, ...(storeId ? { id: storeId } : {}) } },
    include: { source: true },
    orderBy: [{ distanceM: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id, storeId: c.storeId, name: c.name, category: c.category, latitude: c.latitude, longitude: c.longitude,
    distanceM: c.distanceM, openingHours: c.openingHours, rating: c.rating, reviewCount: c.reviewCount,
    lastCheckedAt: c.lastCheckedAt.toISOString(), isDemo: c.isDemo, source: toSourceDTO(c.source),
  }));
}

export async function getSignals(orgId: string, storeId?: string): Promise<SignalDTO[]> {
  const rows = await db.locationSignal.findMany({
    where: { store: { organizationId: orgId, ...(storeId ? { id: storeId } : {}) } },
    include: { source: true },
    orderBy: [{ distanceM: "asc" }, { name: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id, storeId: s.storeId, type: s.type, name: s.name, detail: s.detail, latitude: s.latitude,
    longitude: s.longitude, distanceM: s.distanceM, isDemo: s.isDemo, source: toSourceDTO(s.source),
  }));
}

export interface FindingDTO {
  id: string;
  kind: "FACT" | "OPPORTUNITY" | "RISK" | "UNKNOWN";
  text: string;
  source: SourceDTO | null;
}

export interface ResearchResultDTO {
  id: string;
  storeId: string | null;
  storeName: string | null;
  query: string;
  radiusM: number;
  provider: string;
  status: "COMPLETED" | "PARTIAL" | "UNAVAILABLE";
  sourcesChecked: number;
  isDemo: boolean;
  completedAt: string;
  findings: FindingDTO[];
  /** Distinct sources cited by the findings, in order of first citation. */
  sources: SourceDTO[];
}

const KIND_ORDER = { FACT: 0, OPPORTUNITY: 1, RISK: 2, UNKNOWN: 3 } as const;

type ResultRow = Awaited<ReturnType<typeof findResults>>[number];

function findResults(orgId: string, where: { id?: string; storeId?: string }, take?: number) {
  return db.researchResult.findMany({
    where: { organizationId: orgId, ...where },
    include: { store: { select: { name: true } }, findings: { include: { source: true }, orderBy: { id: "asc" } } },
    orderBy: { completedAt: "desc" },
    ...(take ? { take } : {}),
  });
}

function toResultDTO(r: ResultRow): ResearchResultDTO {
  const findings: FindingDTO[] = r.findings
    // A FACT whose source was deleted is no longer a sourced fact and is not shown as one.
    .filter((f) => f.kind !== "FACT" || f.source !== null)
    .map((f) => ({ id: f.id, kind: f.kind, text: f.text, source: f.source ? toSourceDTO(f.source) : null }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const sources: SourceDTO[] = [];
  for (const f of findings) if (f.source && !sources.some((s) => s.id === f.source!.id)) sources.push(f.source);
  return {
    id: r.id, storeId: r.storeId, storeName: r.store?.name ?? null, query: r.query, radiusM: r.radiusM,
    provider: r.provider, status: r.status, sourcesChecked: r.sourcesChecked, isDemo: r.isDemo,
    completedAt: r.completedAt.toISOString(), findings, sources,
  };
}

export async function getResearchResults(orgId: string, opts: { storeId?: string; take?: number } = {}): Promise<ResearchResultDTO[]> {
  const rows = await findResults(orgId, opts.storeId ? { storeId: opts.storeId } : {}, opts.take ?? 30);
  return rows.map(toResultDTO);
}

export async function getResearchResult(orgId: string, id: string): Promise<ResearchResultDTO | null> {
  const rows = await findResults(orgId, { id }, 1);
  return rows[0] ? toResultDTO(rows[0]) : null;
}

export function countFindings(findings: readonly FindingDTO[]) {
  const c = { FACT: 0, OPPORTUNITY: 0, RISK: 0, UNKNOWN: 0 };
  for (const f of findings) c[f.kind] += 1;
  return c;
}
