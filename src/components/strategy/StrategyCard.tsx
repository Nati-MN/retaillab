import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { MonthKey } from "@/lib/period";
import { CATEGORY_LABELS, getLibraryEntry } from "@/lib/strategy/library";
import { computeScenario, SCENARIO_DISCLAIMER } from "@/lib/strategy/scenarioKinds";
import { Chip, SourcesButton, Tag } from "@/components/ui";
import {
  addStrategyToBoard, dismissStrategy, updateStrategyStatus,
} from "@/server/actions/strategies";
import type { SourceDTO } from "@/server/queries";
import { ActionButton, ActionSelect } from "./ActionControls";
import {
  CONFIDENCE_EXPLAINER, internalSourcesFor, LEVEL_LABELS, ORIGIN_LABELS, STRATEGY_STATUSES, STRATEGY_STATUS_LABELS,
} from "./labels";
import type { StrategyDTO } from "./loaders";
import { ScenarioColumns } from "./ScenarioColumns";

function Section({ label, tag, children }: { label: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-1 border-t border-line px-3 py-2.5 md:grid-cols-[168px_minmax(0,1fr)]">
      <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 self-start md:flex-col md:items-start">
        <span className="label text-ink-2">{label}</span>
        {tag}
      </dt>
      <dd className="min-w-0 text-[13px] leading-5">{children}</dd>
    </div>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-ink-3">{empty}</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4 marker:text-ink-3">
      {items.map((a, i) => <li key={i}>{a}</li>)}
    </ul>
  );
}

export interface StrategyCardProps {
  strategy: StrategyDTO;
  currency: string;
  canWrite: boolean;
  /** Latest data month — used to state which data windows the rule read. */
  latestMonth: MonthKey | null;
  /** Sources of the store's location signals (shown only when the hypothesis cites a signal). */
  signalSources: SourceDTO[];
  /** Other stores to preselect on the compare page. */
  compareStoreIds: string[];
  defaultOpen?: boolean;
  /** Hide the store name (store detail page). */
  hideStore?: boolean;
}

/**
 * One hypothesis. Collapsed: a scannable summary row. Expanded: every section
 * in a fixed order, each labelled with what kind of statement it is.
 */
export function StrategyCard({ strategy: s, currency, canWrite, latestMonth, signalSources, compareStoreIds, defaultOpen, hideStore }: StrategyCardProps) {
  const status = STRATEGY_STATUS_LABELS[s.status];
  const base = s.scenario ? computeScenario(s.scenario.kind, s.scenario.variants.BASE, currency) : null;
  const library = getLibraryEntry(s.libraryKey);
  const internal = internalSourcesFor(s.origin === "RULE_ENGINE" ? s.ruleKey : null, latestMonth);
  const compareHref = s.storeId ? `/compare?stores=${[s.storeId, ...compareStoreIds.filter((id) => id !== s.storeId)].slice(0, 4).join(",")}` : "/compare";
  const mentionsDemo = !!s.locationSignal && (/demo/i.test(s.locationSignal) || signalSources.some((x) => x.isDemo));

  return (
    <details id={`strategy-${s.id}`} open={defaultOpen} className="group scroll-mt-4 rounded-md border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-3 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
        <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[13px] font-semibold">{s.title}</h3>
              <Tag kind="HYPOTHESIS" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
              {!hideStore && s.storeName && <span className="text-ink-2">{s.storeName}</span>}
              {!hideStore && s.storeName && <span aria-hidden>·</span>}
              <span>{CATEGORY_LABELS[s.category]}</span>
              <span aria-hidden>·</span>
              <span>{ORIGIN_LABELS[s.origin]}</span>
              <span aria-hidden>·</span>
              <span>Data confidence {LEVEL_LABELS[s.dataConfidence].toLowerCase()}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-ink-2 group-open:hidden">{s.hypothesis}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:justify-end">
            {base?.headline && (
              <div className="lg:text-right">
                <div className={cn("num text-[13px] font-semibold", base.headline.value !== null && base.headline.value < 0 && "text-neg")}>{base.headline.text}</div>
                <div className="whitespace-nowrap text-2xs text-ink-3">base scenario · {base.headline.short} · not a forecast</div>
              </div>
            )}
            <Chip tone={status.tone}>{status.short}</Chip>
          </div>
        </div>
      </summary>

      <dl>
        <Section label="Observation" tag={<Tag kind={s.origin === "USER" ? "FACT" : "CALCULATED"}>{s.origin === "USER" ? "Entered by user" : undefined}</Tag>}>
          {s.observation}
        </Section>

        {s.locationSignal && (
          <Section label="Location signal" tag={mentionsDemo ? <Tag kind="DEMO" /> : <Tag kind="FACT">External · cited</Tag>}>
            {s.locationSignal}
            {mentionsDemo && <span className="text-ink-3"> These places are fictional demo data.</span>}
            <span className="text-ink-3"> A signal nearby does not show that those people shop at this store.</span>
          </Section>
        )}

        <Section label="Hypothesis" tag={<Tag kind="HYPOTHESIS" />}>
          <span className="font-medium">{s.hypothesis}</span>
        </Section>

        <Section label="Why it may matter">{s.whyItMayMatter}</Section>
        <Section label="Proposed test">{s.proposedTest}</Section>

        <Section label="Assumptions" tag={<Tag kind="ASSUMPTION" />}>
          <Bullets items={s.assumptions} empty="No assumptions were recorded." />
        </Section>

        <Section label="Cost assumption" tag={<Tag kind="ASSUMPTION" />}>
          {s.costAssumption !== null ? (
            <>
              <span className="num font-medium">{fmtMoney(s.costAssumption, currency)}</span>
              <span className="text-ink-3"> — an assumed figure, not a quote. Replace it with a real cost before deciding.</span>
            </>
          ) : (
            <span className="text-ink-3">No single cost figure is assumed{s.scenario ? "; cost inputs, if any, are listed in the scenario below" : ""}.</span>
          )}
        </Section>

        <Section label="Scenario" tag={<Tag kind="SCENARIO">Scenario</Tag>}>
          {s.scenario ? (
            <div className="space-y-2">
              <p className="font-mono text-2xs font-medium uppercase tracking-[0.06em] text-warn">{SCENARIO_DISCLAIMER}</p>
              {base?.sentence && (
                <p className="num text-xs text-ink-2"><span className="font-medium text-ink">Base: </span>{base.sentence}.</p>
              )}
              <ScenarioColumns kind={s.scenario.kind} variants={s.scenario.variants} currency={currency} />
              {s.scenario.derivation && (
                <p className="text-xs text-ink-2">
                  <span className="font-medium text-ink">Where the three variants come from: </span>
                  {s.scenario.derivation}
                </p>
              )}
            </div>
          ) : (
            <span className="text-ink-3">
              No scenario has been calculated for this hypothesis.{" "}
              <Link className="link" href={library ? `/strategies?tab=library#lib-${library.key}` : "/strategies?tab=simulator"}>
                {library ? "See which simulator fits" : "Open the simulator"}
              </Link>{" "}
              to work out the arithmetic with your own assumptions.
            </span>
          )}
        </Section>

        <Section label="Risks"><Bullets items={s.risks} empty="No risks were recorded." /></Section>

        <Section label="Metrics to watch">
          {s.metricsToWatch.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {s.metricsToWatch.map((m, i) => <li key={i}><Chip>{m}</Chip></li>)}
            </ul>
          ) : (
            <span className="text-ink-3">No metrics were recorded.</span>
          )}
        </Section>

        <Section label="Confidence / data quality">
          <span className="font-medium">{LEVEL_LABELS[s.dataConfidence]}</span>
          {s.confidenceNote && <span> — {s.confidenceNote}</span>}
          <p className="mt-1 text-xs text-ink-3">
            {s.origin === "USER" ? "Level chosen by the author of this hypothesis. " : ""}
            {!/not how likely/i.test(s.confidenceNote ?? "") && CONFIDENCE_EXPLAINER}
          </p>
        </Section>

        <Section label="Sources">
          <div className="space-y-1.5">
            {internal.length > 0 ? (
              <div>
                <span className="text-ink-3">Internal data read by the rule (windows relative to the latest data month): </span>
                <ul className="list-disc pl-4 marker:text-ink-3">
                  {internal.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-ink-3">Written by a user; no data window was recorded by the system.</p>
            )}
            {s.locationSignal ? (
              signalSources.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-3">External, for the location signal:</span>
                  <SourcesButton sources={signalSources} label={mentionsDemo ? "Sources (demo)" : "Sources"} />
                </div>
              ) : (
                <p className="text-ink-3">The location signal has no source on file any more.</p>
              )
            ) : (
              <p className="text-ink-3">No external source is cited.</p>
            )}
          </div>
        </Section>

        <Section label="Status">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium">{status.label}</span>
            {canWrite && (
              <ActionSelect
                action={updateStrategyStatus}
                fields={{ id: s.id }}
                name="status"
                value={s.status}
                label={`Status of ${s.title}`}
                options={STRATEGY_STATUSES.map((k) => ({ value: k, label: STRATEGY_STATUS_LABELS[k].short }))}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Created {fmtDate(s.createdAt)} by: {ORIGIN_LABELS[s.origin].toLowerCase()}.
            {s.experiments.length > 0 && (
              <>
                {" "}Linked experiment{s.experiments.length > 1 ? "s" : ""}:{" "}
                {s.experiments.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ", "}
                    <Link className="link" href={`/experiments/${e.id}`}>{e.title}</Link> ({e.status.toLowerCase()})
                  </span>
                ))}
                .
              </>
            )}
          </p>
        </Section>
      </dl>

      <details className="group/ev border-t border-line">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open/ev:rotate-90" aria-hidden />
          View evidence
        </summary>
        <div className="space-y-1.5 px-3 pb-3 pl-8 text-xs text-ink-2">
          <p>The numbers in the observation can be checked against the underlying data:</p>
          <ul className="list-disc space-y-0.5 pl-4 marker:text-ink-3">
            {s.storeId && <li><Link className="link" href={`/stores/${s.storeId}`}>Store scorecard{s.storeName ? ` — ${s.storeName}` : ""}</Link>: monthly revenue, transactions, basket, margin and costs.</li>}
            <li><Link className="link" href={compareHref}>Side-by-side comparison</Link> with other stores (differences between stores are correlations, not causes).</li>
            {(s.ruleKey === "category-underindex" || s.ruleKey === "lunch-gap") && <li><Link className="link" href="/analytics?tab=categories">Category analytics</Link>: revenue share and margin by category.</li>}
            {s.ruleKey === "waste-above-peers" && <li><Link className="link" href="/analytics?tab=costs">Cost analytics</Link>: waste and other cost lines as a share of revenue.</li>}
            {s.locationSignal && s.storeId && <li><Link className="link" href={`/research?store=${s.storeId}`}>Location research</Link>: the signals and their sources.</li>}
          </ul>
          {internal.length > 0 && <p className="text-ink-3">Data windows used: {internal.join("; ")}.</p>}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {s.scenario ? (
          <Link className="btn-primary btn-sm" href={`/strategies?tab=simulator&scenario=${s.scenario.id}`}>Simulate</Link>
        ) : (
          <Link className="btn-secondary btn-sm" href="/strategies?tab=simulator">Simulate</Link>
        )}
        <Link className="btn-secondary btn-sm" href={`/experiments/new?strategy=${s.id}`}>Create experiment</Link>
        {s.opportunityId ? (
          <Link className="btn-ghost btn-sm" href="/strategies?tab=board">On opportunity board</Link>
        ) : (
          canWrite && s.storeId && <ActionButton action={addStrategyToBoard} fields={{ id: s.id }} pendingLabel="Adding…">Add to opportunity board</ActionButton>
        )}
        {library && <Link className="btn-ghost btn-sm" href={`/strategies?tab=library&category=${library.category}#lib-${library.key}`}>Library: {library.title}</Link>}
        {canWrite && (
          <span className="ml-auto">
            <ActionButton
              action={dismissStrategy}
              fields={{ id: s.id }}
              className="btn-danger btn-sm"
              confirm={`Dismiss “${s.title}”? The hypothesis and its scenario are deleted.${s.origin === "RULE_ENGINE" ? " The rule engine will propose it again on the next run if the data still triggers it." : ""}`}
              feedback="errors"
            >
              Dismiss
            </ActionButton>
          </span>
        )}
      </div>
    </details>
  );
}
