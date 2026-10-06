import { Fragment } from "react";
import { Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMoneyCompact } from "@/lib/format";
import { lineGeometry } from "@/lib/reports/chart";
import type { ReportBlock, ReportCell, ReportItemLine, ReportModel } from "@/lib/reports/model";

/**
 * Print rules live here (not in globals.css): A4 page, light tokens even when
 * the app is in dark theme, no clipped scroll containers, and no table row or
 * list item split across pages.
 */
const PRINT_CSS = `
@page { size: A4; margin: 16mm 15mm 18mm; }
@media print {
  html:root, html[data-theme="dark"] {
    color-scheme: light;
    --canvas: 255 255 255; --surface: 255 255 255; --surface-2: 248 248 246;
    --line: 222 221 215; --line-strong: 190 188 180;
    --ink: 17 17 16; --ink-2: 70 69 66; --ink-3: 105 104 98;
    --accent: 180 83 9; --pos: 8 122 60; --neg: 190 50 42; --warn: 161 98 7; --info: 31 95 173;
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --s8: #e34948;
    --grid: #e3e2dc;
  }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #main { padding: 0 !important; overflow: visible !important; height: auto !important; }
  #main > div { max-width: none !important; }
  nextjs-portal { display: none !important; }
  .report-doc { border: 0 !important; padding: 0 !important; margin: 0 !important; max-width: none !important; background: #fff !important; }
  .report-doc h2, .report-doc h3 { break-after: avoid; }
  .report-doc tr, .report-doc .report-item, .report-doc figure, .report-doc .report-keep { break-inside: avoid; }
  .report-doc thead { display: table-header-group; }
  .report-doc .tbl tbody tr:hover td { background: transparent; }
  .report-doc a { text-decoration: none; }
}`;

function Cites({ cites }: { cites?: number[] }) {
  if (!cites || cites.length === 0) return null;
  return (
    <span className="num whitespace-nowrap font-mono text-[10px] text-ink-2">
      {cites.map((n) => (
        <a key={n} href={`#report-source-${n}`} className="ml-0.5 hover:underline" aria-label={`Source ${n}`}>[{n}]</a>
      ))}
    </span>
  );
}

function Cell({ cell, first }: { cell: ReportCell; first: boolean }) {
  if (typeof cell === "string") return <>{cell}</>;
  return (
    <>
      {cell.text && <span className={cn((cell.strong || (first && cell.sub)) && "font-semibold")}>{cell.text}</span>}
      <Cites cites={cell.cites} />
      {cell.sub && <div className="text-[11px] font-normal leading-4 text-ink-3">{cell.sub}</div>}
    </>
  );
}

function Line({ line }: { line: ReportItemLine }) {
  return (
    <div className="flex gap-2">
      {line.caption && <div className="w-[130px] shrink-0 text-ink-3">{line.caption}</div>}
      <div className="min-w-0 flex-1">
        {line.label && <Tag kind={line.label} className="mr-1.5 align-[1px]" />}
        {line.text}
        <Cites cites={line.cites} />
      </div>
    </div>
  );
}

const BOX = { width: 720, height: 230, left: 52, right: 24, top: 10, bottom: 24 };

function TrendFigure({ block, colors, currency }: { block: Extract<ReportBlock, { type: "chart" }>; colors: Record<string, string>; currency: string }) {
  const g = lineGeometry(block.series.map((s) => s.values), block.labels.length, BOX);
  const every = Math.ceil(block.labels.length / 12);
  return (
    <figure className="m-0 mt-4">
      <ul className="mb-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-2">
        {block.series.map((s) => (
          <li key={s.storeId} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-3.5" style={{ background: colors[s.storeId] ?? "var(--s1)" }} />
            {s.name}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="block h-auto w-full" role="img" aria-label={block.summary}>
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={BOX.left} x2={BOX.width - BOX.right} y1={g.y(t)} y2={g.y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={BOX.left - 6} y={g.y(t) + 3.5} textAnchor="end" fontSize={10} fill="rgb(var(--ink-3))" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtMoneyCompact(t, currency)}
            </text>
          </g>
        ))}
        {block.labels.map((l, i) => i % every === 0 && (
          <text key={l} x={g.x(i)} y={BOX.height - 8} textAnchor="middle" fontSize={10} fill="rgb(var(--ink-3))">{l}</text>
        ))}
        {block.series.map((s, si) => (
          <g key={s.storeId}>
            <path d={g.paths[si]} fill="none" stroke={colors[s.storeId] ?? "var(--s1)"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => v !== null && (
              <circle key={i} cx={g.x(i)} cy={g.y(v)} r={2.5} fill={colors[s.storeId] ?? "var(--s1)"} stroke="rgb(var(--surface))" strokeWidth={1}>
                <title>{`${s.name}, ${block.labels[i]}: ${fmtMoneyCompact(v, currency)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-[11px] text-ink-3">{block.summary} Exact period values are in the table above.</figcaption>
    </figure>
  );
}

function Block({ block, colors, currency }: { block: ReportBlock; colors: Record<string, string>; currency: string }) {
  switch (block.type) {
    case "p":
      return <p className={cn("mt-2 max-w-[68ch]", block.muted && "text-ink-2")}>{block.text}<Cites cites={block.cites} /></p>;
    case "subhead":
      return <h3 className="mt-5 text-[13px] font-semibold">{block.text}</h3>;
    case "note":
      return <p className="report-keep mt-3 border-l-2 border-line-strong pl-3 text-[12px] leading-5 text-ink-2">{block.text}</p>;
    case "chart":
      return <TrendFigure block={block} colors={colors} currency={currency} />;
    case "table":
      return (
        <div className="mt-3">
          {block.label && <div className="mb-1"><Tag kind={block.label} /></div>}
          <div className="scroll-thin overflow-x-auto print:overflow-visible">
            <table className="tbl text-[12px] leading-[18px]">
              <thead>
                <tr>
                  {block.columns.map((c) => (
                    <th key={c.label} scope="col" className={cn("!whitespace-normal !px-2 align-bottom", c.align === "right" && "text-right")}>
                      {c.label}{c.note && <sup className="ml-0.5 normal-case text-ink-2">{c.note}</sup>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={cn("!px-2", block.columns[j]?.align === "right" ? "r whitespace-nowrap" : "num", j === 0 && typeof cell === "string" && "font-medium")}>
                        <Cell cell={cell} first={j === 0} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {block.footer && (
                <tfoot>
                  <tr>
                    {block.footer.map((cell, j) => (
                      <td key={j} className={cn("border-t border-line-strong !px-2 font-semibold", block.columns[j]?.align === "right" ? "r whitespace-nowrap" : "num")}>
                        <Cell cell={cell} first={false} />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      );
    case "items":
      return (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {block.items.map((it, i) => (
            <li key={i} className="report-item py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold">{it.title}</span>
                {it.label && <Tag kind={it.label} />}
              </div>
              {it.meta && <div className="text-[11px] text-ink-3">{it.meta}</div>}
              <div className="mt-1 space-y-1 text-[12px] leading-[18px]">
                {it.lines.map((l, j) => <Line key={j} line={l} />)}
              </div>
            </li>
          ))}
        </ul>
      );
  }
}

export interface ReportMeta {
  title: string;
  orgName: string;
  isDemo: boolean;
  generatedAt: string;
  createdAt: string;
  createdBy: string;
  storesLabel: string;
  currency: string;
}

/** The export-ready report page. Pure layout of a ReportModel; no numbers are computed here. */
export function ReportDocument({ model, meta, colors }: { model: ReportModel; meta: ReportMeta; colors: Record<string, string> }) {
  const hasSourcesSection = model.sections.some((s) => s.key === "sources");
  const sourceList = model.sources.length > 0 && (
    <ol className="mt-3 space-y-2 text-[12px] leading-[18px]">
      {model.sources.map(({ n, source: s }) => (
        <li key={s.id} id={`report-source-${n}`} className="report-item flex gap-2">
          <span className="num w-7 shrink-0 font-mono text-[11px] text-ink-2">[{n}]</span>
          <div className="min-w-0">
            <div className="font-medium">
              {s.title}
              {s.isDemo && <span className="ml-2 rounded-sm border border-accent/50 px-1 font-mono text-[10px] uppercase text-accent">fictional</span>}
            </div>
            <div className="text-ink-2">{s.publisher}</div>
            <div className="break-all font-mono text-[11px] text-ink-3">
              {s.isDemo ? <>{s.url} (not a real address)</> : <a href={s.url} className="underline" rel="noopener noreferrer">{s.url}</a>}
            </div>
            <div className="num text-[11px] text-ink-3">Accessed {fmtDate(s.accessedAt)}</div>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <article className="report-doc mx-auto max-w-[860px] rounded-md border border-line bg-surface px-5 py-8 text-[13px] leading-[21px] sm:px-12 sm:py-12">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <header className="border-b-2 border-ink pb-5">
        <div className="label">{meta.orgName}</div>
        <h1 className="mt-1 text-[24px] leading-8">{meta.title}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
          <div><dt className="label">Period</dt><dd className="num font-medium">{model.periodLabel}</dd></div>
          <div><dt className="label">Stores</dt><dd className="font-medium">{meta.storesLabel}</dd></div>
          <div><dt className="label">Generated</dt><dd className="num font-medium">{fmtDate(meta.generatedAt)}</dd></div>
          <div><dt className="label">Report created</dt><dd className="font-medium"><span className="num">{fmtDate(meta.createdAt)}</span> · {meta.createdBy}</dd></div>
        </dl>
        {meta.isDemo && (
          <p className="mt-4 rounded border border-accent/50 bg-accent/5 px-3 py-2 text-[12px] leading-5">
            <strong className="font-semibold text-accent">Fictional demo data.</strong> {meta.orgName} is not a real company. All stores, figures, places and sources in this report were invented for demonstration.
          </p>
        )}
      </header>

      {model.sections.length > 1 && (
        <nav aria-label="Contents" className="report-keep mt-5 text-[12px]">
          <div className="label mb-1">Contents</div>
          <ol className="gap-x-8 sm:columns-2 print:columns-2">
            {model.sections.map((s) => (
              <li key={s.key} className="flex gap-2">
                <span className="num w-5 font-mono text-ink-3">{s.number}</span>
                <a href={`#report-${s.key}`} className="hover:underline">{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {model.sections.map((s) => (
        <section key={s.key} id={`report-${s.key}`} aria-labelledby={`report-h-${s.key}`} className="mt-9">
          <h2 id={`report-h-${s.key}`} className="flex items-baseline gap-3 border-b border-line pb-1.5 text-[17px] leading-6">
            <span className="num font-mono text-[13px] font-medium text-ink-3">{s.number}</span>
            {s.title}
          </h2>
          {s.blocks.map((b, i) => <Fragment key={i}><Block block={b} colors={colors} currency={meta.currency} /></Fragment>)}
          {s.key === "sources" && sourceList}
        </section>
      ))}

      {!hasSourcesSection && model.sources.length > 0 && (
        <section className="mt-9" aria-label="References">
          <h2 className="border-b border-line pb-1.5 text-[17px] leading-6">References</h2>
          {sourceList}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-4 text-[11px] leading-[17px] text-ink-2">
        {model.methodNotes.length > 0 && (
          <div className="mb-3">
            <div className="label mb-1">Method — how calculated figures are computed</div>
            <ol className="space-y-0.5">
              {model.methodNotes.map((m) => (
                <li key={m.letter} className="report-item flex gap-2"><span className="w-3 shrink-0 font-mono text-ink-3">{m.letter}</span><span>{m.text}</span></li>
              ))}
            </ol>
          </div>
        )}
        <p>
          Generated by RetailLab on <span className="num">{fmtDate(meta.generatedAt)}</span>. The report stores its configuration only; all figures are computed from the
          recorded data at the time of viewing and will change if that data changes. Every sentence is produced by fixed rules from the data — no text was written by a language model.
          “—” marks a value that cannot be calculated from the data recorded.
        </p>
      </footer>
    </article>
  );
}
