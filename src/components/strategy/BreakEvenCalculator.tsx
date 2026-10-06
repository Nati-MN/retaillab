"use client";

import Link from "next/link";
import { useState } from "react";
import { SCENARIO_VARIANTS, type ScenarioVariantKey } from "@/lib/calc";
import { cn } from "@/lib/cn";
import type { StorePrefill } from "@/lib/strategy/prefill";
import {
  computeScenario, contributionPerTransaction, exprMoney, exprPct, monthlyCostBreakEvenLines, parseInputNumber, VARIANT_LABELS,
} from "@/lib/strategy/scenarioKinds";
import { CalcBlock, Notice, Panel, Tag } from "@/components/ui";
import { CalcLines } from "./ScenarioColumns";
import { NumberField, PrefillNote, ScenarioBanner, StorePrefillSelect } from "./fields";

interface Preset {
  key: string;
  label: string;
  /** What kind of cost this mostly is — steers the user to the right calculator. */
  note: string;
  investmentLabel: string;
  investmentHelp: string;
  runningHelp: string;
  transactionsHelp: string;
  monthlyCostHelp: string;
  simulatorLink?: boolean;
}

/** Presets change wording only. They never fill in an amount: real costs must come from your own quotes. */
const PRESETS: Preset[] = [
  {
    key: "generic", label: "Generic investment", note: "Any one-off spend that is meant to bring additional transactions.",
    investmentLabel: "Investment", investmentHelp: "Total one-off cost, from your own quotes.",
    runningHelp: "Recurring cost caused by the investment (maintenance, lease, energy).",
    transactionsHelp: "Transactions that would not happen without the investment. Your assumption.",
    monthlyCostHelp: "Any additional recurring monthly cost.",
  },
  {
    key: "opening-hours", label: "Longer opening hours", simulatorLink: true,
    note: "Mostly a recurring labor cost, not an investment. The opening-hours simulator models it in full; the monthly-cost break-even below gives the short answer.",
    investmentLabel: "One-off cost (if any)", investmentHelp: "E.g. communication of the new hours. Often none.",
    runningHelp: "Additional labor, energy and security per month.",
    transactionsHelp: "Additional transactions in the added hours. Your assumption.",
    monthlyCostHelp: "Additional labor cost per month = employees × hourly cost × hours × days.",
  },
  {
    key: "additional-employee", label: "Additional employee",
    note: "A recurring cost. Use the monthly-cost break-even below; enter recruitment and training as the one-off investment if you want to include them.",
    investmentLabel: "Recruitment and onboarding cost", investmentHelp: "One-off cost of hiring and training, from your HR figures.",
    runningHelp: "Fully loaded monthly employment cost.",
    transactionsHelp: "Additional transactions attributable to the extra capacity. Your assumption.",
    monthlyCostHelp: "Fully loaded monthly employment cost of the additional employee.",
  },
  {
    key: "store-renovation", label: "Store renovation", note: "A one-off investment. Consider whether to include revenue lost during the works.",
    investmentLabel: "Renovation cost", investmentHelp: "Quoted total for works and fixtures; add lost contribution during closure if you want it counted.",
    runningHelp: "Any change in recurring cost after the renovation (may be none).",
    transactionsHelp: "Additional transactions you attribute to the renovated store. Your assumption.",
    monthlyCostHelp: "Additional recurring monthly cost after the renovation, if any.",
  },
  {
    key: "new-refrigerator", label: "New refrigerator", note: "A one-off investment with running cost for energy and maintenance.",
    investmentLabel: "Purchase and installation cost", investmentHelp: "From the supplier's quote, including installation.",
    runningHelp: "Energy and maintenance contract per month.",
    transactionsHelp: "Additional purchases of chilled products that would not happen otherwise. Your assumption.",
    monthlyCostHelp: "Energy and maintenance per month.",
  },
  {
    key: "advertising-campaign", label: "Advertising campaign", note: "A one-off spend whose effect may end when the campaign ends — compare payback with the campaign's duration.",
    investmentLabel: "Campaign cost", investmentHelp: "Creative, print, media and distribution, from your quotes.",
    runningHelp: "Usually none; discounts given are better modelled as a lower contribution per transaction.",
    transactionsHelp: "Additional transactions during and after the campaign. Your assumption.",
    monthlyCostHelp: "Monthly campaign spend, if it is an ongoing campaign.",
  },
  {
    key: "new-product-category", label: "New product category", note: "One-off listing and fixture cost; the contribution per transaction should be that of the new category, not the store average.",
    investmentLabel: "Listing, fixtures and initial stock write-down", investmentHelp: "One-off cost of introducing the category.",
    runningHelp: "Additional waste, handling or space cost per month.",
    transactionsHelp: "Additional purchases from the new category, net of purchases it replaces. Your assumption.",
    monthlyCostHelp: "Additional waste and handling cost per month.",
  },
  {
    key: "delivery-service", label: "Delivery service", note: "Set-up investment plus substantial recurring cost. Contribution per order should be net of picking and delivery cost.",
    investmentLabel: "Set-up cost", investmentHelp: "Vehicles, software, packaging — from your quotes.",
    runningHelp: "Fixed monthly cost of running the service (staff, vehicle, platform fees).",
    transactionsHelp: "Additional orders that do not replace store visits. Your assumption.",
    monthlyCostHelp: "Fixed monthly cost of running the service.",
  },
  {
    key: "self-checkout", label: "Self-checkout", note: "A one-off investment with maintenance cost. Savings in cashier hours are a cost reduction — model them in the simulator.",
    investmentLabel: "Hardware and installation cost", investmentHelp: "From the supplier's quote.",
    runningHelp: "Maintenance, licences and additional shrinkage per month.",
    transactionsHelp: "Additional transactions from shorter queues. Your assumption — it may be zero.",
    monthlyCostHelp: "Maintenance, licences and additional shrinkage per month.",
  },
  {
    key: "bakery-expansion", label: "Bakery expansion", note: "One-off equipment and fit-out cost; use the bakery's own basket and margin rather than the store average.",
    investmentLabel: "Equipment and fit-out cost", investmentHelp: "Ovens, counters, ventilation — from your quotes.",
    runningHelp: "Additional labor, energy and waste per month.",
    transactionsHelp: "Additional bakery purchases. Your assumption.",
    monthlyCostHelp: "Additional labor, energy and waste per month.",
  },
];

export function BreakEvenCalculator({ currency, stores }: { currency: string; stores: StorePrefill[] }) {
  const [presetKey, setPresetKey] = useState("generic");
  const [prefill, setPrefill] = useState<StorePrefill | null>(null);
  const [basket, setBasket] = useState("");
  const [margin, setMargin] = useState("");
  const [days, setDays] = useState("");
  const [contribution, setContribution] = useState("");
  const [investment, setInvestment] = useState("");
  const [running, setRunning] = useState("");
  const [tx, setTx] = useState<Record<ScenarioVariantKey, string>>({ CONSERVATIVE: "", BASE: "", OPTIMISTIC: "" });
  const [monthlyCost, setMonthlyCost] = useState("");

  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!;
  const nBasket = parseInputNumber(basket);
  const nMargin = parseInputNumber(margin);
  const derived = contributionPerTransaction(nBasket, nMargin);
  const derivedRounded = derived !== null ? derived.toFixed(2) : null;

  const applyPrefill = (p: StorePrefill | null) => {
    setPrefill(p);
    if (!p) return;
    if (p.averageBasket !== null) setBasket(p.averageBasket.toFixed(2));
    if (p.grossMarginPct !== null) setMargin(String(p.grossMarginPct));
    if (p.daysPerMonth !== null) setDays(String(p.daysPerMonth));
    const c = contributionPerTransaction(p.averageBasket, p.grossMarginPct);
    if (c !== null) setContribution(c.toFixed(2));
  };

  const shared = {
    investment: parseInputNumber(investment),
    contributionPerTransaction: parseInputNumber(contribution),
    monthlyRunningCost: parseInputNumber(running),
  };
  const required = computeScenario("BREAK_EVEN", shared, currency);
  const perVariant = SCENARIO_VARIANTS.map((v) => ({
    v,
    volume: parseInputNumber(tx[v]),
    c: computeScenario("BREAK_EVEN", { ...shared, additionalTransactionsPerMonth: parseInputNumber(tx[v]) }, currency),
  }));
  const monthlyLines = monthlyCostBreakEvenLines(
    { additionalMonthlyCost: parseInputNumber(monthlyCost), averageBasket: nBasket, grossMarginPct: nMargin, daysPerMonth: parseInputNumber(days) },
    currency,
  );
  const monthlyMissing = [
    parseInputNumber(monthlyCost) === null && "additional monthly cost",
    nMargin === null && "gross margin",
    nBasket === null && "average basket",
    parseInputNumber(days) === null && "open days / month",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <Panel title="Break-even calculator" subtitle="How many additional transactions does a cost need before it pays for itself?" actions={<Tag kind="SCENARIO" />}>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-2">Preset — changes the wording only, never the amounts</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Preset">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={p.key === presetKey}
                onClick={() => setPresetKey(p.key)}
                className={cn("btn h-7 px-2 text-xs", p.key === presetKey ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-xs text-ink-2">
          <span className="font-medium text-ink">{preset.label}: </span>
          {preset.note}{" "}
          {preset.simulatorLink && <Link className="link" href="/strategies?tab=simulator&kind=OPENING_HOURS">Open the opening-hours simulator</Link>}
        </p>
        <p className="mt-1 text-xs text-ink-3">Amounts are left empty on purpose: RetailLab does not know what this costs in your market. Enter figures from your own quotes.</p>
      </Panel>

      <ScenarioBanner>The required number of transactions is exact arithmetic. Whether those transactions would actually come is an assumption only a test can check.</ScenarioBanner>

      <Panel title="Per-transaction economics" kind="ASSUMPTION" subtitle="What one additional transaction contributes. Used by both calculators below.">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <StorePrefillSelect stores={stores} value={prefill?.storeId ?? ""} onSelect={applyPrefill} />
        </div>
        <PrefillNote prefill={prefill} fields={["averageBasket", "grossMarginPct", "daysPerMonth"]} currency={currency} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Average basket" unit="money" currency={currency} value={basket} onChange={setBasket} help="Value of one additional transaction." />
          <NumberField label="Gross margin" unit="pct" currency={currency} value={margin} onChange={setMargin} />
          <NumberField label="Open days / month" unit="days" currency={currency} value={days} onChange={setDays} help="Only needed for break-even customers per day." />
          <NumberField
            label="Contribution per additional transaction"
            unit="money"
            currency={currency}
            value={contribution}
            onChange={setContribution}
            help="Type a value, or derive it from basket × margin."
            note={
              derivedRounded !== null ? (
                <button type="button" className="btn-secondary btn-sm self-start" onClick={() => setContribution(derivedRounded)} disabled={contribution === derivedRounded}>
                  <span className="num">Use {exprMoney(nBasket, currency)} × {exprPct(nMargin)} = {exprMoney(Number(derivedRounded), currency)}</span>
                </button>
              ) : undefined
            }
          />
        </div>
        {derived !== null && <p className="mt-2 text-2xs text-ink-3">Basket × margin is rounded to cents when applied, so that every line below can be recalculated from the numbers shown.</p>}
      </Panel>

      <Panel title="Investment break-even" subtitle="Required additional transactions = Investment ÷ Contribution per transaction">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label={preset.investmentLabel} unit="money" currency={currency} value={investment} onChange={setInvestment} help={preset.investmentHelp} />
          <NumberField label="Monthly running cost" unit="money" currency={currency} value={running} onChange={setRunning} optional help={preset.runningHelp} />
        </div>
        <div className="mt-3" aria-live="polite">
          {required.lines.length ? (
            <CalcBlock lines={required.lines.map(({ label, expr, result, note }) => ({ label, expr, result, note, emphasis: true }))} />
          ) : (
            <Notice tone="unavailable" title="Cannot be calculated yet">Missing: {required.missing.join(", ")}.</Notice>
          )}
        </div>

        <h3 className="mb-1 mt-4 text-[13px] font-semibold">Payback period under three volume assumptions</h3>
        <p className="mb-2 text-xs text-ink-3">{preset.transactionsHelp} Payback = Investment ÷ (transactions × contribution − running cost).</p>
        <div className="grid gap-3 lg:grid-cols-3" role="group" aria-label="Payback: conservative, base and optimistic">
          {perVariant.map(({ v, volume, c }) => {
            const lines = c.lines.filter((l) => l.key !== "requiredTransactions");
            return (
              <div key={v} className="min-w-0 rounded border border-line p-3">
                <div className="label mb-2">{VARIANT_LABELS[v]}</div>
                <NumberField label="Additional transactions / month" unit="count" currency={currency} value={tx[v]} onChange={(raw) => setTx((p) => ({ ...p, [v]: raw }))} />
                <div className="mt-2" aria-live="polite">
                  {lines.length ? (
                    <CalcLines lines={lines} />
                  ) : (
                    <p className="text-xs text-ink-3">
                      {c.missing.length ? `Missing: ${c.missing.join(", ")}.` : volume === null ? "Enter a volume to see monthly contribution and payback." : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-3">Payback is approximate: financing cost, depreciation and any ramp-up period are not modelled.</p>
      </Panel>

      <Panel title="Monthly-cost break-even" subtitle="Break-even revenue = Additional monthly cost ÷ Gross margin · Break-even customers/day = Cost ÷ (Basket × Margin × Days)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Additional monthly cost" unit="money" currency={currency} value={monthlyCost} onChange={setMonthlyCost} help={preset.monthlyCostHelp} />
          <div className="text-xs text-ink-3 sm:col-span-1 lg:col-span-3 lg:self-center">
            Uses the average basket, gross margin and open days entered under “Per-transaction economics”.
          </div>
        </div>
        <div className="mt-3" aria-live="polite">
          {monthlyLines.length ? (
            <>
              <CalcBlock lines={monthlyLines.map(({ label, expr, result, emphasis, note }) => ({ label, expr, result, emphasis, note }))} />
              {monthlyMissing.length > 0 && <p className="mt-1 text-xs text-ink-3">Break-even customers per day also needs: {monthlyMissing.join(", ")}.</p>}
            </>
          ) : (
            <Notice tone="unavailable" title="Cannot be calculated yet">Missing: {monthlyMissing.join(", ")}.</Notice>
          )}
        </div>
      </Panel>
    </div>
  );
}
