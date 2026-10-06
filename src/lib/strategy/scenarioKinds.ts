import {
  calculateBasketChange,
  calculateBreakEvenCustomers,
  calculateBreakEvenRevenue,
  calculateCostReduction,
  calculateInvestmentBreakEven,
  calculateOpeningHoursScenario,
  calculateRevenueOpportunity,
  calculateTransactionUplift,
  isNum,
  SCENARIO_VARIANTS,
  type Num,
  type ScenarioVariantKey,
} from "@/lib/calc";
import { fmtMoney, fmtSignedMoney, MISSING } from "@/lib/format";
import type { ScenarioKindKey } from "./rules";

/**
 * Scenario kind metadata shared by the strategy card and the simulators.
 *
 * Everything here is pure. Numbers come exclusively from `@/lib/calc`; this
 * file only decides WHICH inputs a kind has and HOW each result line is
 * written out ("2 employees × € 19 × 26 days × 1 h"), so the card and the
 * simulator can never disagree about a number or its formula.
 */

export const VARIANT_LABELS: Record<ScenarioVariantKey, string> = {
  CONSERVATIVE: "Conservative",
  BASE: "Base",
  OPTIMISTIC: "Optimistic",
};

export const SCENARIO_DISCLAIMER = "SCENARIO BASED ON USER ASSUMPTIONS — NOT A FORECAST";

export type InputUnit = "money" | "pct" | "count" | "hours" | "days";

export interface ScenarioInputDef {
  key: string;
  label: string;
  unit: InputUnit;
  help?: string;
  /** Default placement: one value per variant (true) or one shared value (false). */
  perVariant: boolean;
  optional?: boolean;
  /** Render a slider next to the number field. */
  slider?: { min: number; max: number; step: number };
  step?: number;
}

export interface ResultLine {
  key: string;
  label: string;
  /** The arithmetic with the actual numbers, e.g. "2 employees × € 19 × 26 days × 1 h". */
  expr?: string;
  result: string;
  emphasis?: boolean;
  note?: string;
  /** Unrounded value from the calc engine (null when it cannot be computed). */
  value: number | null;
}

export interface ScenarioHeadline {
  /** What the number is, e.g. "contribution / month before other incremental costs". */
  label: string;
  /** Compact version for summary rows, e.g. "contribution / month". */
  short: string;
  value: number | null;
  text: string;
}

export interface ScenarioComputation {
  /** Empty when a required input is missing. */
  lines: ResultLine[];
  headline: ScenarioHeadline | null;
  /** One-sentence version of the main arithmetic for compact display. */
  sentence: string | null;
  /** Labels of required inputs that are missing or invalid. */
  missing: string[];
}

export type ScenarioValues = Record<string, Num>;
export type VariantValues = Record<ScenarioVariantKey, Record<string, number>>;

export interface ScenarioKindMeta {
  kind: ScenarioKindKey;
  label: string;
  description: string;
  inputs: ScenarioInputDef[];
  /** Shown under the results: what the arithmetic leaves out. */
  caveat: string;
}

// ── Number formatting for arithmetic lines ──────────────────────────────────

const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 0.005;

/** Money without decimals when the amount is whole, otherwise with cents: "€ 988", "€ 1,144.52". */
export function exprMoney(v: Num, currency: string): string {
  if (!isNum(v)) return MISSING;
  return fmtMoney(v, currency, isWhole(v) ? 0 : 2);
}

export function exprSignedMoney(v: Num, currency: string): string {
  if (!isNum(v)) return MISSING;
  return fmtSignedMoney(v, currency, isWhole(v) ? 0 : 2);
}

/** Plain number with up to `max` decimals and no trailing zeros: 10, 8.63, 1,030. */
export function exprNum(v: Num, max = 2): string {
  if (!isNum(v)) return MISSING;
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: max });
}

export function exprPct(v: Num): string {
  return isNum(v) ? `${exprNum(v, 2)}%` : MISSING;
}

export function exprMonths(v: Num): string {
  if (!isNum(v)) return MISSING;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} months`;
}

export const NO_PAYBACK = "No payback under these assumptions";

/** Whole units needed to reach at least `v` (transactions and customers cannot be fractional). */
export function roundUpWhole(v: Num): number | null {
  if (!isNum(v)) return null;
  // Guard against floating-point dust such as 6098.000000000001.
  return Math.ceil(Number(v.toFixed(6)));
}

// ── Opening-hours helper ────────────────────────────────────────────────────

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(time: string | null | undefined): number | null {
  const m = time ? TIME.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Additional opening hours per day = proposed closing time − current closing time.
 * Returns null when a time is missing/invalid or the proposed time is not later.
 */
export function additionalHoursBetween(currentClosing: string | null | undefined, proposedClosing: string | null | undefined): number | null {
  const a = minutesOf(currentClosing);
  const b = minutesOf(proposedClosing);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 60;
}

/** "19:00" + 1.5 h → "20:30". Null when the result would pass midnight or the input is invalid. */
export function addHoursToTime(time: string | null | undefined, hours: Num): string | null {
  const a = minutesOf(time);
  if (a === null || !isNum(hours)) return null;
  const t = Math.round(a + hours * 60);
  if (t < 0 || t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Decimal hour of day (19.5) ↔ "19:30"; used to store a closing time as a numeric scenario input. */
export function timeToDecimalHour(time: string | null | undefined): number | null {
  const a = minutesOf(time);
  return a === null ? null : a / 60;
}
export function decimalHourToTime(h: Num): string | null {
  return addHoursToTime("00:00", h);
}

// ── Kind metadata ───────────────────────────────────────────────────────────

const BASKET: ScenarioInputDef = { key: "averageBasket", label: "Average basket", unit: "money", perVariant: false, step: 0.1, help: "Value of one additional transaction." };
const MARGIN: ScenarioInputDef = { key: "grossMarginPct", label: "Gross margin", unit: "pct", perVariant: false, step: 0.1 };
const DAYS: ScenarioInputDef = { key: "daysPerMonth", label: "Open days / month", unit: "days", perVariant: false, step: 1 };

export const SCENARIO_KINDS: Record<ScenarioKindKey, ScenarioKindMeta> = {
  OPENING_HOURS: {
    kind: "OPENING_HOURS",
    label: "Extend opening hours",
    description: "Labor cost of additional opening hours against the gross profit of the customers you assume would come.",
    inputs: [
      { key: "additionalHoursPerDay", label: "Additional hours / day", unit: "hours", perVariant: false, step: 0.5, help: "Proposed closing time − current closing time." },
      { key: "additionalEmployees", label: "Additional employees", unit: "count", perVariant: false, step: 1, help: "Staff on shift during the added hours." },
      { key: "hourlyEmployeeCost", label: "Hourly employee cost", unit: "money", perVariant: false, step: 0.5, help: "Fully loaded cost per employee hour." },
      DAYS,
      { key: "additionalCustomersPerHour", label: "Expected additional customers / hour", unit: "count", perVariant: true, slider: { min: 0, max: 50, step: 1 }, step: 1, help: "Your assumption. Nobody knows this number before a test." },
      BASKET,
      MARGIN,
      { key: "otherMonthlyCost", label: "Other monthly cost", unit: "money", perVariant: false, optional: true, step: 10, help: "Energy, security, cleaning… Leave empty if none." },
    ],
    caveat: "Contribution is before any incremental cost not listed above, and it does not model customers who merely shift an existing visit to the later hour.",
  },
  TRANSACTION_UPLIFT: {
    kind: "TRANSACTION_UPLIFT",
    label: "Transaction uplift",
    description: "Generic: what a number of additional transactions per day would be worth at a given basket and margin.",
    inputs: [
      { key: "additionalTransactionsPerDay", label: "Additional transactions / day", unit: "count", perVariant: true, step: 1, help: "Your assumption." },
      BASKET,
      DAYS,
      MARGIN,
      { key: "monthlyCost", label: "Monthly cost of the measure", unit: "money", perVariant: false, optional: true, step: 10 },
      { key: "oneOffCost", label: "One-off cost", unit: "money", perVariant: false, optional: true, step: 50, help: "Fixtures, signage, set-up." },
    ],
    caveat: "Gross profit is before additional labor, waste, utilities and other incremental costs that are not entered above. Cannibalisation of existing sales is not modelled.",
  },
  COST_REDUCTION: {
    kind: "COST_REDUCTION",
    label: "Cost reduction",
    description: "What avoiding a share of a recurring cost would save, net of the cost of the measure.",
    inputs: [
      { key: "baselineMonthlyCost", label: "Baseline monthly cost", unit: "money", perVariant: false, step: 10, help: "The cost line you want to reduce." },
      { key: "reductionPct", label: "Assumed reduction", unit: "pct", perVariant: true, slider: { min: 0, max: 100, step: 1 }, step: 1, help: "Your assumption." },
      { key: "monthlyCost", label: "Monthly cost of the measure", unit: "money", perVariant: false, optional: true, step: 10 },
      { key: "oneOffCost", label: "One-off cost", unit: "money", perVariant: false, optional: true, step: 50 },
    ],
    caveat: "Only the avoided cost is counted. Side effects on revenue or margin are not modelled.",
  },
  BREAK_EVEN: {
    kind: "BREAK_EVEN",
    label: "Investment break-even",
    description: "How many additional transactions an investment needs to pay for itself.",
    inputs: [
      { key: "investment", label: "Investment", unit: "money", perVariant: false, step: 100 },
      { key: "contributionPerTransaction", label: "Contribution per additional transaction", unit: "money", perVariant: false, step: 0.1, help: "Average basket × gross margin." },
      { key: "additionalTransactionsPerMonth", label: "Additional transactions / month", unit: "count", perVariant: true, optional: true, step: 10, help: "Your assumption." },
      { key: "monthlyRunningCost", label: "Monthly running cost", unit: "money", perVariant: false, optional: true, step: 10 },
    ],
    caveat: "Required transactions ignore running costs; the payback period includes them. Financing cost and depreciation are not modelled.",
  },
  REVENUE_OPPORTUNITY: {
    kind: "REVENUE_OPPORTUNITY",
    label: "Revenue opportunity",
    description: "Revenue = Customers × Average Basket × Days, with a change in traffic and basket.",
    inputs: [
      { key: "customersPerDay", label: "Customers / day", unit: "count", perVariant: false, step: 10 },
      { key: "averageBasket", label: "Average basket", unit: "money", perVariant: false, step: 0.1 },
      { key: "days", label: "Days", unit: "days", perVariant: false, step: 1 },
      { key: "trafficChangePct", label: "Traffic change", unit: "pct", perVariant: true, step: 0.5 },
      { key: "basketChangePct", label: "Basket change", unit: "pct", perVariant: true, step: 0.5 },
      { key: "grossMarginPct", label: "Gross margin", unit: "pct", perVariant: false, optional: true, step: 0.1 },
      { key: "marginChangePts", label: "Margin change (pts)", unit: "pct", perVariant: true, optional: true, step: 0.1 },
    ],
    caveat: "Pure arithmetic on the entered changes. It says nothing about how such a change could be achieved.",
  },
};

/** Kinds offered in the simulator picker (break-even and revenue opportunity have their own tabs). */
export const SIMULATOR_KINDS: ScenarioKindKey[] = ["OPENING_HOURS", "TRANSACTION_UPLIFT", "COST_REDUCTION"];

/** Extra numeric inputs stored with a scenario that the calculators ignore. */
export const EXTRA_INPUT_KEYS = ["currentClosingHour"] as const;

export function allowedInputKeys(kind: ScenarioKindKey): string[] {
  return [...SCENARIO_KINDS[kind].inputs.map((i) => i.key), ...EXTRA_INPUT_KEYS];
}

function missingInputs(kind: ScenarioKindKey, v: ScenarioValues): string[] {
  return SCENARIO_KINDS[kind].inputs.filter((i) => !i.optional && !isNum(v[i.key])).map((i) => i.label);
}

const num = (v: Num): number => (isNum(v) ? v : 0);
const opt = (v: Num): number | undefined => (isNum(v) ? v : undefined);

function paybackLine(oneOff: number, monthly: number, payback: number | null, currency: string, monthlyLabel: string): ResultLine {
  return {
    key: "paybackMonths",
    label: "Approximate payback period",
    expr: `${exprMoney(oneOff, currency)} ÷ ${exprMoney(monthly, currency)}`,
    result: payback === null ? NO_PAYBACK : exprMonths(payback),
    note: payback === null ? `${monthlyLabel} is not positive, so the one-off cost is never recovered.` : undefined,
    value: payback,
  };
}

// ── Per-kind line builders ──────────────────────────────────────────────────

function openingHours(v: ScenarioValues, c: string): ScenarioComputation {
  const missing = missingInputs("OPENING_HOURS", v);
  const r = missing.length
    ? null
    : calculateOpeningHoursScenario({
        additionalHoursPerDay: num(v.additionalHoursPerDay),
        additionalEmployees: num(v.additionalEmployees),
        hourlyEmployeeCost: num(v.hourlyEmployeeCost),
        daysPerMonth: num(v.daysPerMonth),
        additionalCustomersPerHour: num(v.additionalCustomersPerHour),
        averageBasket: num(v.averageBasket),
        grossMarginPct: num(v.grossMarginPct),
        otherMonthlyCost: opt(v.otherMonthlyCost),
      });
  if (!r) return { lines: [], headline: null, sentence: null, missing };
  const h = num(v.additionalHoursPerDay);
  const days = num(v.daysPerMonth);
  const lines: ResultLine[] = [
    {
      key: "additionalLaborCost",
      label: "Additional labor cost / month",
      expr: `${exprNum(v.additionalEmployees)} employees × ${exprMoney(v.hourlyEmployeeCost, c)} × ${exprNum(days)} days × ${exprNum(h)} h`,
      result: exprMoney(r.additionalLaborCost, c),
      value: r.additionalLaborCost,
    },
  ];
  if (r.otherMonthlyCost !== 0) {
    lines.push({
      key: "totalAdditionalCost",
      label: "Total additional cost / month",
      expr: `${exprMoney(r.additionalLaborCost, c)} + ${exprMoney(r.otherMonthlyCost, c)} other`,
      result: exprMoney(r.totalAdditionalCost, c),
      value: r.totalAdditionalCost,
    });
  }
  if (h !== 1) {
    lines.push({
      key: "additionalCustomersPerDay",
      label: "Additional customers / day",
      expr: `${exprNum(v.additionalCustomersPerHour)} per hour × ${exprNum(h)} h`,
      result: exprNum(r.additionalCustomersPerDay),
      value: r.additionalCustomersPerDay,
    });
  }
  lines.push(
    {
      key: "additionalRevenue",
      label: "Potential additional revenue / month",
      expr: `${exprNum(r.additionalCustomersPerDay)} customers × ${exprMoney(v.averageBasket, c)} × ${exprNum(days)} days`,
      result: exprMoney(r.additionalRevenue, c),
      value: r.additionalRevenue,
    },
    {
      key: "additionalGrossProfit",
      label: "Potential gross profit / month",
      expr: `${exprMoney(r.additionalRevenue, c)} × ${exprPct(v.grossMarginPct)}`,
      result: exprMoney(r.additionalGrossProfit, c),
      value: r.additionalGrossProfit,
    },
    {
      key: "breakEvenRevenue",
      label: "Break-even revenue / month",
      expr: `${exprMoney(r.totalAdditionalCost, c)} ÷ ${exprPct(v.grossMarginPct)}`,
      result: r.breakEvenRevenue === null ? MISSING : fmtMoney(r.breakEvenRevenue, c, 2),
      value: r.breakEvenRevenue,
    },
    {
      key: "breakEvenCustomersPerDay",
      label: "Break-even customers / day",
      expr: `${exprMoney(r.totalAdditionalCost, c)} ÷ (${exprMoney(v.averageBasket, c)} × ${exprPct(v.grossMarginPct)} × ${exprNum(days)} days)`,
      result: exprNum(r.breakEvenCustomersPerDay),
      note:
        r.breakEvenCustomersPerDay === null
          ? "Cannot be computed with a basket or margin of zero."
          : `At least ${exprNum(roundUpWhole(r.breakEvenCustomersPerDay), 0)} additional customers per day cover the additional cost.`,
      value: r.breakEvenCustomersPerDay,
    },
    {
      key: "estimatedContribution",
      label: "Estimated contribution / month",
      expr: `${exprMoney(r.additionalGrossProfit, c)} − ${exprMoney(r.totalAdditionalCost, c)}`,
      result: exprMoney(r.estimatedContribution, c),
      emphasis: true,
      note: "Before other incremental costs.",
      value: r.estimatedContribution,
    },
  );
  return {
    lines,
    missing,
    headline: {
      label: "estimated contribution / month, before other incremental costs",
      short: "contribution / month",
      value: r.estimatedContribution,
      text: exprMoney(r.estimatedContribution, c),
    },
    sentence:
      `${exprNum(v.additionalEmployees)} employees × ${exprMoney(v.hourlyEmployeeCost, c)} × ${exprNum(days)} days × ${exprNum(h)} h = ${exprMoney(r.additionalLaborCost, c)}/month additional labor cost; ` +
      `${exprNum(r.additionalCustomersPerDay)} customers × ${exprMoney(v.averageBasket, c)} × ${exprNum(days)} = ${exprMoney(r.additionalRevenue, c)}/month additional revenue; ` +
      `at ${exprPct(v.grossMarginPct)} gross margin: ${exprMoney(r.additionalGrossProfit, c)}/month gross profit; ` +
      `contribution ${exprMoney(r.estimatedContribution, c)}/month before other incremental costs`,
  };
}

function transactionUplift(v: ScenarioValues, c: string): ScenarioComputation {
  const missing = missingInputs("TRANSACTION_UPLIFT", v);
  const r = missing.length
    ? null
    : calculateTransactionUplift({
        additionalTransactionsPerDay: num(v.additionalTransactionsPerDay),
        averageBasket: num(v.averageBasket),
        daysPerMonth: num(v.daysPerMonth),
        grossMarginPct: num(v.grossMarginPct),
        monthlyCost: opt(v.monthlyCost),
        oneOffCost: opt(v.oneOffCost),
      });
  if (!r) return { lines: [], headline: null, sentence: null, missing };
  const monthlyCost = num(v.monthlyCost);
  const oneOff = num(v.oneOffCost);
  const before = "Before additional labor, waste, utilities and other incremental costs.";
  const lines: ResultLine[] = [
    {
      key: "additionalRevenue",
      label: "Potential additional revenue / month",
      expr: `${exprNum(v.additionalTransactionsPerDay)} × ${exprMoney(v.averageBasket, c)} × ${exprNum(v.daysPerMonth)} days`,
      result: exprMoney(r.additionalRevenue, c),
      value: r.additionalRevenue,
    },
    {
      key: "additionalGrossProfit",
      label: "Potential gross profit / month",
      expr: `${exprMoney(r.additionalRevenue, c)} × ${exprPct(v.grossMarginPct)}`,
      result: exprMoney(r.additionalGrossProfit, c),
      emphasis: monthlyCost === 0,
      note: monthlyCost === 0 ? before : undefined,
      value: r.additionalGrossProfit,
    },
  ];
  if (monthlyCost !== 0) {
    lines.push({
      key: "monthlyContribution",
      label: "Contribution / month",
      expr: `${exprMoney(r.additionalGrossProfit, c)} − ${exprMoney(monthlyCost, c)}`,
      result: exprMoney(r.monthlyContribution, c),
      emphasis: true,
      note: "After the monthly cost entered above; before other incremental costs.",
      value: r.monthlyContribution,
    });
  }
  if (oneOff > 0) lines.push(paybackLine(oneOff, r.monthlyContribution, r.paybackMonths, c, "Monthly contribution"));
  return {
    lines,
    missing,
    headline: {
      label: monthlyCost === 0 ? "gross profit / month, before other incremental costs" : "contribution / month after the listed monthly cost",
      short: monthlyCost === 0 ? "gross profit / month" : "contribution / month",
      value: r.monthlyContribution,
      text: exprMoney(r.monthlyContribution, c),
    },
    sentence:
      `${exprNum(v.additionalTransactionsPerDay)} × ${exprMoney(v.averageBasket, c)} × ${exprNum(v.daysPerMonth)} = ${exprMoney(r.additionalRevenue, c)}/month additional revenue; ` +
      `at ${exprPct(v.grossMarginPct)} gross margin: ${exprMoney(r.additionalGrossProfit, c)}/month gross profit before additional labor, waste, utilities and other incremental costs`,
  };
}

function costReduction(v: ScenarioValues, c: string): ScenarioComputation {
  const missing = missingInputs("COST_REDUCTION", v);
  const r = missing.length
    ? null
    : calculateCostReduction({
        baselineMonthlyCost: num(v.baselineMonthlyCost),
        reductionPct: num(v.reductionPct),
        monthlyCost: opt(v.monthlyCost),
        oneOffCost: opt(v.oneOffCost),
      });
  if (!r) return { lines: [], headline: null, sentence: null, missing };
  const monthlyCost = num(v.monthlyCost);
  const oneOff = num(v.oneOffCost);
  const lines: ResultLine[] = [
    {
      key: "grossSaving",
      label: "Avoided cost / month",
      expr: `${exprMoney(v.baselineMonthlyCost, c)} × ${exprPct(v.reductionPct)}`,
      result: exprMoney(r.grossSaving, c),
      value: r.grossSaving,
    },
    {
      key: "netMonthlySaving",
      label: "Net saving / month",
      expr: `${exprMoney(r.grossSaving, c)} − ${exprMoney(monthlyCost, c)}`,
      result: exprMoney(r.netMonthlySaving, c),
      emphasis: true,
      note: "After the monthly cost of the measure; side effects on revenue or margin are not modelled.",
      value: r.netMonthlySaving,
    },
  ];
  if (oneOff > 0) lines.push(paybackLine(oneOff, r.netMonthlySaving, r.paybackMonths, c, "Net monthly saving"));
  return {
    lines,
    missing,
    headline: { label: "net saving / month after the cost of the measure", short: "net saving / month", value: r.netMonthlySaving, text: exprMoney(r.netMonthlySaving, c) },
    sentence:
      `${exprMoney(v.baselineMonthlyCost, c)} × ${exprPct(v.reductionPct)} = ${exprMoney(r.grossSaving, c)}/month avoided cost; ` +
      `minus ${exprMoney(monthlyCost, c)}/month for the measure: ${exprMoney(r.netMonthlySaving, c)}/month net saving`,
  };
}

function investmentBreakEven(v: ScenarioValues, c: string): ScenarioComputation {
  const missing = missingInputs("BREAK_EVEN", v);
  if (!missing.length && num(v.contributionPerTransaction) <= 0) missing.push("Contribution per additional transaction (must be above 0)");
  const r = missing.length
    ? null
    : calculateInvestmentBreakEven({
        investment: num(v.investment),
        contributionPerTransaction: num(v.contributionPerTransaction),
        additionalTransactionsPerMonth: opt(v.additionalTransactionsPerMonth),
        monthlyRunningCost: opt(v.monthlyRunningCost),
      });
  if (!r) return { lines: [], headline: null, sentence: null, missing };
  const running = num(v.monthlyRunningCost);
  const required = roundUpWhole(r.requiredTransactions);
  const lines: ResultLine[] = [
    {
      key: "requiredTransactions",
      label: "Required additional transactions",
      expr: `${exprMoney(v.investment, c)} ÷ ${exprMoney(v.contributionPerTransaction, c)}`,
      result: exprNum(required, 0),
      note: `${exprNum(r.requiredTransactions, 2)} rounded up to whole transactions. Ignores running cost.`,
      value: required,
    },
  ];
  if (r.monthlyContribution !== null) {
    lines.push(
      {
        key: "monthlyContribution",
        label: "Monthly contribution",
        expr: `${exprNum(v.additionalTransactionsPerMonth)} × ${exprMoney(v.contributionPerTransaction, c)} − ${exprMoney(running, c)}`,
        result: exprMoney(r.monthlyContribution, c),
        value: r.monthlyContribution,
      },
      {
        key: "paybackMonths",
        label: "Approximate payback period",
        expr: `${exprMoney(v.investment, c)} ÷ ${exprMoney(r.monthlyContribution, c)}`,
        result: r.paybackMonths === null ? NO_PAYBACK : exprMonths(r.paybackMonths),
        emphasis: true,
        note: r.paybackMonths === null ? "Monthly contribution is not positive, so the investment is never recovered." : undefined,
        value: r.paybackMonths,
      },
    );
  }
  return {
    lines,
    missing,
    headline:
      r.monthlyContribution === null
        ? { label: "additional transactions required to recover the investment", short: "transactions to break even", value: required, text: exprNum(required, 0) }
        : { label: "approximate payback period", short: "payback", value: r.paybackMonths, text: r.paybackMonths === null ? NO_PAYBACK : exprMonths(r.paybackMonths) },
    sentence: `${exprMoney(v.investment, c)} ÷ ${exprMoney(v.contributionPerTransaction, c)} = ${exprNum(required, 0)} additional transactions (rounded up) to recover the investment`,
  };
}

function revenueOpportunity(v: ScenarioValues, c: string): ScenarioComputation {
  const missing = missingInputs("REVENUE_OPPORTUNITY", v);
  const r = missing.length
    ? null
    : calculateRevenueOpportunity({
        customersPerDay: num(v.customersPerDay),
        averageBasket: num(v.averageBasket),
        days: num(v.days),
        trafficChangePct: num(v.trafficChangePct),
        basketChangePct: num(v.basketChangePct),
        grossMarginPct: opt(v.grossMarginPct),
        marginChangePts: opt(v.marginChangePts),
      });
  if (!r) return { lines: [], headline: null, sentence: null, missing };
  const days = exprNum(v.days);
  const dC = r.newCustomersPerDay - num(v.customersPerDay);
  const dB = r.newBasket - num(v.averageBasket);
  const lines: ResultLine[] = [
    {
      key: "currentRevenue",
      label: "Current revenue",
      expr: `${exprNum(v.customersPerDay)} customers/day × ${exprMoney(v.averageBasket, c)} × ${days}`,
      result: exprMoney(r.currentRevenue, c),
      value: r.currentRevenue,
    },
    {
      key: "scenarioRevenue",
      label: "Scenario revenue",
      expr: `${exprNum(r.newCustomersPerDay)} × ${exprMoney(r.newBasket, c)} × ${days}`,
      result: exprMoney(r.scenarioRevenue, c),
      value: r.scenarioRevenue,
    },
    {
      key: "trafficEffect",
      label: "Traffic effect",
      expr: `${exprNum(dC)} customers × ${exprMoney(v.averageBasket, c)} × ${days}`,
      result: exprSignedMoney(r.trafficEffect, c),
      note: "Traffic change alone, basket held constant.",
      value: r.trafficEffect,
    },
    {
      key: "basketEffect",
      label: "Basket effect",
      expr: `${exprNum(v.customersPerDay)} customers × ${exprMoney(dB, c)} × ${days}`,
      result: exprSignedMoney(r.basketEffect, c),
      note: "Basket change alone, traffic held constant.",
      value: r.basketEffect,
    },
    {
      key: "interactionEffect",
      label: "Interaction effect",
      expr: `${exprNum(dC)} customers × ${exprMoney(dB, c)} × ${days}`,
      result: exprSignedMoney(r.interactionEffect, c),
      note: "Exists only because both changed together.",
      value: r.interactionEffect,
    },
    {
      key: "revenueDifference",
      label: "Revenue difference",
      expr: `${exprMoney(r.scenarioRevenue, c)} − ${exprMoney(r.currentRevenue, c)}`,
      result: exprSignedMoney(r.revenueDifference, c),
      emphasis: true,
      value: r.revenueDifference,
    },
  ];
  if (r.currentGrossProfit !== null && r.scenarioGrossProfit !== null) {
    const newMargin = num(v.grossMarginPct) + num(v.marginChangePts);
    lines.push(
      {
        key: "currentGrossProfit",
        label: "Current gross profit",
        expr: `${exprMoney(r.currentRevenue, c)} × ${exprPct(v.grossMarginPct)}`,
        result: exprMoney(r.currentGrossProfit, c),
        value: r.currentGrossProfit,
      },
      {
        key: "scenarioGrossProfit",
        label: "Scenario gross profit",
        expr: `${exprMoney(r.scenarioRevenue, c)} × ${exprPct(newMargin)}`,
        result: exprMoney(r.scenarioGrossProfit, c),
        value: r.scenarioGrossProfit,
      },
      {
        key: "grossProfitDifference",
        label: "Gross profit difference",
        expr: `${exprMoney(r.scenarioGrossProfit, c)} − ${exprMoney(r.currentGrossProfit, c)}`,
        result: exprSignedMoney(r.grossProfitDifference, c),
        emphasis: true,
        value: r.grossProfitDifference,
      },
    );
  }
  return {
    lines,
    missing,
    headline: { label: "revenue difference for the period", short: "revenue difference", value: r.revenueDifference, text: exprSignedMoney(r.revenueDifference, c) },
    sentence:
      `Current: ${exprNum(v.customersPerDay)} customers/day × ${exprMoney(v.averageBasket, c)} × ${days} = ${exprMoney(r.currentRevenue, c)}; ` +
      `scenario: ${exprNum(r.newCustomersPerDay)} × ${exprMoney(r.newBasket, c)} × ${days} = ${exprMoney(r.scenarioRevenue, c)}`,
  };
}

/** Result lines, headline and summary sentence for one variant of a scenario. */
export function computeScenario(kind: ScenarioKindKey, values: ScenarioValues, currency: string): ScenarioComputation {
  switch (kind) {
    case "OPENING_HOURS": return openingHours(values, currency);
    case "TRANSACTION_UPLIFT": return transactionUplift(values, currency);
    case "COST_REDUCTION": return costReduction(values, currency);
    case "BREAK_EVEN": return investmentBreakEven(values, currency);
    case "REVENUE_OPPORTUNITY": return revenueOpportunity(values, currency);
  }
}

// ── Standalone calculators (break-even and opportunity tabs) ────────────────

/** Contribution per additional transaction = Average basket × Gross margin. */
export function contributionPerTransaction(averageBasket: Num, grossMarginPct: Num): number | null {
  if (!isNum(averageBasket) || !isNum(grossMarginPct)) return null;
  return averageBasket * (grossMarginPct / 100);
}

/** Monthly-cost break-even: revenue and customers per day needed to cover an additional monthly cost. */
export function monthlyCostBreakEvenLines(
  v: { additionalMonthlyCost: Num; averageBasket: Num; grossMarginPct: Num; daysPerMonth: Num },
  c: string,
): ResultLine[] {
  const revenue = calculateBreakEvenRevenue(v.additionalMonthlyCost, v.grossMarginPct);
  const customers = calculateBreakEvenCustomers(v.additionalMonthlyCost, v.averageBasket, v.grossMarginPct, v.daysPerMonth);
  const lines: ResultLine[] = [];
  if (revenue !== null) {
    lines.push({
      key: "breakEvenRevenue",
      label: "Break-even revenue / month",
      expr: `${exprMoney(v.additionalMonthlyCost, c)} ÷ ${exprPct(v.grossMarginPct)}`,
      result: fmtMoney(revenue, c, 2),
      value: revenue,
    });
  }
  if (customers !== null) {
    lines.push({
      key: "breakEvenCustomersPerDay",
      label: "Break-even customers / day",
      expr: `${exprMoney(v.additionalMonthlyCost, c)} ÷ (${exprMoney(v.averageBasket, c)} × ${exprPct(v.grossMarginPct)} × ${exprNum(v.daysPerMonth)} days)`,
      result: exprNum(customers),
      emphasis: true,
      note: `At least ${exprNum(roundUpWhole(customers), 0)} additional customers per day cover the additional cost.`,
      value: customers,
    });
  }
  return lines;
}

/** "Basket + € 0.50" calculation at constant transaction volume. */
export function basketChangeLines(v: { transactionsPerMonth: Num; averageBasket: Num; basketDelta: Num }, c: string): ResultLine[] {
  const r = calculateBasketChange(v.transactionsPerMonth, v.averageBasket, v.basketDelta);
  if (!r) return [];
  const tx = exprNum(v.transactionsPerMonth);
  return [
    { key: "currentRevenue", label: "Current revenue / month", expr: `${tx} × ${exprMoney(v.averageBasket, c)}`, result: exprMoney(r.currentRevenue, c), value: r.currentRevenue },
    { key: "scenarioRevenue", label: "Scenario revenue / month", expr: `${tx} × ${exprMoney(r.newBasket, c)}`, result: exprMoney(r.scenarioRevenue, c), value: r.scenarioRevenue },
    { key: "monthlyDifference", label: "Difference / month", expr: `${tx} × ${exprMoney(v.basketDelta, c)}`, result: exprSignedMoney(r.monthlyDifference, c), emphasis: true, value: r.monthlyDifference },
    { key: "annualizedDifference", label: "Difference × 12 months", expr: `${exprMoney(r.monthlyDifference, c)} × 12`, result: exprSignedMoney(r.annualizedDifference, c), note: "Simple multiplication by 12; seasonality is ignored.", value: r.annualizedDifference },
  ];
}

// ── Variant helpers ─────────────────────────────────────────────────────────

/** Groups stored ScenarioInput rows into one record per variant. */
export function variantsFromRows(rows: readonly { variant: ScenarioVariantKey; key: string; value: number }[]): VariantValues {
  const out: VariantValues = { CONSERVATIVE: {}, BASE: {}, OPTIMISTIC: {} };
  for (const r of rows) out[r.variant][r.key] = r.value;
  return out;
}

/**
 * Keys whose value differs between variants (or that the kind defines as
 * per-variant). Everything else can be edited once and shared.
 */
export function varyingKeys(kind: ScenarioKindKey, variants: VariantValues): string[] {
  return SCENARIO_KINDS[kind].inputs
    .filter((i) => {
      if (i.perVariant) return true;
      const vals = SCENARIO_VARIANTS.map((v) => variants[v][i.key]);
      return vals.some((x) => x !== vals[0]);
    })
    .map((i) => i.key);
}

/** Parses a user-typed number ("14,20" or "14.20"); empty / invalid → null. Never falls back to 0. */
export function parseInputNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Formats an input value according to its unit, for assumption tables. */
export function formatInputValue(def: Pick<ScenarioInputDef, "unit">, value: Num, currency: string): string {
  if (!isNum(value)) return MISSING;
  switch (def.unit) {
    case "money": return exprMoney(value, currency);
    case "pct": return exprPct(value);
    case "hours": return `${exprNum(value)} h`;
    case "days": return `${exprNum(value)} days`;
    case "count": return exprNum(value);
  }
}
