import Link from "next/link";
import { ScatterPlot, type ValueFormat } from "@/components/charts";
import { EmptyState, Missing, Notice, Panel, RangeFilter, Tag } from "@/components/ui";
import { FilterBar, Swatch, analyticsHref, one, type TabProps } from "@/components/analytics/shared";
import { kpisByStore } from "@/lib/analytics/aggregate";
import {
  ATTRIBUTES, ATTRIBUTE_LABELS, OUTCOMES, OUTCOME_LABELS, criticalR, leaveOneOutRange, patternMatrix, storeAttributes, storeOutcomes,
  type AttributeKey, type OutcomeKey, type PatternStore,
} from "@/lib/analytics/patterns";
import { cn } from "@/lib/cn";
import { storeColorMap } from "@/lib/colors";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { db } from "@/server/db";
import { getPeriodContext } from "@/server/period";
import { getMonthFacts } from "@/server/queries";

const ATTR_FORMAT: Record<AttributeKey, ValueFormat> = { parking: "number", hours: "number1", staffDensity: "number1", area: "number", competitors: "number" };
const OUT_FORMAT: Record<OutcomeKey, ValueFormat> = { revenuePerSqm: "money", averageBasket: "money2", customersPerDay: "number", grossMarginPct: "pct" };

const ATTR_SHORT: Record<AttributeKey, string> = { parking: "Parking", hours: "Hours / wk", staffDensity: "Staff / 100 m²", area: "Size m²", competitors: "Comp. ≤ 1 km" };
const OUT_SHORT: Record<OutcomeKey, string> = { revenuePerSqm: "Rev / m² / mo", averageBasket: "Basket", customersPerDay: "Cust. / day", grossMarginPct: "Margin" };

function fmtR(r: number | null): string {
  if (r === null) return "—";
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;
}

function fmtAttr(v: number | null, k: AttributeKey): string {
  return k === "hours" || k === "staffDensity" ? fmtNumber(v, 1) : fmtNumber(v);
}

function fmtOut(v: number | null, k: OutcomeKey, currency: string): string {
  if (k === "grossMarginPct") return fmtPct(v);
  if (k === "customersPerDay") return fmtNumber(v);
  return fmtMoney(v, currency, k === "averageBasket" ? 2 : 0);
}

export async function PatternsTab({ orgId, currency, stores, sp }: TabProps) {
  const pc = await getPeriodContext(orgId, sp);
  if (!pc) return <EmptyState title="No revenue data yet" />;
  const { period } = pc;
  const [facts, nearby, withCompetitors, researched] = await Promise.all([
    getMonthFacts(orgId, { from: period.from, to: period.to }),
    db.competitor.groupBy({ by: ["storeId"], where: { store: { organizationId: orgId }, distanceM: { lte: 1000 } }, _count: { _all: true } }),
    db.competitor.findMany({ where: { store: { organizationId: orgId } }, select: { storeId: true }, distinct: ["storeId"] }),
    db.researchResult.findMany({ where: { organizationId: orgId, storeId: { not: null } }, select: { storeId: true }, distinct: ["storeId"] }),
  ]);
  // A store with no competitor rows AND no research run has an unknown competitor count — not zero.
  const known = new Set([...withCompetitors.map((c) => c.storeId), ...researched.map((r) => r.storeId)]);
  const count = new Map(nearby.map((n) => [n.storeId, n._count._all]));
  const kpis = kpisByStore(facts, stores);
  const colors = storeColorMap(stores);
  const rows: PatternStore[] = stores
    .filter((s) => (kpis.get(s.id)?.months ?? 0) > 0)
    .map((s) => ({
      storeId: s.id,
      storeName: s.name,
      attributes: storeAttributes(s, known.has(s.id) ? (count.get(s.id) ?? 0) : null),
      outcomes: storeOutcomes(kpis.get(s.id)!),
    }));
  const matrix = patternMatrix(rows);
  const flat = matrix.flat();
  const x = ATTRIBUTES.find((a) => a === one(sp.x)) ?? flat.find((c) => c.r !== null)?.attribute ?? "parking";
  const y = OUTCOMES.find((o) => o === one(sp.y)) ?? flat.find((c) => c.attribute === x && c.r !== null)?.outcome ?? "revenuePerSqm";
  const cell = flat.find((c) => c.attribute === x && c.outcome === y)!;
  const n = rows.length;
  const crit = criticalR(cell.n);
  const loo = leaveOneOutRange(cell.points);
  const computed = flat.filter((c) => c.r !== null).length;
  const incompleteAttrs = ATTRIBUTES.map((a) => ({ a, missing: rows.filter((r) => r.attributes[a] === null).map((r) => r.storeName) })).filter((e) => e.missing.length > 0);
  const incompleteOuts = OUTCOMES.map((o) => ({ o, missing: rows.filter((r) => r.outcomes[o] === null).map((r) => r.storeName) })).filter((e) => e.missing.length > 0);

  return (
    <div className="space-y-4">
      <FilterBar>
        <RangeFilter active={period.preset} from={period.from} to={period.to} min={pc.earliest} max={pc.latest} />
        <span className="text-xs text-ink-3">Outcomes are calculated over {periodLabel(period)}; store attributes are the current values on record.</span>
      </FilterBar>

      <div role="note" className="rounded-md border-2 border-dashed border-info/50 bg-info/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tag kind="CORRELATION" />
          <strong className="text-[15px] font-semibold tracking-tight">CORRELATION IS NOT CAUSATION</strong>
        </div>
        <p className="mt-1.5 max-w-4xl text-xs leading-5 text-ink-2">
          This page shows how store attributes and outcomes move together <em>across {n} stores</em>. It cannot show that an attribute causes an outcome: stores differ in location, format, catchment and
          many things that are not recorded, and any of those can produce the same pattern.
          {n < 10 && <> With <span className="num font-semibold text-ink">n = {n}</span> stores, correlations are extremely unstable — one store can flip the sign — and any |r| can arise by chance.</>}
          {" "}No verified effects exist here. An effect is only verified by an experiment with a measured result — see <Link href="/experiments" className="link">Experiments</Link>.
        </p>
      </div>

      {n < 3 ? (
        <EmptyState title="Not enough stores">
          A correlation across stores needs at least 3 stores with data in the period; {n} {n === 1 ? "has" : "have"}. Nothing is calculated.
        </EmptyState>
      ) : (
        <>
          <div className="space-y-4">
            <Panel title="Correlation matrix" kind="CORRELATION" subtitle="Pearson r across stores · select a cell to plot it" flush>
              <div className="scroll-thin overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Attribute ↓ / Outcome →</th>
                      {OUTCOMES.map((o) => <th key={o} className="text-right" title={OUTCOME_LABELS[o]}>{OUT_SHORT[o]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((line, i) => (
                      <tr key={ATTRIBUTES[i]}>
                        <td className="whitespace-nowrap font-medium">{ATTRIBUTE_LABELS[ATTRIBUTES[i]!]}</td>
                        {line.map((c) => {
                          const active = c.attribute === x && c.outcome === y;
                          return (
                            <td key={c.outcome} className={cn("!p-0 text-right", active && "!bg-surface-2")}>
                              <Link
                                href={analyticsHref(sp, { x: c.attribute, y: c.outcome })}
                                scroll={false}
                                aria-current={active ? "true" : undefined}
                                aria-label={`${ATTRIBUTE_LABELS[c.attribute]} versus ${OUTCOME_LABELS[c.outcome]}: r ${c.r === null ? "not available" : fmtR(c.r)}, ${c.n} stores`}
                                className={cn("block px-3 py-2 hover:bg-surface-2", active && "shadow-[inset_0_0_0_1.5px_rgb(var(--ink))]")}
                              >
                                <span className={cn("num block", c.r === null ? "text-ink-3" : "font-medium")}>{fmtR(c.r)}</span>
                                <span className="num block text-2xs text-ink-3">n = {c.n}</span>
                              </Link>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 border-t border-line p-3 text-xs text-ink-3">
                <p className="font-mono text-2xs">r = Σ(x − x̄)(y − ȳ) ÷ √[Σ(x − x̄)² · Σ(y − ȳ)²] · n = stores with both values · — = fewer than 3 stores or no variation</p>
                <p>
                  {computed} correlations are shown side by side. Looking at this many pairs, some large |r| values are expected from chance alone — the largest one in the table is not thereby the most meaningful.
                  Cells are deliberately not colour-coded by strength.
                </p>
              </div>
            </Panel>

            <Panel title={`${ATTRIBUTE_LABELS[x]} × ${OUTCOME_LABELS[y]}`} kind="CORRELATION" subtitle={`r = ${fmtR(cell.r)} · n = ${cell.n} · ${periodLabel(period)}`}>
              <div className="grid gap-x-5 gap-y-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0">
              {cell.points.length < 2 ? (
                <EmptyState title="Not enough stores with both values">
                  {cell.excluded.length > 0 ? `Missing for: ${cell.excluded.join(", ")}.` : "No data."}
                </EmptyState>
              ) : (
                <ScatterPlot
                  points={cell.points.map((p) => ({ label: p.storeName, x: p.x, y: p.y, color: colors[p.storeId] }))}
                  xLabel={ATTRIBUTE_LABELS[x]}
                  yLabel={OUTCOME_LABELS[y]}
                  xFormat={ATTR_FORMAT[x]}
                  yFormat={OUT_FORMAT[y]}
                  currency={currency}
                  height={340}
                  summary={`Each point is one store: ${ATTRIBUTE_LABELS[x].toLowerCase()} (x) against ${OUTCOME_LABELS[y].toLowerCase()} (y), ${periodLabel(period)}. ${cell.n} stores${cell.r === null ? "; no correlation can be calculated" : `, Pearson r ${fmtR(cell.r)}`}. No trend line is drawn: ${cell.n} points do not support one.`}
                />
              )}
              </div>
              <div className="space-y-2 text-xs text-ink-2">
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded border border-line bg-line">
                  <div className="bg-surface px-2.5 py-2"><dt className="label">Pearson r</dt><dd className="num text-lg font-semibold">{fmtR(cell.r)}</dd></div>
                  <div className="bg-surface px-2.5 py-2"><dt className="label">Stores (n)</dt><dd className="num text-lg font-semibold">{cell.n}</dd></div>
                  <div className="bg-surface px-2.5 py-2"><dt className="label">Leave-one-out r</dt><dd className="num text-lg font-semibold">{loo ? `${fmtR(loo.min)} … ${fmtR(loo.max)}` : "—"}</dd></div>
                </dl>
                {loo && (
                  <p>
                    <strong className="font-semibold text-ink">Sensitivity.</strong> Recomputing r with each store left out in turn gives values from <span className="num">{fmtR(loo.min)}</span> (without {loo.minWithout}) to <span className="num">{fmtR(loo.max)}</span> (without {loo.maxWithout}).
                    {Math.abs(loo.max - loo.min) >= 0.5 && " A single store changes the coefficient substantially — the pattern largely reflects that one store."}
                  </p>
                )}
                {cell.excluded.length > 0 && (
                  <p><strong className="font-semibold text-ink">Excluded ({cell.excluded.length}):</strong> {cell.excluded.join(", ")} — {ATTRIBUTE_LABELS[x].toLowerCase()} or {OUTCOME_LABELS[y].toLowerCase()} is not recorded.</p>
                )}
                {crit !== null && cell.r !== null && (
                  <p className="text-ink-3">
                    No p-value is shown. For orientation only: under textbook assumptions (independent, normally distributed pairs, one pair chosen in advance) |r| would have to exceed <span className="num">{crit.toFixed(2)}</span> at n = {cell.n} before a 5% test called it distinguishable from zero.
                    Those assumptions do not hold here — the pair was picked from a table of {computed}, and stores are not a random sample — so even passing that bar would settle nothing.
                  </p>
                )}
                <p className="text-ink-3">
                  A pattern worth testing can become a hypothesis under <Link href="/strategies" className="link">Strategies</Link> and be checked with an <Link href="/experiments" className="link">experiment</Link>. Until then it is a correlation.
                </p>
              </div>
              </div>
            </Panel>
          </div>

          <Panel title="Underlying values" kind="FACT" subtitle={`Attributes on record and outcomes for ${periodLabel(period)}`} flush>
            <div className="scroll-thin overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Store</th>
                    {ATTRIBUTES.map((a) => <th key={a} className="text-right" title={ATTRIBUTE_LABELS[a]}>{ATTR_SHORT[a]}</th>)}
                    {OUTCOMES.map((o) => <th key={o} className="text-right" title={OUTCOME_LABELS[o]}>{OUT_SHORT[o]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.storeId}>
                      <td className="whitespace-nowrap font-medium"><Swatch color={colors[r.storeId] ?? "var(--s1)"} /><Link href={`/stores/${r.storeId}`} className="hover:underline">{r.storeName}</Link></td>
                      {ATTRIBUTES.map((a) => <td key={a} className="r">{r.attributes[a] === null ? <Missing reason={a === "competitors" ? "No competitor research on record" : "Not recorded"} /> : fmtAttr(r.attributes[a], a)}</td>)}
                      {OUTCOMES.map((o) => <td key={o} className="r">{r.outcomes[o] === null ? <Missing reason="Cannot be calculated for this period" /> : fmtOut(r.outcomes[o], o, currency)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 border-t border-line p-3 text-xs text-ink-3">
              {(incompleteAttrs.length > 0 || incompleteOuts.length > 0) && (
                <p className="text-ink-2">
                  <strong className="font-semibold text-ink">Excluded from the affected correlations:</strong>{" "}
                  {[...incompleteAttrs.map((e) => `${e.missing.join(", ")} (no ${ATTRIBUTE_LABELS[e.a].toLowerCase()})`), ...incompleteOuts.map((e) => `${e.missing.join(", ")} (no ${OUTCOME_LABELS[e.o].toLowerCase()})`)].join("; ")}.
                  A missing value is never replaced by zero or an average.
                </p>
              )}
              <p className="font-mono text-2xs">
                opening hours / week = (closes − opens) × open days per week · employees / 100 m² = employees ÷ m² × 100 · competitors ≤ 1 km = stored competitor rows with distance ≤ 1,000 m ·
                revenue / m² / month = (revenue ÷ months) ÷ m² · basket = revenue ÷ transactions · customers / day = customers ÷ open days · margin = Σ(revenue × margin) ÷ Σ revenue
              </p>
              <p>Competitor counts come from stored research results (see <Link href="/research" className="link">Research</Link>) and are only as complete as that research; a store without any research on record is shown as missing, not as zero.</p>
            </div>
          </Panel>
        </>
      )}
      <Notice tone="info">
        Verified effects: none on this page. Only completed experiments produce measured before/after results — <Link href="/experiments" className="link">open Experiments</Link>.
      </Notice>
    </div>
  );
}
