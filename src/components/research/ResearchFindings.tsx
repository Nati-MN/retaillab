import { Cite, Panel, type EpistemicKind } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { FindingDTO, ResearchResultDTO } from "@/server/research/queries";

const SECTIONS: { kind: FindingDTO["kind"]; title: string; subtitle: string; tag: EpistemicKind; empty: string }[] = [
  { kind: "FACT", title: "Facts", subtitle: "Counts and distances read from the provider result — each with its source", tag: "FACT", empty: "No sourced facts in this result." },
  { kind: "OPPORTUNITY", title: "Potential opportunities", subtitle: "Possibilities, not predictions", tag: "HYPOTHESIS", empty: "No potential opportunities derived from this result." },
  { kind: "RISK", title: "Potential risks", subtitle: "Possibilities, not measured effects", tag: "HYPOTHESIS", empty: "No potential risks derived from this result." },
  { kind: "UNKNOWN", title: "Unknowns", subtitle: "What could not be established", tag: "UNKNOWN", empty: "Nothing listed as unknown." },
];

function FindingList({ findings, all, empty }: { findings: FindingDTO[]; all: ResearchResultDTO["sources"]; empty: string }) {
  if (findings.length === 0) return <p className="p-3 text-xs text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {findings.map((f) => (
        <li key={f.id} className="px-3 py-2">
          {f.text}
          {f.source && <Cite source={f.source} all={all} />}
        </li>
      ))}
    </ul>
  );
}

/** Facts, potential opportunities, potential risks, unknowns and sources of one research result. */
export function ResearchFindings({ result, compact }: { result: ResearchResultDTO; compact?: boolean }) {
  const of = (k: FindingDTO["kind"]) => result.findings.filter((f) => f.kind === k);
  const [facts, opp, risk, unknown] = SECTIONS;
  const panel = (s: (typeof SECTIONS)[number]) => (
    <Panel key={s.kind} title={<>{s.title} <span className="num ml-1 font-normal text-ink-3">{of(s.kind).length}</span></>} subtitle={compact ? undefined : s.subtitle} kind={s.tag} flush>
      <FindingList findings={of(s.kind)} all={result.sources} empty={s.empty} />
    </Panel>
  );
  return (
    <div className="flex flex-col gap-4">
      {panel(facts!)}
      <div className="grid gap-4 lg:grid-cols-2">
        {panel(opp!)}
        {panel(risk!)}
      </div>
      {panel(unknown!)}
      {!compact && (
        <Panel title={<>Sources <span className="num ml-1 font-normal text-ink-3">{result.sources.length}</span></>} subtitle="Cited by the findings above" flush>
          {result.sources.length === 0 ? (
            <p className="p-3 text-xs text-ink-3">No sources recorded for this result.</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="tbl min-w-[560px]">
                <thead><tr><th className="w-8">#</th><th>Source</th><th>Publisher</th><th>Reliability</th><th className="text-right">Accessed</th></tr></thead>
                <tbody>
                  {result.sources.map((s) => (
                    <tr key={s.id}>
                      <td><Cite source={s} all={result.sources} /></td>
                      <td>
                        {s.title}
                        <div className="break-all font-mono text-[10px] text-ink-3">{s.url}{s.isDemo ? " (fictional — not a real address)" : ""}</div>
                      </td>
                      <td className="text-ink-2">{s.publisher}</td>
                      <td className="whitespace-nowrap font-mono text-[10px] uppercase text-ink-2">{s.reliability === "DEMO" ? "Demo · fictional" : s.reliability.toLowerCase()}</td>
                      <td className="r whitespace-nowrap">{fmtDate(s.accessedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
