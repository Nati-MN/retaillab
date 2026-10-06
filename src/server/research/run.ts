import "server-only";
import { buildFindings, enforceSourcedFacts, researchStatus } from "@/lib/research/findings";
import { getDemographicsProvider, getPlacesProvider, getSearchProvider } from "@/lib/providers/registry";
import type { Place, PopulationFigure, SignalTypeKey, SourceRef } from "@/lib/providers/types";
import { db } from "../db";
import { enforceRateLimit } from "../rateLimit";
import { assertStoreInOrg, type OrgContext } from "../session";

/**
 * Location research orchestration: provider → sources → competitors/signals → findings.
 *
 * Privacy boundary: the only things sent to a provider are the store's
 * coordinates, the radius and (for the demo provider) the store code. No
 * revenue, cost or customer data is read here at all.
 *
 * Nothing is fabricated: no provider, no coordinates or a provider error all
 * end in status UNAVAILABLE with a reason, and nothing is written.
 */

export type ResearchOutcome =
  | { status: "COMPLETED" | "PARTIAL"; resultId: string; places: number; sources: number }
  | { status: "UNAVAILABLE"; reason: string };

const SIGNAL_TYPES: readonly string[] = [
  "PUBLIC_TRANSPORT", "PARKING", "SCHOOL", "UNIVERSITY", "OFFICE", "RESIDENTIAL",
  "SHOPPING_CENTER", "POINT_OF_INTEREST", "POPULATION", "DEVELOPMENT", "ROAD_ACCESS",
];

export async function runLocationResearch(
  ctx: Pick<OrgContext, "orgId" | "org">,
  storeId: string,
  radiusM: number,
  query?: string,
): Promise<ResearchOutcome> {
  await enforceRateLimit("research", ctx.orgId);
  const store = await assertStoreInOrg(ctx.orgId, storeId);

  const placesProvider = getPlacesProvider(ctx.org);
  if (!placesProvider) {
    return { status: "UNAVAILABLE", reason: "No places provider is connected. Nothing was looked up and nothing was stored." };
  }
  if (store.latitude === null || store.longitude === null) {
    return { status: "UNAVAILABLE", reason: "This store has no coordinates. Add latitude and longitude to the store before running location research." };
  }
  const demographics = getDemographicsProvider();
  const search = getSearchProvider();
  const nearby = { latitude: store.latitude, longitude: store.longitude, radiusM, demoRef: store.code };

  let places: Place[];
  let population: PopulationFigure | null = null;
  try {
    places = await placesProvider.findNearby(nearby);
    if (demographics) population = await demographics.getPopulation({ latitude: nearby.latitude, longitude: nearby.longitude, radiusM });
  } catch (e) {
    console.error("[research] provider error", e);
    const detail = e instanceof Error && e.message ? ` (${e.message.slice(0, 160)})` : "";
    return { status: "UNAVAILABLE", reason: `Research provider unavailable${detail}. Nothing was stored.` };
  }
  places = places.filter((p) => p.distanceM <= radiusM && (p.kind === "competitor" || SIGNAL_TYPES.includes(p.category)));

  const isDemo = placesProvider.info.isDemo;
  const drafts = buildFindings({
    radiusM,
    places,
    population,
    connected: { demographics: !!demographics, search: !!search },
    providerLabel: placesProvider.info.label,
  });

  const refs = new Map<string, SourceRef>();
  for (const p of places) if (!refs.has(p.source.url)) refs.set(p.source.url, p.source);
  if (population && !refs.has(population.source.url)) refs.set(population.source.url, population.source);

  const now = new Date();
  const resultId = await db.$transaction(async (tx) => {
    // Sources: one row per URL within the organization.
    const sourceIds = new Map<string, string>();
    for (const [url, ref] of refs) {
      const data = {
        title: ref.title, publisher: ref.publisher, publishedAt: ref.publishedAt ?? null, accessedAt: ref.accessedAt,
        excerpt: ref.excerpt, reliability: ref.reliability, isDemo: isDemo || ref.reliability === "DEMO",
      };
      const existing = await tx.researchSource.findFirst({ where: { organizationId: ctx.orgId, url }, select: { id: true } });
      const row = existing
        ? await tx.researchSource.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.researchSource.create({ data: { ...data, organizationId: ctx.orgId, url }, select: { id: true } });
      sourceIds.set(url, row.id);
    }

    // Replace what this kind of provider (demo vs real) previously stored for the store inside
    // the radius just checked. Rows further out were not re-checked and are left as they are.
    await tx.competitor.deleteMany({ where: { storeId: store.id, isDemo, distanceM: { lte: radiusM } } });
    await tx.locationSignal.deleteMany({ where: { storeId: store.id, isDemo, OR: [{ distanceM: { lte: radiusM } }, { distanceM: null }] } });

    const competitors = places.filter((p) => p.kind === "competitor");
    const signals = places.filter((p) => p.kind === "signal");
    if (competitors.length > 0) {
      await tx.competitor.createMany({
        data: competitors.map((p) => ({
          storeId: store.id, name: p.name, category: p.category, latitude: p.latitude, longitude: p.longitude,
          distanceM: Math.round(p.distanceM), openingHours: p.openingHours ?? null, rating: p.rating ?? null,
          reviewCount: p.reviewCount ?? null, sourceId: sourceIds.get(p.source.url)!, lastCheckedAt: now, isDemo,
        })),
      });
    }
    if (signals.length > 0) {
      await tx.locationSignal.createMany({
        data: signals.map((p) => ({
          storeId: store.id, type: p.category as SignalTypeKey, name: p.name, detail: p.detail ?? null,
          latitude: p.latitude, longitude: p.longitude, distanceM: Math.round(p.distanceM),
          sourceId: sourceIds.get(p.source.url)!, isDemo,
        })),
      });
    }
    if (population) {
      await tx.locationSignal.create({
        data: {
          storeId: store.id, type: "POPULATION", name: `${population.population.toLocaleString("en-US")} residents — ${population.areaLabel}`,
          detail: `Reference year ${population.referenceYear}`, sourceId: sourceIds.get(population.source.url)!, isDemo,
        },
      });
    }

    // A FACT without a stored source is never written.
    const findings = enforceSourcedFacts(
      drafts.map((d) => ({ kind: d.kind, text: d.text, sourceId: d.sourceUrl ? sourceIds.get(d.sourceUrl) ?? null : null })),
    );
    const result = await tx.researchResult.create({
      data: {
        organizationId: ctx.orgId, storeId: store.id,
        query: (query?.trim() || `Analyze the environment around ${store.name}.`).slice(0, 300),
        radiusM, provider: placesProvider.info.id,
        status: researchStatus({ demographics: !!demographics, search: !!search }),
        sourcesChecked: refs.size, isDemo, completedAt: now,
        findings: { create: findings },
      },
      select: { id: true, status: true },
    });
    return result.id;
  });

  return {
    status: researchStatus({ demographics: !!demographics, search: !!search }),
    resultId, places: places.length, sources: refs.size,
  };
}
