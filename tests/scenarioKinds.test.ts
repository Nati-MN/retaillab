import { describe, expect, it } from "vitest";
import {
  calculateCostReduction,
  calculateInvestmentBreakEven,
  calculateOpeningHoursScenario,
  calculateRevenueOpportunity,
  calculateTransactionUplift,
} from "@/lib/calc";
import {
  additionalHoursBetween,
  addHoursToTime,
  allowedInputKeys,
  basketChangeLines,
  computeScenario,
  contributionPerTransaction,
  decimalHourToTime,
  exprMoney,
  monthlyCostBreakEvenLines,
  NO_PAYBACK,
  parseInputNumber,
  roundUpWhole,
  SCENARIO_KINDS,
  SIMULATOR_KINDS,
  timeToDecimalHour,
  variantsFromRows,
  varyingKeys,
} from "@/lib/strategy/scenarioKinds";
import { storePrefillFromKpis } from "@/lib/strategy/prefill";
import type { Kpis } from "@/lib/analytics/types";

const line = (c: ReturnType<typeof computeScenario>, key: string) => {
  const l = c.lines.find((x) => x.key === key);
  if (!l) throw new Error(`line ${key} missing`);
  return l;
};
// fmtMoney separates symbol and digits with a no-break space.
const eur = (s: string) => `€ ${s}`;

describe("opening hours — spec example", () => {
  const input = {
    additionalHoursPerDay: 1, additionalEmployees: 2, hourlyEmployeeCost: 19, daysPerMonth: 26,
    additionalCustomersPerHour: 10, averageBasket: 14.2, grossMarginPct: 31,
  };
  const c = computeScenario("OPENING_HOURS", input, "EUR");
  const engine = calculateOpeningHoursScenario(input)!;

  it("labor cost line: 2 employees × € 19 × 26 days × 1 h = € 988", () => {
    const l = line(c, "additionalLaborCost");
    expect(l.expr).toBe(`2 employees × ${eur("19")} × 26 days × 1 h`);
    expect(l.result).toBe(eur("988"));
    expect(l.value).toBe(engine.additionalLaborCost);
  });
  it("revenue line: 10 customers × € 14.20 × 26 = € 3,692", () => {
    const l = line(c, "additionalRevenue");
    expect(l.expr).toBe(`10 customers × ${eur("14.20")} × 26 days`);
    expect(l.result).toBe(eur("3,692"));
    expect(l.value).toBe(engine.additionalRevenue);
  });
  it("gross profit line: € 3,692 × 31% = € 1,144.52", () => {
    const l = line(c, "additionalGrossProfit");
    expect(l.expr).toBe(`${eur("3,692")} × 31%`);
    expect(l.result).toBe(eur("1,144.52"));
    expect(l.value).toBe(engine.additionalGrossProfit);
  });
  it("contribution line: € 1,144.52 − € 988 = € 156.52, flagged as before other incremental costs", () => {
    const l = line(c, "estimatedContribution");
    expect(l.expr).toBe(`${eur("1,144.52")} − ${eur("988")}`);
    expect(l.result).toBe(eur("156.52"));
    expect(l.note).toMatch(/before other incremental costs/i);
    expect(l.value).toBe(engine.estimatedContribution);
    expect(c.headline?.value).toBe(engine.estimatedContribution);
    expect(c.headline?.text).toBe(eur("156.52"));
  });
  it("break-even lines match the engine", () => {
    expect(line(c, "breakEvenRevenue").value).toBe(engine.breakEvenRevenue);
    expect(line(c, "breakEvenRevenue").result).toBe(eur("3,187.10"));
    expect(line(c, "breakEvenCustomersPerDay").value).toBe(engine.breakEvenCustomersPerDay);
    expect(line(c, "breakEvenCustomersPerDay").result).toBe("8.63");
    expect(line(c, "breakEvenCustomersPerDay").note).toContain("At least 9 additional customers");
  });
  it("shows total cost and customers/day lines only when they add information", () => {
    expect(c.lines.some((l) => l.key === "totalAdditionalCost")).toBe(false);
    expect(c.lines.some((l) => l.key === "additionalCustomersPerDay")).toBe(false);
    const two = computeScenario("OPENING_HOURS", { ...input, additionalHoursPerDay: 2, otherMonthlyCost: 100 }, "EUR");
    expect(line(two, "totalAdditionalCost").value).toBe(2_076);
    expect(line(two, "additionalCustomersPerDay").value).toBe(20);
  });
  it("reports missing inputs instead of computing with 0", () => {
    const m = computeScenario("OPENING_HOURS", { ...input, averageBasket: null }, "EUR");
    expect(m.lines).toEqual([]);
    expect(m.headline).toBeNull();
    expect(m.missing).toEqual(["Average basket"]);
  });
});

describe("transaction uplift — strategy card example", () => {
  const input = { additionalTransactionsPerDay: 15, averageBasket: 8.4, daysPerMonth: 26, grossMarginPct: 35, monthlyCost: 0, oneOffCost: 2500 };
  const c = computeScenario("TRANSACTION_UPLIFT", input, "EUR");
  const engine = calculateTransactionUplift(input)!;

  it("15 × € 8.40 × 26 = € 3,276 additional revenue", () => {
    expect(line(c, "additionalRevenue").expr).toBe(`15 × ${eur("8.40")} × 26 days`);
    expect(line(c, "additionalRevenue").result).toBe(eur("3,276"));
    expect(line(c, "additionalRevenue").value).toBe(engine.additionalRevenue);
  });
  it("at 35% gross margin: € 1,146.60 gross profit", () => {
    expect(line(c, "additionalGrossProfit").result).toBe(eur("1,146.60"));
    expect(line(c, "additionalGrossProfit").value).toBe(engine.additionalGrossProfit);
  });
  it("sentence spells out the arithmetic and what is excluded", () => {
    expect(c.sentence).toBe(
      `15 × ${eur("8.40")} × 26 = ${eur("3,276")}/month additional revenue; at 35% gross margin: ${eur("1,146.60")}/month gross profit before additional labor, waste, utilities and other incremental costs`,
    );
  });
  it("payback line uses the engine value", () => {
    expect(line(c, "paybackMonths").value).toBe(engine.paybackMonths);
    expect(line(c, "paybackMonths").result).toBe("2.2 months");
  });
  it("says 'no payback' when contribution is not positive", () => {
    const neg = computeScenario("TRANSACTION_UPLIFT", { ...input, monthlyCost: 2000 }, "EUR");
    expect(line(neg, "monthlyContribution").value).toBeCloseTo(1146.6 - 2000, 8);
    expect(line(neg, "paybackMonths").result).toBe(NO_PAYBACK);
    expect(line(neg, "paybackMonths").value).toBeNull();
  });
  it("omits contribution and payback lines when no costs are entered", () => {
    const bare = computeScenario("TRANSACTION_UPLIFT", { additionalTransactionsPerDay: 15, averageBasket: 8.4, daysPerMonth: 26, grossMarginPct: 35 }, "EUR");
    expect(bare.lines.map((l) => l.key)).toEqual(["additionalRevenue", "additionalGrossProfit"]);
    expect(bare.headline?.label).toMatch(/before other incremental costs/);
  });
});

describe("cost reduction", () => {
  const input = { baselineMonthlyCost: 4200, reductionPct: 20, monthlyCost: 150, oneOffCost: 0 };
  const c = computeScenario("COST_REDUCTION", input, "EUR");
  const engine = calculateCostReduction(input)!;
  it("matches the engine", () => {
    expect(line(c, "grossSaving").value).toBe(engine.grossSaving);
    expect(line(c, "grossSaving").expr).toBe(`${eur("4,200")} × 20%`);
    expect(line(c, "netMonthlySaving").value).toBe(engine.netMonthlySaving);
    expect(line(c, "netMonthlySaving").result).toBe(eur("690"));
    expect(c.headline?.value).toBe(engine.netMonthlySaving);
  });
});

describe("investment break-even — spec example", () => {
  const c = computeScenario("BREAK_EVEN", { investment: 25_000, contributionPerTransaction: 4.1 }, "EUR");
  it("€ 25,000 ÷ € 4.10 = 6,098 transactions (rounded up)", () => {
    const l = line(c, "requiredTransactions");
    expect(l.expr).toBe(`${eur("25,000")} ÷ ${eur("4.10")}`);
    expect(l.result).toBe("6,098");
    expect(l.value).toBe(6_098);
    expect(l.note).toContain("6,097.56");
    expect(roundUpWhole(calculateInvestmentBreakEven({ investment: 25_000, contributionPerTransaction: 4.1 })!.requiredTransactions)).toBe(6_098);
  });
  it("payback per month volume, and no payback when contribution ≤ 0", () => {
    const ok = computeScenario("BREAK_EVEN", { investment: 25_000, contributionPerTransaction: 4.1, additionalTransactionsPerMonth: 1000, monthlyRunningCost: 100 }, "EUR");
    expect(line(ok, "monthlyContribution").value).toBeCloseTo(4_000, 8);
    expect(line(ok, "paybackMonths").value).toBeCloseTo(6.25, 8);
    expect(line(ok, "paybackMonths").result).toBe("6.3 months");
    const no = computeScenario("BREAK_EVEN", { investment: 25_000, contributionPerTransaction: 4.1, additionalTransactionsPerMonth: 10, monthlyRunningCost: 100 }, "EUR");
    expect(line(no, "paybackMonths").result).toBe(NO_PAYBACK);
  });
  it("rejects a non-positive contribution per transaction", () => {
    const bad = computeScenario("BREAK_EVEN", { investment: 25_000, contributionPerTransaction: 0 }, "EUR");
    expect(bad.lines).toEqual([]);
    expect(bad.missing.length).toBe(1);
  });
  it("roundUpWhole ignores floating-point dust", () => {
    expect(roundUpWhole(6098.0000000001)).toBe(6098);
    expect(roundUpWhole(6097.56)).toBe(6098);
    expect(roundUpWhole(null)).toBeNull();
  });
  it("contribution per transaction = basket × margin", () => {
    expect(contributionPerTransaction(14.2, 31)).toBeCloseTo(4.402, 8);
    expect(contributionPerTransaction(null, 31)).toBeNull();
  });
});

describe("revenue opportunity — spec example", () => {
  const input = { customersPerDay: 1000, averageBasket: 15, days: 30, trafficChangePct: 3, basketChangePct: 2 };
  const c = computeScenario("REVENUE_OPPORTUNITY", input, "EUR");
  const engine = calculateRevenueOpportunity(input)!;
  it("current: 1,000 × € 15 × 30 = € 450,000", () => {
    expect(line(c, "currentRevenue").expr).toBe(`1,000 customers/day × ${eur("15")} × 30`);
    expect(line(c, "currentRevenue").result).toBe(eur("450,000"));
  });
  it("scenario: 1,030 × € 15.30 × 30 = € 472,770", () => {
    expect(line(c, "scenarioRevenue").expr).toBe(`1,030 × ${eur("15.30")} × 30`);
    expect(line(c, "scenarioRevenue").result).toBe(eur("472,770"));
  });
  it("effects are the engine's and sum to the difference", () => {
    const t = line(c, "trafficEffect").value!;
    const b = line(c, "basketEffect").value!;
    const i = line(c, "interactionEffect").value!;
    expect(t).toBe(engine.trafficEffect);
    expect(b).toBe(engine.basketEffect);
    expect(i).toBe(engine.interactionEffect);
    expect(t + b + i).toBeCloseTo(line(c, "revenueDifference").value!, 6);
    expect(line(c, "trafficEffect").result).toBe(`+${eur("13,500")}`);
    expect(line(c, "basketEffect").result).toBe(`+${eur("9,000")}`);
    expect(line(c, "interactionEffect").result).toBe(`+${eur("270")}`);
    expect(line(c, "revenueDifference").result).toBe(`+${eur("22,770")}`);
  });
  it("adds gross-profit lines only when a margin is given", () => {
    expect(c.lines.some((l) => l.key === "scenarioGrossProfit")).toBe(false);
    const gp = computeScenario("REVENUE_OPPORTUNITY", { ...input, grossMarginPct: 30, marginChangePts: 1 }, "EUR");
    const e = calculateRevenueOpportunity({ ...input, grossMarginPct: 30, marginChangePts: 1 })!;
    expect(line(gp, "scenarioGrossProfit").value).toBe(e.scenarioGrossProfit);
    expect(line(gp, "scenarioGrossProfit").expr).toBe(`${eur("472,770")} × 31%`);
    expect(line(gp, "grossProfitDifference").value).toBe(e.grossProfitDifference);
  });
});

describe("standalone calculators", () => {
  it("monthly-cost break-even: € 988 at € 14.20 / 31% / 26 days", () => {
    const ls = monthlyCostBreakEvenLines({ additionalMonthlyCost: 988, averageBasket: 14.2, grossMarginPct: 31, daysPerMonth: 26 }, "EUR");
    expect(ls.map((l) => l.key)).toEqual(["breakEvenRevenue", "breakEvenCustomersPerDay"]);
    expect(ls[0]!.result).toBe(eur("3,187.10"));
    expect(ls[1]!.result).toBe("8.63");
  });
  it("monthly-cost break-even returns only what can be computed", () => {
    expect(monthlyCostBreakEvenLines({ additionalMonthlyCost: 988, averageBasket: null, grossMarginPct: 31, daysPerMonth: 26 }, "EUR").map((l) => l.key)).toEqual(["breakEvenRevenue"]);
    expect(monthlyCostBreakEvenLines({ additionalMonthlyCost: null, averageBasket: 14.2, grossMarginPct: 31, daysPerMonth: 26 }, "EUR")).toEqual([]);
  });
  it("basket + € 0.50 at 30,000 transactions", () => {
    const ls = basketChangeLines({ transactionsPerMonth: 30_000, averageBasket: 15, basketDelta: 0.5 }, "EUR");
    expect(ls.find((l) => l.key === "monthlyDifference")!.result).toBe(`+${eur("15,000")}`);
    expect(ls.find((l) => l.key === "monthlyDifference")!.expr).toBe(`30,000 × ${eur("0.50")}`);
    expect(ls.find((l) => l.key === "annualizedDifference")!.value).toBe(180_000);
    expect(basketChangeLines({ transactionsPerMonth: null, averageBasket: 15, basketDelta: 0.5 }, "EUR")).toEqual([]);
  });
});

describe("helpers", () => {
  it("additional hours from closing times", () => {
    expect(additionalHoursBetween("19:00", "20:00")).toBe(1);
    expect(additionalHoursBetween("19:00", "20:30")).toBe(1.5);
    expect(additionalHoursBetween("20:00", "19:00")).toBeNull();
    expect(additionalHoursBetween("19:00", "19:00")).toBeNull();
    expect(additionalHoursBetween("", "20:00")).toBeNull();
    expect(additionalHoursBetween("7pm", "20:00")).toBeNull();
  });
  it("time arithmetic", () => {
    expect(addHoursToTime("19:00", 1.5)).toBe("20:30");
    expect(addHoursToTime("23:00", 2)).toBeNull();
    expect(timeToDecimalHour("19:30")).toBe(19.5);
    expect(decimalHourToTime(19.5)).toBe("19:30");
    expect(decimalHourToTime(null)).toBeNull();
  });
  it("money in expressions drops decimals only for whole amounts", () => {
    expect(exprMoney(988, "EUR")).toBe(eur("988"));
    expect(exprMoney(14.2, "EUR")).toBe(eur("14.20"));
    expect(exprMoney(14.2 * 10 * 26, "EUR")).toBe(eur("3,692"));
    expect(exprMoney(null, "EUR")).toBe("—");
  });
  it("parses user-typed numbers without inventing values", () => {
    expect(parseInputNumber("14,20")).toBe(14.2);
    expect(parseInputNumber(" 19 ")).toBe(19);
    expect(parseInputNumber("")).toBeNull();
    expect(parseInputNumber("abc")).toBeNull();
    expect(parseInputNumber("-3")).toBe(-3);
    expect(parseInputNumber(undefined)).toBeNull();
  });
  it("groups stored rows per variant and detects which inputs vary", () => {
    const v = variantsFromRows([
      { variant: "CONSERVATIVE", key: "additionalTransactionsPerDay", value: 400 },
      { variant: "BASE", key: "additionalTransactionsPerDay", value: 400 },
      { variant: "OPTIMISTIC", key: "additionalTransactionsPerDay", value: 400 },
      { variant: "CONSERVATIVE", key: "averageBasket", value: 0.1 },
      { variant: "BASE", key: "averageBasket", value: 0.2 },
      { variant: "OPTIMISTIC", key: "averageBasket", value: 0.4 },
    ]);
    expect(v.BASE.averageBasket).toBe(0.2);
    // averageBasket differs → per variant; additionalTransactionsPerDay is per-variant by definition.
    expect(varyingKeys("TRANSACTION_UPLIFT", v)).toEqual(["additionalTransactionsPerDay", "averageBasket"]);
  });
  it("every simulator kind has metadata, and rule-engine input keys are allowed", () => {
    for (const k of SIMULATOR_KINDS) expect(SCENARIO_KINDS[k].inputs.length).toBeGreaterThan(0);
    expect(allowedInputKeys("OPENING_HOURS")).toEqual(expect.arrayContaining([
      "additionalHoursPerDay", "additionalEmployees", "hourlyEmployeeCost", "daysPerMonth", "additionalCustomersPerHour", "averageBasket", "grossMarginPct", "otherMonthlyCost", "currentClosingHour",
    ]));
    expect(allowedInputKeys("TRANSACTION_UPLIFT")).toEqual(expect.arrayContaining(["additionalTransactionsPerDay", "averageBasket", "daysPerMonth", "grossMarginPct", "monthlyCost", "oneOffCost"]));
    expect(allowedInputKeys("COST_REDUCTION")).toEqual(expect.arrayContaining(["baselineMonthlyCost", "reductionPct", "monthlyCost", "oneOffCost"]));
  });
});

describe("store prefill", () => {
  const k: Kpis = {
    months: 3, revenue: 1_000_000, monthlyRevenue: 333_333.33, transactions: 70_423, customers: null, openDays: 78,
    customersPerDay: null, transactionsPerDay: 902.859, averageBasket: 14.19987, revenuePerCustomer: null, revenuePerSqm: null,
    revenuePerEmployee: null, grossMarginPct: 31.04, grossProfit: null, operatingCosts: null, operatingProfit: null, costRatioPct: null,
    areaSqm: null, employees: null,
  };
  it("rounds recorded values and keeps missing ones null", () => {
    const p = storePrefillFromKpis({ id: "s", name: "Store", closesAt: "19:00" }, k, "Jul 26 – Sep 26");
    expect(p).toMatchObject({ averageBasket: 14.2, grossMarginPct: 31, daysPerMonth: 26, transactionsPerDay: 903, transactionsPerMonth: 23_474, closesAt: "19:00" });
    const empty = storePrefillFromKpis({ id: "s", name: "Store", closesAt: null }, { ...k, averageBasket: null, grossMarginPct: null, openDays: null, transactions: null, transactionsPerDay: null }, "x");
    expect(empty).toMatchObject({ averageBasket: null, grossMarginPct: null, daysPerMonth: null, transactionsPerDay: null, transactionsPerMonth: null });
  });
});
