import { isNum, type Num } from "./kpi";

/**
 * Scenario calculators. Every output here is "SCENARIO BASED ON USER
 * ASSUMPTIONS — NOT A FORECAST". Functions return null when an input is missing.
 */

/** Revenue = Customers/day × Average Basket × Days */
export function calculateScenarioRevenue(customersPerDay: Num, averageBasket: Num, days: Num): number | null {
  if (!isNum(customersPerDay) || !isNum(averageBasket) || !isNum(days)) return null;
  return customersPerDay * averageBasket * days;
}

/** Break-even Revenue = Additional Cost / Gross Margin */
export function calculateBreakEvenRevenue(additionalCost: Num, grossMarginPct: Num): number | null {
  if (!isNum(additionalCost) || !isNum(grossMarginPct) || grossMarginPct <= 0) return null;
  return additionalCost / (grossMarginPct / 100);
}

/**
 * Break-even additional customers per day
 *   = Additional monthly cost / (Average Basket × Gross Margin × Days per month)
 */
export function calculateBreakEvenCustomers(
  additionalMonthlyCost: Num,
  averageBasket: Num,
  grossMarginPct: Num,
  daysPerMonth: Num,
): number | null {
  if (!isNum(additionalMonthlyCost) || !isNum(averageBasket) || !isNum(grossMarginPct) || !isNum(daysPerMonth)) {
    return null;
  }
  const contributionPerCustomerPerMonth = averageBasket * (grossMarginPct / 100) * daysPerMonth;
  if (contributionPerCustomerPerMonth <= 0) return null;
  return additionalMonthlyCost / contributionPerCustomerPerMonth;
}

// ── Extended opening hours ───────────────────────────────────────────────────

export interface OpeningHoursInput {
  additionalHoursPerDay: number;
  additionalEmployees: number;
  hourlyEmployeeCost: number;
  daysPerMonth: number;
  /** Assumption: additional customers per additional opening hour. */
  additionalCustomersPerHour: number;
  averageBasket: number;
  grossMarginPct: number;
  /** Any other monthly incremental cost the user wants to include (energy, security…). */
  otherMonthlyCost?: number;
}

export interface OpeningHoursResult {
  additionalLaborCost: number;
  otherMonthlyCost: number;
  totalAdditionalCost: number;
  additionalCustomersPerDay: number;
  additionalRevenue: number;
  additionalGrossProfit: number;
  /** Gross profit − additional cost. Before any cost not listed in the inputs. */
  estimatedContribution: number;
  breakEvenRevenue: number | null;
  breakEvenCustomersPerDay: number | null;
}

/**
 * Additional labor cost = employees × hourly cost × additional hours/day × days/month
 * Additional revenue    = additional customers/day × basket × days/month
 * Gross profit          = additional revenue × gross margin
 * Contribution          = gross profit − additional cost
 */
export function calculateOpeningHoursScenario(i: OpeningHoursInput): OpeningHoursResult | null {
  const required = [
    i.additionalHoursPerDay,
    i.additionalEmployees,
    i.hourlyEmployeeCost,
    i.daysPerMonth,
    i.additionalCustomersPerHour,
    i.averageBasket,
    i.grossMarginPct,
  ];
  if (!required.every(isNum)) return null;
  const other = isNum(i.otherMonthlyCost) ? i.otherMonthlyCost : 0;
  const additionalLaborCost = i.additionalEmployees * i.hourlyEmployeeCost * i.additionalHoursPerDay * i.daysPerMonth;
  const totalAdditionalCost = additionalLaborCost + other;
  const additionalCustomersPerDay = i.additionalCustomersPerHour * i.additionalHoursPerDay;
  const additionalRevenue = additionalCustomersPerDay * i.averageBasket * i.daysPerMonth;
  const additionalGrossProfit = additionalRevenue * (i.grossMarginPct / 100);
  return {
    additionalLaborCost,
    otherMonthlyCost: other,
    totalAdditionalCost,
    additionalCustomersPerDay,
    additionalRevenue,
    additionalGrossProfit,
    estimatedContribution: additionalGrossProfit - totalAdditionalCost,
    breakEvenRevenue: calculateBreakEvenRevenue(totalAdditionalCost, i.grossMarginPct),
    breakEvenCustomersPerDay: calculateBreakEvenCustomers(
      totalAdditionalCost,
      i.averageBasket,
      i.grossMarginPct,
      i.daysPerMonth,
    ),
  };
}

// ── Generic transaction uplift (strategy cards) ─────────────────────────────

export interface TransactionUpliftInput {
  additionalTransactionsPerDay: number;
  averageBasket: number;
  daysPerMonth: number;
  grossMarginPct: number;
  /** Recurring monthly cost of running the change. */
  monthlyCost?: number;
  /** One-off cost (fixtures, signage…). */
  oneOffCost?: number;
}

export interface TransactionUpliftResult {
  additionalRevenue: number;
  additionalGrossProfit: number;
  monthlyContribution: number;
  /** Months until cumulative contribution covers the one-off cost; null if never or no one-off cost. */
  paybackMonths: number | null;
}

export function calculateTransactionUplift(i: TransactionUpliftInput): TransactionUpliftResult | null {
  if (![i.additionalTransactionsPerDay, i.averageBasket, i.daysPerMonth, i.grossMarginPct].every(isNum)) return null;
  const additionalRevenue = i.additionalTransactionsPerDay * i.averageBasket * i.daysPerMonth;
  const additionalGrossProfit = additionalRevenue * (i.grossMarginPct / 100);
  const monthlyContribution = additionalGrossProfit - (isNum(i.monthlyCost) ? i.monthlyCost : 0);
  const oneOff = isNum(i.oneOffCost) ? i.oneOffCost : 0;
  return {
    additionalRevenue,
    additionalGrossProfit,
    monthlyContribution,
    paybackMonths: oneOff > 0 && monthlyContribution > 0 ? oneOff / monthlyContribution : null,
  };
}

// ── Investment break-even ───────────────────────────────────────────────────

export interface InvestmentBreakEvenInput {
  investment: number;
  /** Contribution (gross profit) per additional transaction. */
  contributionPerTransaction: number;
  /** Assumption: additional transactions per month attributable to the investment. */
  additionalTransactionsPerMonth?: number;
  /** Recurring monthly cost caused by the investment (maintenance, lease…). */
  monthlyRunningCost?: number;
}

export interface InvestmentBreakEvenResult {
  /** Investment / contribution per transaction. Ignores running costs. */
  requiredTransactions: number;
  monthlyContribution: number | null;
  /** Investment / (monthly contribution − running cost). Null if not positive or volume not given. */
  paybackMonths: number | null;
}

/**
 * Required additional transactions = Investment / Contribution per transaction
 * Payback (months) = Investment / (transactions per month × contribution − monthly running cost)
 */
export function calculateInvestmentBreakEven(i: InvestmentBreakEvenInput): InvestmentBreakEvenResult | null {
  if (!isNum(i.investment) || !isNum(i.contributionPerTransaction) || i.contributionPerTransaction <= 0) return null;
  const requiredTransactions = i.investment / i.contributionPerTransaction;
  let monthlyContribution: number | null = null;
  let paybackMonths: number | null = null;
  if (isNum(i.additionalTransactionsPerMonth)) {
    monthlyContribution =
      i.additionalTransactionsPerMonth * i.contributionPerTransaction -
      (isNum(i.monthlyRunningCost) ? i.monthlyRunningCost : 0);
    paybackMonths = monthlyContribution > 0 ? i.investment / monthlyContribution : null;
  }
  return { requiredTransactions, monthlyContribution, paybackMonths };
}

// ── Revenue opportunity (traffic × basket decomposition) ────────────────────

export interface RevenueOpportunityInput {
  customersPerDay: number;
  averageBasket: number;
  days: number;
  trafficChangePct: number;
  basketChangePct: number;
  /** Optional: current gross margin and a change in percentage points. */
  grossMarginPct?: number;
  marginChangePts?: number;
}

export interface RevenueOpportunityResult {
  currentRevenue: number;
  newCustomersPerDay: number;
  newBasket: number;
  scenarioRevenue: number;
  revenueDifference: number;
  /** Effect of traffic alone, basket held constant. */
  trafficEffect: number;
  /** Effect of basket alone, traffic held constant. */
  basketEffect: number;
  /** Remaining part that only exists because both changed together. */
  interactionEffect: number;
  currentGrossProfit: number | null;
  scenarioGrossProfit: number | null;
  grossProfitDifference: number | null;
  /** Gross-profit effect of the margin change alone, at current revenue. */
  marginEffect: number | null;
}

/**
 * Revenue = Customers × Average Basket × Days.
 * Decomposition: ΔRevenue = traffic effect + basket effect + interaction, where
 *   traffic effect = ΔCustomers × Basket × Days
 *   basket effect  = Customers × ΔBasket × Days
 *   interaction    = ΔCustomers × ΔBasket × Days
 */
export function calculateRevenueOpportunity(i: RevenueOpportunityInput): RevenueOpportunityResult | null {
  if (![i.customersPerDay, i.averageBasket, i.days, i.trafficChangePct, i.basketChangePct].every(isNum)) return null;
  const currentRevenue = i.customersPerDay * i.averageBasket * i.days;
  const dCustomers = i.customersPerDay * (i.trafficChangePct / 100);
  const dBasket = i.averageBasket * (i.basketChangePct / 100);
  const newCustomersPerDay = i.customersPerDay + dCustomers;
  const newBasket = i.averageBasket + dBasket;
  const scenarioRevenue = newCustomersPerDay * newBasket * i.days;
  const trafficEffect = dCustomers * i.averageBasket * i.days;
  const basketEffect = i.customersPerDay * dBasket * i.days;
  const interactionEffect = dCustomers * dBasket * i.days;

  let currentGrossProfit: number | null = null;
  let scenarioGrossProfit: number | null = null;
  let marginEffect: number | null = null;
  if (isNum(i.grossMarginPct)) {
    const pts = isNum(i.marginChangePts) ? i.marginChangePts : 0;
    currentGrossProfit = currentRevenue * (i.grossMarginPct / 100);
    scenarioGrossProfit = scenarioRevenue * ((i.grossMarginPct + pts) / 100);
    marginEffect = currentRevenue * (pts / 100);
  }
  return {
    currentRevenue,
    newCustomersPerDay,
    newBasket,
    scenarioRevenue,
    revenueDifference: scenarioRevenue - currentRevenue,
    trafficEffect,
    basketEffect,
    interactionEffect,
    currentGrossProfit,
    scenarioGrossProfit,
    grossProfitDifference:
      currentGrossProfit !== null && scenarioGrossProfit !== null ? scenarioGrossProfit - currentGrossProfit : null,
    marginEffect,
  };
}

// ── Basket change at constant volume (analyst example, section 31) ──────────

export interface BasketChangeResult {
  currentRevenue: number;
  newBasket: number;
  scenarioRevenue: number;
  monthlyDifference: number;
  annualizedDifference: number;
}

/** Scenario revenue = Transactions × (Basket + Δ). Assumes transaction volume is unchanged. */
export function calculateBasketChange(
  transactionsPerMonth: Num,
  averageBasket: Num,
  basketDelta: Num,
): BasketChangeResult | null {
  if (!isNum(transactionsPerMonth) || !isNum(averageBasket) || !isNum(basketDelta)) return null;
  const currentRevenue = transactionsPerMonth * averageBasket;
  const newBasket = averageBasket + basketDelta;
  const scenarioRevenue = transactionsPerMonth * newBasket;
  const monthlyDifference = scenarioRevenue - currentRevenue;
  return { currentRevenue, newBasket, scenarioRevenue, monthlyDifference, annualizedDifference: monthlyDifference * 12 };
}

export const SCENARIO_VARIANTS = ["CONSERVATIVE", "BASE", "OPTIMISTIC"] as const;
export type ScenarioVariantKey = (typeof SCENARIO_VARIANTS)[number];

// ── Cost reduction ──────────────────────────────────────────────────────────

export interface CostReductionInput {
  baselineMonthlyCost: number;
  /** Assumption: share of the baseline cost that is avoided (%). */
  reductionPct: number;
  /** Recurring monthly cost of the measure itself. */
  monthlyCost?: number;
  oneOffCost?: number;
}

export interface CostReductionResult {
  grossSaving: number;
  netMonthlySaving: number;
  paybackMonths: number | null;
}

/** Net saving = Baseline cost × Reduction % − Monthly cost of the measure */
export function calculateCostReduction(i: CostReductionInput): CostReductionResult | null {
  if (!isNum(i.baselineMonthlyCost) || !isNum(i.reductionPct)) return null;
  const grossSaving = i.baselineMonthlyCost * (i.reductionPct / 100);
  const netMonthlySaving = grossSaving - (isNum(i.monthlyCost) ? i.monthlyCost : 0);
  const oneOff = isNum(i.oneOffCost) ? i.oneOffCost : 0;
  return {
    grossSaving,
    netMonthlySaving,
    paybackMonths: oneOff > 0 && netMonthlySaving > 0 ? oneOff / netMonthlySaving : null,
  };
}
