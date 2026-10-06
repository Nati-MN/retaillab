import Link from "next/link";
import { ResearchFindings } from "@/components/research/ResearchFindings";
import { Chip, EmptyState, Kpi, KpiGrid, Missing, Notice, Panel, SourcesButton, Tag, Cite } from "@/components/ui";
import type { StoreDTO } from "@/lib/analytics/types";
import { fmtDate, fmtDistance, fmtNumber } from "@/lib/format";
import { getPlacesProvider } from "@/lib/providers/registry";
import { SIGNAL_LABELS } from "@/lib/research/findings";
import type { SourceDTO } from "@/server/queries";
import { countFindings, getCompetitors, getResearchResults, getSignals, type SignalType } from "@/server/research/queries";
import { requireOrg } from "@/server/session";
import { LocationSignals, RadiusSelector, RunResearchLink, type LocationRow } from "./LocationSignals";

/** Props shared by all store-detail sections owned by other feature areas. */
export interface StoreSectionProps {
  orgId: string;
  store: StoreDTO;
  currency: string;
}

const COMPETITOR_GROUPS: { label: string; match: RegExp }[] = [
  { label: "Nearby supermarkets", match: /supermarket/i },
  { label: "Nearby discount stores", match: /discount/i },
  { label: "Nearby convenience stores", match: /convenience/i },
];
const OTHER_COMPETITORS = "Other grocery outlets";
const SIGNAL_ORDER: SignalType[] = [
  "PUBLIC_TRANSPORT", "PARKING", "SCHOOL", "UNIVERSITY", "OFFICE", "RESIDENTIAL", "SHOPPING_CENTER",
  "POPULATION", "DEVELOPMENT", "ROAD_ACCESS", "POINT_OF_INTEREST",
];

function uniqueSources(list: SourceDTO[]): SourceDTO[] {
  const out: SourceDTO[] = [];
  for (const s of list) if (!out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

/** Location Intelligence: stored signals around the store, grouped by type, filtered by ?radius=. */
export async function StoreLocationSection({ orgId, store }: StoreSectionProps) {
  const [competitors, signals] = await Promise.all([getCompetitors(orgId, store.id), getSignals(orgId, store.id)]);
  const competitorGroup = (category: string) => COMPETITOR_GROUPS.find((g) => g.match.test(category))?.label ?? OTHER_COMPETITORS;
  const rows: LocationRow[] = [
    ...competitors.map((c): LocationRow => ({
      id: `c-${c.id}`, group: competitorGroup(c.category), name: c.name, detail: c.openingHours ? `${c.category} · ${c.openingHours}` : c.category,
      distanceM: c.distanceM, researchedAt: c.lastCheckedAt, isDemo: c.isDemo, source: c.source,
    })),
    ...signals.map((s): LocationRow => ({
      id: `s-${s.id}`, group: SIGNAL_LABELS[s.type].group, name: s.name, detail: s.detail,
      distanceM: s.distanceM, researchedAt: s.source.accessedAt, isDemo: s.isDemo, source: s.source,
    })),
  ];
  const hasOther = rows.some((r) => r.group === OTHER_COMPETITORS);
  const groups = [
    ...COMPETITOR_GROUPS.map((g) => g.label),
    ...(hasOther ? [OTHER_COMPETITORS] : []),
    ...SIGNAL_ORDER.map((t) => SIGNAL_LABELS[t].group),
  ];
  const sources = uniqueSources(rows.map((r) => r.source));
  const anyDemo = rows.some((r) => r.isDemo);
  const hasCoordinates = store.latitude !== null && store.longitude !== null;

  return (
    <div className="flex flex-col gap-3">
      {!hasCoordinates && (
        <Notice tone="unavailable" title="Coordinates missing">
          Location research needs the store&apos;s latitude and longitude. <Link className="link" href={`/stores/${store.id}/edit`}>Add coordinates</Link>.
        </Notice>
      )}
      {anyDemo && (
        <Notice tone="demo" title="Fictional surroundings">The places listed for this demo store are invented. Their sources are labelled as demo sources and do not exist.</Notice>
      )}
      <Panel
        title="Location intelligence"
        subtitle="Stored research rows only — nothing is estimated"
        kind="FACT"
        flush
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="label">Radius</span>
            <RadiusSelector />
          </div>
          <div className="flex items-center gap-2">
            <SourcesButton sources={sources} />
            <RunResearchLink storeId={store.id} className="btn-primary btn-sm">Run research</RunResearchLink>
          </div>
        </div>
        <LocationSignals groups={groups} rows={rows} sources={sources} />
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          “No reliable source found.” means no stored research row of that type lies within the radius — not that nothing exists there.
          Proximity alone does not show any effect on this store&apos;s revenue.
        </p>
      </Panel>
    </div>
  );
}

/** Competitor table sorted by distance. */
export async function StoreCompetitionSection({ orgId, store }: StoreSectionProps) {
  const ctx = await requireOrg();
  const [competitors, results] = await Promise.all([getCompetitors(orgId, store.id), getResearchResults(orgId, { storeId: store.id, take: 1 })]);
  const sources = uniqueSources(competitors.map((c) => c.source));
  const provider = getPlacesProvider(ctx.org);
  const noRatings = competitors.length > 0 && competitors.every((c) => c.rating === null && c.reviewCount === null);
  const researched = results.length > 0;

  return (
    <Panel
      title={<>Competitors <span className="num ml-1 font-normal text-ink-3">{competitors.length}</span></>}
      subtitle="From stored research, sorted by distance"
      kind="FACT"
      flush
      actions={<Link href={`/research?store=${store.id}`} className="btn-secondary btn-sm">{researched || competitors.length > 0 ? "Re-run research" : "Run research"}</Link>}
    >
      {competitors.length === 0 ? (
        <div className="p-3">
          {researched ? (
            <EmptyState title="No competitors found">
              The last research run ({fmtDate(results[0]!.completedAt)}, {fmtDistance(results[0]!.radiusM)} radius) returned no competing grocery outlets. That may reflect provider coverage rather than an absence of competition.
            </EmptyState>
          ) : (
            <EmptyState title="No research run yet" action={<Link href={`/research?store=${store.id}`} className="btn-primary btn-sm">Run research</Link>}>
              {provider ? "Competitors appear here after location research has been run for this store." : "No places provider is connected, so competitors cannot be looked up. Nothing is assumed in the meantime."}
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="scroll-thin overflow-x-auto">
            <table className="tbl min-w-[820px]">
              <thead>
                <tr>
                  <th>Competitor</th><th className="text-right">Distance</th><th>Category</th><th>Opening hours</th>
                  <th className="text-right">Rating</th><th className="text-right">Review count</th><th className="text-right">Source</th><th className="text-right">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}{c.isDemo && <Tag kind="DEMO" className="ml-2">Fictional</Tag>}</td>
                    <td className="r">{fmtDistance(c.distanceM)}</td>
                    <td>{c.category}</td>
                    <td className="num">{c.openingHours ?? <Missing reason="Not provided by the source" />}</td>
                    <td className="r">{c.rating === null ? <Missing reason="Not provided by the source" /> : fmtNumber(c.rating, 1)}</td>
                    <td className="r">{c.reviewCount === null ? <Missing reason="Not provided by the source" /> : fmtNumber(c.reviewCount)}</td>
                    <td className="text-right"><Cite source={c.source} all={sources} /></td>
                    <td className="r text-ink-2">{fmtDate(c.lastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
            — means the source does not provide the value. OpenStreetMap has no ratings or review counts, so those columns stay empty for OpenStreetMap rows.
            {noRatings && " None of the rows on file carry a rating."} Competitor revenue and footfall are not publicly available and are not estimated.
          </p>
          <div className="border-t border-line px-3 py-2"><SourcesButton sources={sources} /></div>
        </>
      )}
    </Panel>
  );
}

/** Latest research result for the store. */
export async function StoreResearchSection({ orgId, store }: StoreSectionProps) {
  const results = await getResearchResults(orgId, { storeId: store.id, take: 5 });
  const latest = results[0];
  if (!latest) {
    return (
      <EmptyState title="No research run yet" action={<Link href={`/research?store=${store.id}`} className="btn-primary btn-sm">Open research</Link>}>
        Research looks up the surroundings of {store.name} through connected providers and stores every fact with its source.
      </EmptyState>
    );
  }
  const c = countFindings(latest.findings);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold">Latest research · {fmtDistance(latest.radiusM)} radius · <span className="num font-normal text-ink-2">{fmtDate(latest.completedAt)}</span></h3>
          <Chip tone={latest.status === "COMPLETED" ? "pos" : "warn"}>{latest.status === "COMPLETED" ? "Completed" : "Partial"}</Chip>
          {latest.isDemo && <Tag kind="DEMO" />}
        </div>
        <div className="flex items-center gap-2">
          <SourcesButton sources={latest.sources} />
          <Link href={`/research?store=${store.id}`} className="btn-primary btn-sm">Open research</Link>
        </div>
      </div>
      {latest.isDemo && <Notice tone="demo">Produced by the demo provider: the places and sources are fictional.</Notice>}
      <KpiGrid cols={4}>
        <Kpi label="Verified facts" value={fmtNumber(c.FACT)} formula="Statements with a cited source" />
        <Kpi label="Potential opportunities" value={fmtNumber(c.OPPORTUNITY)} formula="Possibilities, not predictions" />
        <Kpi label="Potential risks" value={fmtNumber(c.RISK)} formula="Possibilities, not measured effects" />
        <Kpi label="Unknowns" value={fmtNumber(c.UNKNOWN)} formula="No reliable source found" />
      </KpiGrid>
      <ResearchFindings result={latest} compact />
      {results.length > 1 && (
        <p className="text-xs text-ink-3">
          <span className="num">{results.length - 1}</span> earlier result{results.length === 2 ? "" : "s"} for this store — see <Link className="link" href={`/research?store=${store.id}`}>research history</Link>.
        </p>
      )}
    </div>
  );
}
