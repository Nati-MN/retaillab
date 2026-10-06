import Link from "next/link";
import { ResearchForm } from "@/components/research/ResearchForm";
import { ResearchFindings } from "@/components/research/ResearchFindings";
import { Chip, EmptyState, Kpi, KpiGrid, Notice, PageHeader, Panel, SourcesButton, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDistance, fmtNumber } from "@/lib/format";
import { monthKey, monthLabelLong } from "@/lib/period";
import { getIntegrationStatus, getPlacesProvider } from "@/lib/providers/registry";
import { AUSTRIAN_SOURCE_CATALOG } from "@/lib/providers/types";
import { parseRadius } from "@/lib/research/findings";
import { first, type SearchParams } from "@/server/period";
import { getStores } from "@/server/queries";
import { countFindings, getCompetitors, getResearchResult, getResearchResults, getSignals, type ResearchResultDTO } from "@/server/research/queries";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Research" };

const RESEARCH_CAPABILITIES = ["Places & competitors", "Demographics", "Web search"];

function StatusChip({ status }: { status: ResearchResultDTO["status"] }) {
  if (status === "COMPLETED") return <Chip tone="pos">Completed</Chip>;
  if (status === "PARTIAL") return <Chip tone="warn">Partial</Chip>;
  return <Chip>Unavailable</Chip>;
}

export default async function ResearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const stores = await getStores(ctx.orgId);

  const header = (
    <PageHeader
      title="Research"
      eyebrow={ctx.org.isDemo ? <Tag kind="DEMO" /> : undefined}
      subtitle="Looks up the surroundings of a store through connected providers. Every fact links to its source; what could not be established is listed as unknown."
    />
  );
  if (stores.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No stores yet" action={<Link href="/stores/new" className="btn-primary btn-sm">Add a store</Link>}>Research is run for a store&apos;s location.</EmptyState>
      </>
    );
  }

  const storeParam = first(sp.store);
  const store = stores.find((s) => s.id === storeParam) ?? null;
  const resultParam = first(sp.result);
  const places = getPlacesProvider(ctx.org);
  const integrations = getIntegrationStatus(ctx.org).filter((i) => RESEARCH_CAPABILITIES.includes(i.capability));
  const unconnected = integrations.filter((i) => !i.connected);

  const [history, requested] = await Promise.all([
    getResearchResults(ctx.orgId, { take: 30 }),
    resultParam ? getResearchResult(ctx.orgId, resultParam) : Promise.resolve(null),
  ]);
  const result = requested ?? (store ? history.find((r) => r.storeId === store.id) : history[0]) ?? null;
  const counts = result ? countFindings(result.findings) : null;
  const formStore = store ?? stores.find((s) => s.id === result?.storeId) ?? stores[0]!;

  // "Comparing stores": stored rows for every store at the result's radius.
  const [competitors, signals] = result ? await Promise.all([getCompetitors(ctx.orgId), getSignals(ctx.orgId)]) : [[], []];
  const peerRows = result
    ? stores.map((s) => {
        const comps = competitors.filter((c) => c.storeId === s.id && c.distanceM <= result.radiusM);
        const sigs = signals.filter((x) => x.storeId === s.id && x.distanceM !== null && x.distanceM <= result.radiusM);
        const any = competitors.some((c) => c.storeId === s.id) || signals.some((x) => x.storeId === s.id);
        return {
          store: s, any,
          competitors: comps.length,
          nearest: comps[0]?.distanceM ?? null,
          transport: sigs.filter((x) => x.type === "PUBLIC_TRANSPORT").length,
          offices: sigs.filter((x) => x.type === "OFFICE").length,
          education: sigs.filter((x) => x.type === "SCHOOL" || x.type === "UNIVERSITY").length,
        };
      })
    : [];

  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="New research">
            <ResearchForm
              key={formStore.id}
              stores={stores.map((s) => ({ id: s.id, name: s.name, hasCoordinates: s.latitude !== null && s.longitude !== null }))}
              defaultStoreId={formStore.id}
              defaultRadius={parseRadius(first(sp.radius), result?.storeId === formStore.id ? result.radiusM : 1000)}
              placesConnected={!!places}
              providerLabel={places?.info.label ?? null}
              providerIsDemo={places?.info.isDemo ?? false}
              unconnected={unconnected.map((u) => ({ capability: u.capability, howToConnect: u.howToConnect }))}
              canWrite={canWrite(ctx.role)}
            />
          </Panel>

          {resultParam && !requested && (
            <Notice tone="warn" title="Result not found">The requested research result does not exist in this organization. Showing the most recent one instead.</Notice>
          )}

          {!result || !counts ? (
            <EmptyState title={store ? `No research run yet for ${store.name}` : "No research run yet"}>
              {places ? "Run research above to store competitors, location signals and their sources." : "Connect a places provider to run research. Nothing is shown here until a provider has returned sourced data."}
            </EmptyState>
          ) : (
            <section aria-labelledby="result-h" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="result-h" className="text-[15px] font-semibold">{result.storeName ?? "Organization"} · {fmtDistance(result.radiusM)} radius</h2>
                    <StatusChip status={result.status} />
                    {result.isDemo && <Tag kind="DEMO" />}
                  </div>
                  <p className="text-xs text-ink-2">“{result.query}” · provider <span className="font-mono">{result.provider}</span> · <span className="num">{fmtDate(result.completedAt)}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <SourcesButton sources={result.sources} label="All sources" />
                  {result.storeId && <Link href={`/stores/${result.storeId}`} className="btn-secondary btn-sm">Open store</Link>}
                </div>
              </div>

              {result.isDemo && (
                <Notice tone="demo" title="Fictional places">
                  This result comes from the demo provider. The competitors, stops, offices and notices below are fictional places invented for the demo; the cited sources and their URLs do not exist.
                </Notice>
              )}
              {result.status === "PARTIAL" && (
                <Notice tone="warn" title="Partial result">
                  Only the places provider contributed. Not connected: {unconnected.map((u) => u.capability).join(", ") || "none at present"}. What those would have covered is listed under Unknowns.
                </Notice>
              )}

              <KpiGrid cols={4}>
                <Kpi label="Research completed" value={monthLabelLong(monthKey(new Date(result.completedAt)))} formula={`Run on ${fmtDate(result.completedAt)}`} />
                <Kpi label="Sources checked" value={fmtNumber(result.sourcesChecked)} formula="Distinct provider sources" />
                <Kpi label="Verified facts" value={fmtNumber(counts.FACT)} formula="Statements with a cited source" />
                <Kpi label="Uncertain signals" value={fmtNumber(counts.OPPORTUNITY + counts.RISK + counts.UNKNOWN)} formula={`${counts.OPPORTUNITY} opp. + ${counts.RISK} risk + ${counts.UNKNOWN} unknown`} />
              </KpiGrid>

              <ResearchFindings result={result} />

              <Panel title="Compared with other stores" subtitle={`Stored places within ${fmtDistance(result.radiusM)} of each store`} kind="CALCULATED" flush>
                <div className="scroll-thin overflow-x-auto">
                  <table className="tbl min-w-[560px]">
                    <thead>
                      <tr><th>Store</th><th className="text-right">Competitors</th><th className="text-right">Nearest competitor</th><th className="text-right">Transport stops</th><th className="text-right">Offices</th><th className="text-right">Schools / universities</th></tr>
                    </thead>
                    <tbody>
                      {peerRows.map((r) => (
                        <tr key={r.store.id} className={cn(r.store.id === result.storeId && "font-semibold")}>
                          <td><Link className="hover:underline" href={`/research?store=${r.store.id}`}>{r.store.name}</Link></td>
                          {r.any ? (
                            <>
                              <td className="r">{r.competitors}</td>
                              <td className="r">{r.nearest === null ? "—" : fmtDistance(r.nearest)}</td>
                              <td className="r">{r.transport}</td>
                              <td className="r">{r.offices}</td>
                              <td className="r">{r.education}</td>
                            </>
                          ) : (
                            <td colSpan={5} className="text-right text-ink-3">No research run yet</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
                  Counts of stored rows, not of what exists on the ground: a store never researched at this radius will be undercounted. A count says nothing about how these places affect a store.
                </p>
              </Panel>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="History" subtitle={`${history.length} stored result${history.length === 1 ? "" : "s"}`} flush>
            {history.length === 0 ? (
              <p className="p-3 text-xs text-ink-3">No research has been run yet.</p>
            ) : (
              <ul className="scroll-thin max-h-[360px] divide-y divide-line overflow-y-auto">
                {history.map((h) => {
                  const c = countFindings(h.findings);
                  const active = h.id === result?.id;
                  return (
                    <li key={h.id}>
                      <Link
                        href={`/research?${h.storeId ? `store=${h.storeId}&` : ""}result=${h.id}`}
                        aria-current={active ? "true" : undefined}
                        className={cn("block px-3 py-2 hover:bg-surface-2", active && "bg-surface-2")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("truncate", active && "font-semibold")}>{h.storeName ?? "Organization"}</span>
                          <StatusChip status={h.status} />
                        </div>
                        <div className="num text-xs text-ink-3">
                          {fmtDate(h.completedAt)} · {fmtDistance(h.radiusM)} · {c.FACT} facts · {h.sourcesChecked} source{h.sourcesChecked === 1 ? "" : "s"}{h.isDemo ? " · demo" : ""}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Providers" subtitle="What research can draw on" flush>
            <ul className="divide-y divide-line">
              {integrations.map((i) => (
                <li key={i.capability} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{i.capability}</span>
                    {i.connected ? <Chip tone={i.provider?.isDemo ? "accent" : "pos"}>{i.provider?.isDemo ? "Demo provider" : "Connected"}</Chip> : <Chip>Not connected</Chip>}
                  </div>
                  <p className="text-xs text-ink-3">{i.connected ? i.provider?.note ?? i.provider?.label : i.howToConnect}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Austrian public sources" subtitle="Designed to integrate — not connected in this build" flush>
            <ul className="divide-y divide-line">
              {AUSTRIAN_SOURCE_CATALOG.map((s) => (
                <li key={s.id} className="px-3 py-2">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="link font-medium">{s.name}</a>
                  <div className="text-xs text-ink-2">{s.kind}</div>
                  <div className="font-mono text-[10px] text-ink-3">{s.provider} · not connected</div>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-3 py-2 text-xs text-ink-3">No data from these sources is used anywhere in RetailLab until a provider is implemented and connected.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
