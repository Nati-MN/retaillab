import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, libraryByCategory, simulatorHref, STRATEGY_CATEGORIES, STRATEGY_LIBRARY, type LibraryEntry } from "@/lib/strategy/library";
import type { StrategyCategoryKey } from "@/lib/strategy/rules";
import { SCENARIO_KINDS } from "@/lib/strategy/scenarioKinds";
import { Chip, Notice } from "@/components/ui";
import { first, type SearchParams } from "@/server/period";

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <div className="label mb-1">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs marker:text-ink-3">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

function Entry({ e, canWrite }: { e: LibraryEntry; canWrite: boolean }) {
  return (
    <details id={`lib-${e.key}`} className="group scroll-mt-4 border-b border-line last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 px-3 py-2 hover:bg-surface-2 md:grid-cols-[16px_minmax(0,260px)_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
        <h3 className="text-[13px] font-semibold">{e.title}</h3>
        <p className="col-start-2 text-xs text-ink-2 md:col-start-3">{e.what}</p>
        <span className="col-start-2 mt-1 md:col-start-4 md:mt-0"><Chip>{CATEGORY_LABELS[e.category]}</Chip></span>
      </summary>
      <div className="space-y-3 border-t border-line bg-surface-2 px-3 py-3 md:pl-9">
        <div className="max-w-3xl">
          <div className="label mb-1">Why retailers test it</div>
          <p className="text-xs">{e.whyTested}</p>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-5">
          <List title="Data required" items={e.dataRequired} />
          <List title="Possible costs" items={e.possibleCosts} />
          <List title="Possible benefits" items={e.possibleBenefits} />
          <List title="Risks" items={e.risks} />
          <List title="Metrics to measure" items={e.metrics} />
        </div>
        <div className="max-w-3xl">
          <div className="label mb-1">Which simulator fits</div>
          <p className="text-xs"><span className="font-medium">{SCENARIO_KINDS[e.simulator.kind].label}.</span> {e.simulator.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && <Link className="btn-primary btn-sm" href={`/strategies/new?library=${e.key}`}>Create hypothesis for a store</Link>}
          <Link className="btn-secondary btn-sm" href={simulatorHref(e.simulator)}>Open simulator</Link>
        </div>
      </div>
    </details>
  );
}

export function LibraryTab({ sp, canWrite }: { sp: SearchParams; canWrite: boolean }) {
  const param = first(sp.category);
  const category = (STRATEGY_CATEGORIES as string[]).includes(param ?? "") ? (param as StrategyCategoryKey) : null;
  const entries = libraryByCategory(category);
  const pill = (active: boolean) =>
    cn("inline-flex h-7 items-center gap-1 rounded border px-2 text-xs", active ? "border-ink bg-ink font-medium text-surface" : "border-line-strong bg-surface text-ink-2 hover:text-ink");

  return (
    <div className="space-y-3">
      <Notice tone="info" title="A library of things to test — not recommendations">
        Each entry describes a measure that retailers commonly try, what it may bring and what can go wrong. Whether it helps a particular store
        is unknown until it is tested there. No entry is a guaranteed improvement, and the library contains no cost or benefit figures.
      </Notice>

      <nav aria-label="Filter library by category" className="flex flex-wrap gap-1.5">
        <Link href="/strategies?tab=library" scroll={false} aria-current={!category ? "true" : undefined} className={pill(!category)}>
          All <span className="num opacity-70">{STRATEGY_LIBRARY.length}</span>
        </Link>
        {STRATEGY_CATEGORIES.map((c) => (
          <Link key={c} href={`/strategies?tab=library&category=${c}`} scroll={false} aria-current={category === c ? "true" : undefined} className={pill(category === c)}>
            {CATEGORY_LABELS[c]} <span className="num opacity-70">{libraryByCategory(c).length}</span>
          </Link>
        ))}
      </nav>

      <section className="rounded-md border border-line bg-surface" aria-label="Strategy library entries">
        {entries.map((e) => <Entry key={e.key} e={e} canWrite={canWrite} />)}
      </section>
      <p className="text-xs text-ink-3">
        <span className="num">{entries.length}</span> entries, in fixed editorial order (not ranked). Select an entry to see data requirements, costs, risks and metrics.
      </p>
    </div>
  );
}
