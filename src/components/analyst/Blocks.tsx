"use client";

import Link from "next/link";
import { ArrowUpRight, CornerDownRight } from "lucide-react";
import { CalcBlock } from "@/components/ui/Calc";
import { Cite, SourcesButton } from "@/components/ui/Sources";
import { Notice } from "@/components/ui/States";
import { Chip, Tag } from "@/components/ui/Tag";
import type { Block, BlockKind, ToolCallRecord } from "@/lib/ai/types";

function Heading({ title, kind, aside }: { title: string; kind?: BlockKind; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <h4 className="text-xs font-semibold">{title}</h4>
      {kind && <Tag kind={kind} />}
      {aside && <span className="text-2xs text-ink-3">{aside}</span>}
    </div>
  );
}

/** Keeps a sign and its currency symbol on one line ("+€ 1,200" must not wrap after the "+"). */
const glue = (t: string) => t.replace(/([+−±])(?=[€$£A-Z])/g, "$1\u2060");

function BlockView({ block, onAsk, onNavigate }: { block: Block; onAsk: (q: string) => void; onNavigate: () => void }) {
  switch (block.type) {
    case "text":
      if (block.tone === "unavailable") return <Notice tone="unavailable">{block.text}</Notice>;
      if (block.tone === "interpretation") {
        return (
          <p className="flex gap-1.5 text-xs leading-5 text-ink-2">
            <CornerDownRight className="mt-1 h-3 w-3 shrink-0 text-ink-3" aria-hidden />
            <span className="whitespace-pre-line">{block.text}</span>
          </p>
        );
      }
      return (
        <p className="leading-5">
          {block.kind && <Tag kind={block.kind} className="mr-1.5 align-[1px]" />}
          <span className="num">{glue(block.text)}</span>
        </p>
      );
    case "table":
      return (
        <div>
          <Heading title={block.title} kind={block.kind} />
          <div className="scroll-thin overflow-x-auto rounded border border-line">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Item</span></th>
                  {block.columns.map((c) => <th key={c} scope="col" className="r">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((r, i) => (
                  <tr key={i}>
                    <td role="rowheader" className="!py-1.5 font-medium">
                      <span className="block min-w-[9rem]">{r.label}</span>
                      {r.sub && <span className="block max-w-[18rem] font-normal text-ink-3">{r.sub}</span>}
                    </td>
                    {r.values.map((v, j) => <td key={j} className="r whitespace-nowrap !py-1.5">{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note && <p className="mt-1 text-2xs text-ink-3">{block.note}</p>}
        </div>
      );
    case "calc":
      return (
        <div>
          <Heading title={block.title} kind={block.kind} />
          <CalcBlock lines={block.lines} />
        </div>
      );
    case "facts":
      return (
        <div>
          <Heading title={block.title} kind={block.kind} />
          <ul className="space-y-1 border-l-2 border-line pl-3 text-xs leading-5">
            {block.items.map((t, i) => <li key={i} className="num">{glue(t)}</li>)}
          </ul>
        </div>
      );
    case "hypotheses":
      return (
        <div>
          <Heading title="Possible explanations" kind="HYPOTHESIS" aside="generic candidates · not derived from your data" />
          <ul className="space-y-1 border-l-2 border-accent/50 pl-3 text-xs leading-5 text-ink-2">
            {block.items.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <p className="mt-1 text-2xs text-ink-3">None of these is supported or ruled out by the figures above. An experiment is the way to find out.</p>
        </div>
      );
    case "unknowns":
      return (
        <div>
          <Heading title="Not known" kind="UNKNOWN" />
          <ul className="space-y-1 border-l-2 border-dashed border-line-strong pl-3 text-xs leading-5 text-ink-2">
            {block.items.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      );
    case "sources":
      return (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{block.title}</h4>
            {block.sources.length > 0 && <SourcesButton sources={block.sources} />}
          </div>
          <ul className="divide-y divide-line rounded border border-line text-xs">
            {block.items.map((it, i) => {
              const src = it.sourceId ? block.sources.find((s) => s.id === it.sourceId) : undefined;
              return (
                <li key={i} className="flex items-start gap-2 px-3 py-1.5 leading-5">
                  <span className="num min-w-0 flex-1">
                    {it.text}
                    {src ? <Cite source={src} all={block.sources} /> : <span className="ml-1 text-2xs text-ink-3">(no source recorded)</span>}
                  </span>
                  {it.label && <Chip className="shrink-0">{it.label}</Chip>}
                </li>
              );
            })}
          </ul>
        </div>
      );
    case "links":
      return (
        <div className="flex flex-wrap gap-1.5">
          {block.links.map((l) => (
            <Link key={l.href + l.label} href={l.href} onClick={onNavigate} className="btn-secondary btn-sm max-w-full">
              <span className="truncate">{l.label}</span> <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-3" aria-hidden />
            </Link>
          ))}
        </div>
      );
    case "suggestions":
      return (
        <div>
          <Heading title={block.title} />
          <SuggestionList items={block.items} onAsk={onAsk} />
        </div>
      );
  }
}

export function SuggestionList({ items, onAsk }: { items: string[]; onAsk: (q: string) => void }) {
  return (
    <ul className="space-y-1">
      {items.map((q) => (
        <li key={q}>
          <button type="button" onClick={() => onAsk(q)} className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-left text-xs leading-5 text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink">
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

function paramText(v: unknown): string {
  if (Array.isArray(v)) return v.map(paramText).join(", ");
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function ToolsUsed({ calls }: { calls: ToolCallRecord[] }) {
  if (calls.length === 0) {
    return <p className="text-2xs text-ink-3">No tool was run for this answer — no data was read.</p>;
  }
  return (
    <details className="group rounded border border-line bg-surface-2 text-xs">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-ink-2 hover:text-ink">
        <span className="label">Tools used</span>
        <span className="num text-ink-3">{calls.length}</span>
        <span className="truncate font-mono text-2xs text-ink-3">{calls.map((c) => c.tool).join(" · ")}</span>
        <span className="ml-auto text-2xs text-ink-3 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-2xs text-ink-3 group-open:inline">Hide</span>
      </summary>
      <ol className="divide-y divide-line border-t border-line">
        {calls.map((c, i) => (
          <li key={i} className="px-2.5 py-2">
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs font-medium">{c.tool}</code>
              {!c.ok && <Chip tone="neg">failed</Chip>}
            </div>
            {c.description && <p className="mt-0.5 text-2xs leading-4 text-ink-3">{c.description}</p>}
            <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-2xs">
              <dt className="label">Parameters</dt>
              <dd className="num break-words font-mono text-ink-2">
                {Object.keys(c.input).length === 0
                  ? "none"
                  : Object.entries(c.input).map(([k, v]) => (
                      <span key={k} className="mr-3 inline-block">{k} = {c.inputLabels?.[k] ?? paramText(v)}</span>
                    ))}
              </dd>
              <dt className="label">Data read</dt>
              <dd className="num text-ink-2">{c.dataWindow}</dd>
              {c.error && (<><dt className="label">Error</dt><dd className="text-neg">{c.error}</dd></>)}
            </dl>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function AnswerBlocks({ blocks, onAsk, onNavigate }: { blocks: Block[]; onAsk: (q: string) => void; onNavigate: () => void }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => <BlockView key={i} block={b} onAsk={onAsk} onNavigate={onNavigate} />)}
    </div>
  );
}
