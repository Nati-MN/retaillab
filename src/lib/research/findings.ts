import { fmtDistance, fmtNumber } from "@/lib/format";
import type { Place, PopulationFigure, SignalTypeKey } from "@/lib/providers/types";

/**
 * Pure builder that turns a provider result into structured findings.
 *
 * - FACT: a count or nearest-distance statement read directly off the provider
 *   result. Every FACT carries the URL of the source it came from; a FACT
 *   without a source is never produced (and `enforceSourcedFacts` drops any).
 * - OPPORTUNITY / RISK: worded as possibilities and reference the source of the
 *   fact they rest on. They never state an effect on the store.
 * - UNKNOWN: what could not be established, said plainly.
 */

export type FindingKind = "FACT" | "OPPORTUNITY" | "RISK" | "UNKNOWN";

export interface FindingDraft {
  kind: FindingKind;
  text: string;
  /** URL of the SourceRef this finding rests on. Required for FACT. */
  sourceUrl: string | null;
}

export interface ConnectedProviders {
  demographics: boolean;
  search: boolean;
}

export interface FindingInput {
  radiusM: number;
  places: readonly Place[];
  population: PopulationFigure | null;
  connected: ConnectedProviders;
  /** Label of the places provider, used in "returned nothing" statements. */
  providerLabel: string;
}

export const SIGNAL_LABELS: Record<SignalTypeKey, { singular: string; plural: string; group: string }> = {
  PUBLIC_TRANSPORT: { singular: "public transport stop", plural: "public transport stops", group: "Public transport" },
  PARKING: { singular: "parking facility", plural: "parking facilities", group: "Parking" },
  SCHOOL: { singular: "school", plural: "schools", group: "Schools" },
  UNIVERSITY: { singular: "university or college site", plural: "university or college sites", group: "Universities" },
  OFFICE: { singular: "office-related place", plural: "office-related places", group: "Offices" },
  RESIDENTIAL: { singular: "residential area", plural: "residential areas", group: "Residential areas" },
  SHOPPING_CENTER: { singular: "shopping center", plural: "shopping centers", group: "Shopping centers" },
  POINT_OF_INTEREST: { singular: "point of interest", plural: "points of interest", group: "Points of interest" },
  POPULATION: { singular: "population figure", plural: "population figures", group: "Population" },
  DEVELOPMENT: { singular: "local development notice", plural: "local development notices", group: "Local development projects" },
  ROAD_ACCESS: { singular: "road access point", plural: "road access points", group: "Road access" },
};

const COUNTED_SIGNALS: SignalTypeKey[] = ["PUBLIC_TRANSPORT", "PARKING", "SCHOOL", "UNIVERSITY", "OFFICE", "RESIDENTIAL", "SHOPPING_CENTER", "POINT_OF_INTEREST", "ROAD_ACCESS"];

/** PARTIAL when any provider category is unconnected, COMPLETED when all are. */
export function researchStatus(connected: ConnectedProviders): "COMPLETED" | "PARTIAL" {
  return connected.demographics && connected.search ? "COMPLETED" : "PARTIAL";
}

const byDistance = (a: Place, b: Place) => a.distanceM - b.distanceM;
const n = (count: number, singular: string, plural: string) => `${fmtNumber(count)} ${count === 1 ? singular : plural}`;
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function buildFindings(input: FindingInput): FindingDraft[] {
  const { radiusM, connected, providerLabel } = input;
  const within = `within ${fmtDistance(radiusM)}`;
  const places = input.places.filter((p) => p.distanceM <= radiusM);
  const competitors = places.filter((p) => p.kind === "competitor").sort(byDistance);
  const signals = places.filter((p) => p.kind === "signal").sort(byDistance);
  const ofType = (t: SignalTypeKey) => signals.filter((s) => s.category === t);

  const facts: FindingDraft[] = [];
  const opportunities: FindingDraft[] = [];
  const risks: FindingDraft[] = [];
  const unknowns: FindingDraft[] = [];
  const fact = (text: string, sourceUrl: string) => facts.push({ kind: "FACT", text, sourceUrl });

  // ── Competitors ────────────────────────────────────────────────────────────
  const nearest = competitors[0];
  if (nearest) {
    fact(
      `${n(competitors.length, "competing grocery outlet", "competing grocery outlets")} ${within}; the nearest is ${nearest.name} (${nearest.category}) at ${fmtDistance(nearest.distanceM)}.`,
      nearest.source.url,
    );
    const categories = [...new Set(competitors.map((c) => c.category))];
    if (categories.length > 1) {
      for (const cat of categories) {
        const inCat = competitors.filter((c) => c.category === cat);
        fact(`${fmtNumber(inCat.length)} of them ${inCat.length === 1 ? "is" : "are"} listed as ${cat}; the nearest is ${inCat[0]!.name} at ${fmtDistance(inCat[0]!.distanceM)}.`, inCat[0]!.source.url);
      }
    }
  } else if (places[0]) {
    fact(`${providerLabel} returned no competing grocery outlets ${within}.`, places[0].source.url);
  }

  // ── Signals ────────────────────────────────────────────────────────────────
  for (const type of COUNTED_SIGNALS) {
    const list = ofType(type);
    const first = list[0];
    if (!first) continue;
    const l = SIGNAL_LABELS[type];
    fact(`${n(list.length, l.singular, l.plural)} ${within}; the nearest is ${first.name} at ${fmtDistance(first.distanceM)}.`, first.source.url);
  }
  for (const d of ofType("DEVELOPMENT")) {
    fact(sentence(`Local development notice: ${d.name}${d.detail ? ` — ${d.detail}` : ""}`), d.source.url);
  }
  if (input.population) {
    const p = input.population;
    fact(`Resident population of ${p.areaLabel}: ${fmtNumber(p.population)} (reference year ${p.referenceYear}).`, p.source.url);
  }

  // ── Possibilities (never outcomes) ─────────────────────────────────────────
  const offices = ofType("OFFICE");
  if (offices[0]) {
    opportunities.push({
      kind: "OPPORTUNITY",
      text: `${n(offices.length, "office-related place", "office-related places")} ${within} may indicate weekday daytime demand. Whether these workers shop at this store is not known.`,
      sourceUrl: offices[0].source.url,
    });
  }
  const transit = ofType("PUBLIC_TRANSPORT")[0];
  if (transit && transit.distanceM <= 300) {
    opportunities.push({
      kind: "OPPORTUNITY",
      text: `A public transport stop ${fmtDistance(transit.distanceM)} away could bring pass-by footfall. Passenger counts are not available.`,
      sourceUrl: transit.source.url,
    });
  }
  const education = [...ofType("SCHOOL"), ...ofType("UNIVERSITY")].sort(byDistance);
  if (education[0]) {
    opportunities.push({
      kind: "OPPORTUNITY",
      text: `${n(education.length, "school or university site", "school or university sites")} ${within} could mean demand at specific times of day. Whether pupils or students shop at this store has not been measured.`,
      sourceUrl: education[0].source.url,
    });
  }
  const housing = [...ofType("RESIDENTIAL"), ...ofType("DEVELOPMENT")].sort(byDistance);
  if (housing[0]) {
    opportunities.push({
      kind: "OPPORTUNITY",
      text: `Residential areas or development notices ${within} may point to a resident catchment. Resident numbers are not known from this source.`,
      sourceUrl: housing[0].source.url,
    });
  }
  const road = ofType("ROAD_ACCESS")[0];
  if (road) {
    opportunities.push({
      kind: "OPPORTUNITY",
      text: "Direct road access may support car-borne shopping trips. No traffic counts are available.",
      sourceUrl: road.source.url,
    });
  }

  if (nearest && nearest.distanceM <= 500) {
    risks.push({
      kind: "RISK",
      text: `A competing outlet (${nearest.name}, ${nearest.category}) is located ${fmtDistance(nearest.distanceM)} away. Its effect on this store has not been measured.`,
      sourceUrl: nearest.source.url,
    });
  }
  if (nearest && competitors.length >= 3) {
    risks.push({
      kind: "RISK",
      text: `${fmtNumber(competitors.length)} competing outlets ${within} may indicate a contested catchment. Competitor revenue and footfall are not known.`,
      sourceUrl: nearest.source.url,
    });
  }
  const discount = competitors.find((c) => /discount/i.test(c.category));
  if (discount) {
    risks.push({
      kind: "RISK",
      text: `A discount competitor (${discount.name}) at ${fmtDistance(discount.distanceM)} could put pressure on price-sensitive purchases. This has not been measured.`,
      sourceUrl: discount.source.url,
    });
  }
  if (!nearest && places[0]) {
    risks.push({
      kind: "RISK",
      text: `No competitors were returned ${within}. This may reflect incomplete provider coverage rather than an absence of competition.`,
      sourceUrl: places[0].source.url,
    });
  }

  // ── Unknowns ───────────────────────────────────────────────────────────────
  const unknown = (text: string) => unknowns.push({ kind: "UNKNOWN", text, sourceUrl: null });
  if (places.length === 0) {
    unknown(`${providerLabel} returned no places ${within}. This may mean none exist, or that the provider has no coverage for this location.`);
  }
  if (!input.population) {
    unknown(
      connected.demographics
        ? "Resident population within the radius — No reliable source found."
        : "Resident population within the radius — No reliable source found. No demographics provider is connected.",
    );
  }
  unknown("Daytime working population — No reliable source found.");
  unknown("Competitor revenue or footfall — not publicly available.");
  unknown(
    connected.search
      ? "Local news and announcements beyond the places dataset — not checked. Location research sends only coordinates and a radius, never a text query."
      : "Local news and announcements beyond the places dataset — not checked. No web search provider is connected.",
  );

  return enforceSourcedFacts([...facts, ...opportunities, ...risks, ...unknowns]);
}

/** The rule the service layer relies on: a FACT without a source is never stored. */
export function enforceSourcedFacts<T extends { kind: FindingKind; sourceUrl?: string | null; sourceId?: string | null }>(findings: readonly T[]): T[] {
  return findings.filter((f) => f.kind !== "FACT" || !!f.sourceUrl || !!f.sourceId);
}

export const RESEARCH_RADII = [500, 1000, 3000, 5000] as const;

export function parseRadius(v: string | number | null | undefined, fallback = 1000): number {
  const r = Number(v);
  return (RESEARCH_RADII as readonly number[]).includes(r) ? r : fallback;
}

/** Stages the research service runs through, in order. Shown while a run is pending. */
export const RESEARCH_STEPS = [
  { label: "Analyzing store data", detail: "Reads the store's coordinates. Financial data is not used and never leaves the server." },
  { label: "Searching location signals", detail: "Asks the places provider for competitors and points of interest within the radius." },
  { label: "Checking sources", detail: "Stores each source once per organization and links every fact to it." },
  { label: "Comparing stores", detail: "Counts stored places for the organization's other stores at the same radius." },
  { label: "Preparing findings", detail: "Sorts statements into facts, possibilities and unknowns." },
] as const;
