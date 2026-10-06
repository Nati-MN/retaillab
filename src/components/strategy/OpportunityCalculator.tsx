"use client";

import { useState } from "react";
import { calculateRevenueOpportunity } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { fmtSignedPct, fmtSignedPts } from "@/lib/format";
import type { StorePrefill } from "@/lib/strategy/prefill";
import {
  basketChangeLines, computeScenario, exprMoney, exprNum, exprPct, exprSignedMoney, parseInputNumber,
} from "@/lib/strategy/scenarioKinds";
import { CalcBlock, Notice, Panel, Tag } from "@/components/ui";
import { NumberField, PrefillNote, ScenarioBanner, StorePrefillSelect } from "./fields";

function Factor({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="num text-[15px] font-semibold leading-6">{value}</div>
      {sub && <div className="num text-2xs text-ink-3">{sub}</div>}
    </div>
  );
}

function Op({ children }: { children: string }) {
  return <span className="num self-center pt-3 text-ink-3" aria-hidden>{children}</span>;
}

function FormulaRow({ title, customers, customersSub, basket, basketSub, days, result, emphasis }: {
  title: string; customers: string; customersSub?: string; basket: string; basketSub?: string; days: string; result: string; emphasis?: boolean;
}) {
  return (
    <div
      className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,0.7fr)] items-start gap-x-2 gap-y-1 rounded border border-line px-3 py-2 md:grid-cols-[88px_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,0.7fr)_auto_minmax(0,1.2fr)]", emphasis ? "bg-surface" : "bg-surface-2")}
      role="group"
      aria-label={`${title}: ${customers} customers per day times ${basket} times ${days} days equals ${result}`}
    >
      <div className="col-span-full self-center text-xs font-semibold md:col-span-1">{title}</div>
      <Factor label="Customers / day" value={customers} sub={customersSub} />
      <Op>×</Op>
      <Factor label="Average basket" value={basket} sub={basketSub} />
      <Op>×</Op>
      <Factor label="Days" value={days} />
      <span className="num hidden self-center pt-3 text-ink-3 md:inline" aria-hidden>=</span>
      <div className="col-span-full border-t border-line pt-1 md:col-span-1 md:border-0 md:pt-0 md:text-right">
        <div className="label">Revenue</div>
        <div className="num text-[15px] font-semibold leading-6">{result}</div>
      </div>
    </div>
  );
}

interface Step { label: string; note?: string; value: number; total?: boolean }

/** Waterfall of the revenue difference: each bar starts where the previous one ended. */
function Waterfall({ steps, currency }: { steps: Step[]; currency: string }) {
  let cum = 0;
  const bars = steps.map((s) => {
    const start = s.total ? 0 : cum;
    const end = s.total ? s.value : cum + s.value;
    if (!s.total) cum = end;
    return { ...s, start, end };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.start, b.end)));
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.start, b.end)));
  const span = hi - lo;
  const pos = (v: number) => (span === 0 ? 0 : ((v - lo) / span) * 100);
  return (
    <div className="space-y-1.5">
      {bars.map((b) => {
        const left = pos(Math.min(b.start, b.end));
        const width = Math.abs(pos(b.end) - pos(b.start));
        return (
          <div key={b.label} className={cn("grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3", b.total && "border-t border-line pt-1.5")}>
            <div className="min-w-0">
              <div className={cn("truncate text-xs", b.total ? "font-semibold" : "text-ink-2")}>{b.label}</div>
              {b.note && <div className="hidden truncate text-2xs text-ink-3 sm:block">{b.note}</div>}
            </div>
            <div className="relative h-5" aria-hidden>
              <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${pos(0)}%` }} />
              <div
                className={cn("absolute inset-y-0.5 rounded-sm", b.total ? "bg-ink" : b.value < 0 ? "bg-neg" : "bg-info")}
                style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
              />
            </div>
            <div className={cn("num w-[7.5rem] text-right text-xs", b.total ? "font-semibold" : "", b.value < 0 && "text-neg")}>{exprSignedMoney(b.value, currency)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function OpportunityCalculator({ currency, stores }: { currency: string; stores: StorePrefill[] }) {
  const [prefill, setPrefill] = useState<StorePrefill | null>(null);
  const [example, setExample] = useState(false);
  const [customers, setCustomers] = useState("");
  const [basket, setBasket] = useState("");
  const [days, setDays] = useState("");
  const [margin, setMargin] = useState("");
  const [traffic, setTraffic] = useState("0");
  const [basketPct, setBasketPct] = useState("0");
  const [marginPts, setMarginPts] = useState("0");
  const [txMonth, setTxMonth] = useState("");
  const [basket2, setBasket2] = useState("");
  const [delta, setDelta] = useState("");

  const applyPrefill = (p: StorePrefill | null) => {
    setPrefill(p);
    setExample(false);
    if (!p) return;
    if (p.transactionsPerDay !== null) setCustomers(String(p.transactionsPerDay));
    if (p.averageBasket !== null) {
      setBasket(p.averageBasket.toFixed(2));
      setBasket2(p.averageBasket.toFixed(2));
    }
    if (p.daysPerMonth !== null) setDays(String(p.daysPerMonth));
    if (p.grossMarginPct !== null) setMargin(String(p.grossMarginPct));
    if (p.transactionsPerMonth !== null) setTxMonth(String(p.transactionsPerMonth));
  };
  const loadExample = () => {
    setPrefill(null);
    setExample(true);
    setCustomers("1000");
    setBasket("15");
    setDays("30");
    setMargin("");
    setTraffic("3");
    setBasketPct("2");
    setMarginPts("0");
    setTxMonth("30000");
    setBasket2("15");
    setDelta("0.50");
  };

  const input = {
    customersPerDay: parseInputNumber(customers),
    averageBasket: parseInputNumber(basket),
    days: parseInputNumber(days),
    trafficChangePct: parseInputNumber(traffic),
    basketChangePct: parseInputNumber(basketPct),
    grossMarginPct: parseInputNumber(margin),
    marginChangePts: parseInputNumber(marginPts),
  };
  const c = computeScenario("REVENUE_OPPORTUNITY", input, currency);
  const complete = c.lines.length > 0;
  const r = complete
    ? calculateRevenueOpportunity({
        customersPerDay: input.customersPerDay!, averageBasket: input.averageBasket!, days: input.days!,
        trafficChangePct: input.trafficChangePct!, basketChangePct: input.basketChangePct!,
        grossMarginPct: input.grossMarginPct ?? undefined, marginChangePts: input.marginChangePts ?? undefined,
      })
    : null;
  const effectLines = c.lines.filter((l) => ["trafficEffect", "basketEffect", "interactionEffect", "revenueDifference"].includes(l.key));
  const gpLines = c.lines.filter((l) => ["currentGrossProfit", "scenarioGrossProfit", "grossProfitDifference"].includes(l.key));
  const basketLines = basketChangeLines({ transactionsPerMonth: parseInputNumber(txMonth), averageBasket: parseInputNumber(basket2), basketDelta: parseInputNumber(delta) }, currency);

  return (
    <div className="space-y-3">
      <Panel title="Revenue opportunity calculator" subtitle="Revenue = Customers × Average Basket × Days" actions={<Tag kind="SCENARIO" />}>
        <div className="flex flex-wrap items-end gap-3">
          <StorePrefillSelect stores={stores} value={prefill?.storeId ?? ""} onSelect={applyPrefill} />
          <button type="button" className="btn-secondary" onClick={loadExample}>Load worked example</button>
        </div>
        <div className="mt-2 space-y-1">
          <PrefillNote prefill={prefill} fields={["transactionsPerDay", "averageBasket", "daysPerMonth", "grossMarginPct"]} currency={currency} />
          {prefill && <p className="text-xs text-ink-3">“Customers / day” is filled with recorded transactions per day, because the average basket is revenue per transaction.</p>}
          {example && <p className="text-xs text-warn" role="status">Example values loaded — illustrative only, not data from your stores.</p>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Customers / day" unit="count" currency={currency} value={customers} onChange={setCustomers} />
          <NumberField label="Average basket" unit="money" currency={currency} value={basket} onChange={setBasket} />
          <NumberField label="Days" unit="days" currency={currency} value={days} onChange={setDays} help="Open days in the period, e.g. one month." />
          <NumberField label="Gross margin" unit="pct" currency={currency} value={margin} onChange={setMargin} optional help="Adds a gross-profit view." />
        </div>
      </Panel>

      <ScenarioBanner>The percentages are yours to choose. This calculator shows what they would be worth — not whether or how they can be achieved.</ScenarioBanner>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel title="What if…" kind="ASSUMPTION" bodyClassName="space-y-4">
          <NumberField label="Traffic change" unit="pct" currency={currency} value={traffic} onChange={setTraffic} slider={{ min: -20, max: 20, step: 0.5 }} help="Change in customers per day." />
          <NumberField label="Basket change" unit="pct" currency={currency} value={basketPct} onChange={setBasketPct} slider={{ min: -20, max: 20, step: 0.5 }} help="Change in average basket value." />
          <NumberField label="Margin change" unit="pts" currency={currency} value={marginPts} onChange={setMarginPts} slider={{ min: -5, max: 5, step: 0.1 }} help={input.grossMarginPct === null ? "Enter a gross margin above to use this." : "Percentage points added to the gross margin."} />
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setTraffic("0"); setBasketPct("0"); setMarginPts("0"); }}>Reset changes to 0</button>
        </Panel>

        <Panel title="Step by step" kind="SCENARIO" bodyClassName="space-y-3">
          {!r ? (
            <Notice tone="unavailable" title="Cannot be calculated yet">Missing: {c.missing.join(", ")}.</Notice>
          ) : (
            <div className="space-y-3" aria-live="polite">
              <div className="space-y-1.5">
                <FormulaRow title="Current" customers={exprNum(input.customersPerDay)} basket={exprMoney(input.averageBasket, currency)} days={exprNum(input.days)} result={exprMoney(r.currentRevenue, currency)} />
                <FormulaRow
                  title="Scenario"
                  emphasis
                  customers={exprNum(r.newCustomersPerDay)}
                  customersSub={`${fmtSignedPct(input.trafficChangePct)} traffic`}
                  basket={exprMoney(r.newBasket, currency)}
                  basketSub={`${fmtSignedPct(input.basketChangePct)} basket`}
                  days={exprNum(input.days)}
                  result={exprMoney(r.scenarioRevenue, currency)}
                />
              </div>

              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Where the difference comes from</h3>
                <Waterfall
                  currency={currency}
                  steps={[
                    { label: "Traffic effect", note: "basket held constant", value: r.trafficEffect },
                    { label: "Basket effect", note: "traffic held constant", value: r.basketEffect },
                    { label: "Interaction effect", note: "both changed together", value: r.interactionEffect },
                    { label: "Revenue difference", value: r.revenueDifference, total: true },
                  ]}
                />
                <p className="num mt-2 text-xs text-ink-2">
                  {exprSignedMoney(r.trafficEffect, currency)} {r.basketEffect < 0 ? "−" : "+"} {exprMoney(Math.abs(r.basketEffect), currency)} {r.interactionEffect < 0 ? "−" : "+"} {exprMoney(Math.abs(r.interactionEffect), currency)} = <span className="font-semibold text-ink">{exprSignedMoney(r.revenueDifference, currency)}</span>
                  <span className="font-sans text-ink-3"> — the three effects add up exactly to the difference.</span>
                </p>
              </div>

              <CalcBlock lines={effectLines.map(({ label, expr, result, emphasis, note }) => ({ label, expr, result, emphasis, note }))} />

              {gpLines.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold">
                    Gross-profit view <span className="num font-normal text-ink-3">at {exprPct(input.grossMarginPct)} margin{input.marginChangePts ? `, ${fmtSignedPts(input.marginChangePts)}` : ""}</span>
                  </h3>
                  <CalcBlock lines={gpLines.map(({ label, expr, result, emphasis, note }) => ({ label, expr, result, emphasis, note }))} />
                  {r.marginEffect !== null && r.marginEffect !== 0 && (
                    <p className="num mt-1 text-xs text-ink-3">
                      Margin change alone, at current revenue: {exprMoney(r.currentRevenue, currency)} × {exprNum(input.marginChangePts)} pts = {exprSignedMoney(r.marginEffect, currency)}.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-3">Gross-profit view: not shown because no gross margin is entered.</p>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Basket change at constant volume" subtitle="Scenario revenue = Transactions × (Average basket + change)" kind="SCENARIO">
        <div className="grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
          <NumberField label="Transactions / month" unit="count" currency={currency} value={txMonth} onChange={setTxMonth} />
          <NumberField label="Average basket" unit="money" currency={currency} value={basket2} onChange={setBasket2} />
          <NumberField label="Basket change" unit="money" currency={currency} value={delta} onChange={setDelta} placeholder="e.g. 0.50" help="Amount added to each basket." />
        </div>
        <div className="mt-3 lg:max-w-3xl" aria-live="polite">
          {basketLines.length ? (
            <CalcBlock lines={basketLines.map(({ label, expr, result, emphasis, note }) => ({ label, expr, result, emphasis, note }))} />
          ) : (
            <Notice tone="unavailable" title="Cannot be calculated yet">Enter transactions per month, the average basket and a basket change.</Notice>
          )}
          <p className="mt-2 text-xs font-medium text-ink-2">This calculation assumes transaction volume remains unchanged.</p>
        </div>
      </Panel>
    </div>
  );
}
