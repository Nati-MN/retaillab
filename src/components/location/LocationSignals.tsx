"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Cite, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDistance } from "@/lib/format";
import { parseRadius, RESEARCH_RADII } from "@/lib/research/findings";
import type { SourceDTO } from "@/server/queries";

export interface LocationRow {
  id: string;
  group: string;
  name: string;
  detail: string | null;
  distanceM: number | null;
  /** ISO date the row was last researched. */
  researchedAt: string;
  isDemo: boolean;
  source: SourceDTO;
}

/** Reads ?radius= (500 | 1000 | 3000 | 5000; default 1 km). */
export function useRadius(): number {
  return parseRadius(useSearchParams().get("radius"));
}

export function RadiusSelector() {
  const pathname = usePathname();
  const params = useSearchParams();
  const radius = parseRadius(params.get("radius"));
  return (
    <nav aria-label="Radius" className="inline-flex overflow-hidden rounded border border-line-strong bg-surface">
      {RESEARCH_RADII.map((r) => {
        const p = new URLSearchParams(params.toString());
        p.set("radius", String(r));
        return (
          <Link
            key={r} href={`${pathname}?${p.toString()}`} scroll={false} replace
            aria-current={r === radius ? "true" : undefined}
            className={cn("num flex h-7 items-center border-r border-line px-2.5 text-xs last:border-r-0", r === radius ? "bg-ink font-medium text-surface" : "text-ink-2 hover:bg-surface-2")}
          >
            {fmtDistance(r)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Link that carries the currently selected radius to the research page. */
export function RunResearchLink({ storeId, className, children }: { storeId: string; className?: string; children: React.ReactNode }) {
  const radius = useRadius();
  return <Link href={`/research?store=${storeId}&radius=${radius}`} className={className}>{children}</Link>;
}

/** Location signals grouped by type and filtered to the selected radius. Groups with nothing on file say so. */
export function LocationSignals({ groups, rows, sources }: { groups: string[]; rows: LocationRow[]; sources: SourceDTO[] }) {
  const radius = useRadius();
  // Rows without a distance (e.g. an area-wide population figure) are not tied to a radius and always shown.
  const visible = rows.filter((r) => r.distanceM === null || r.distanceM <= radius);
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="tbl min-w-[640px]">
        <thead>
          <tr><th className="w-48">Signal</th><th>Within {fmtDistance(radius)}</th><th className="text-right">Distance</th><th className="text-right">Source</th><th className="text-right">Researched</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const list = visible.filter((r) => r.group === g);
            if (list.length === 0) {
              return (
                <tr key={g}>
                  <th scope="row" className="!font-sans !text-[13px] !font-medium !normal-case !tracking-normal !text-ink">{g}</th>
                  <td colSpan={4} className="text-ink-3">No reliable source found.</td>
                </tr>
              );
            }
            return list.map((r, i) => (
              <tr key={r.id}>
                {i === 0 && (
                  <th scope="rowgroup" rowSpan={list.length} className="!font-sans !text-[13px] !font-medium !normal-case !tracking-normal !text-ink">
                    {g} <span className="num ml-1 font-normal text-ink-3">{list.length}</span>
                  </th>
                )}
                <td>
                  {r.name}
                  {r.isDemo && <Tag kind="DEMO" className="ml-2">Fictional</Tag>}
                  {r.detail && <div className="text-xs text-ink-3">{r.detail}</div>}
                </td>
                <td className="r">{r.distanceM === null ? "—" : fmtDistance(r.distanceM)}</td>
                <td className="text-right"><Cite source={r.source} all={sources} /></td>
                <td className="r text-ink-2">{fmtDate(r.researchedAt)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
