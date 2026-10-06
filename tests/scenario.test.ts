import { describe, expect, it } from "vitest";
import {
  calculateBasketChange,
  calculateBreakEvenCustomers,
  calculateBreakEvenRevenue,
  calculateInvestmentBreakEven,
  calculateOpeningHoursScenario,
  calculateRevenueOpportunity,
  calculateScenarioRevenue,
  calculateTransactionUplift,
} from "@/lib/calc";

describe("opening hours scenario (spec §15)", () => {
  const base = {
    additionalHoursPerDay: 1,
    additionalEmployees: 2,
    hourlyEmployeeCost: 19,
    daysPerMonth: 26,
    additionalCustomersPerHour: 10,
    averageBasket: 14.2,
    grossMarginPct: 31,
  };
  const r = calculateOpeningHoursScenario(base)!;

  it("labor: 2 × €19 × 26 = €988", () => expect(r.additionalLaborCost).toBe(988));
  it("revenue: 10 × €14.20 × 26 = €3,692", () => expect(r.additionalRevenue).toBeCloseTo(3_692, 8));
  it("gross profit: €3,692 × 31% = €1,144.52", () => expect(r.additionalGrossProfit).toBeCloseTo(1_144.52, 8));
  it("contribution: €1,144.52 − €988 = €156.52", () => expect(r.estimatedContribution).toBeCloseTo(156.52, 8));
  it("break-even revenue = 988 / 0.31", () => expect(r.breakEvenRevenue).toBeCloseTo(3_187.0968, 3));
  it("break-even customers/day = 988 / (14.20 × 0.31 × 26)", () =>
    expect(r.breakEvenCustomersPerDay).toBeCloseTo(8.6324, 3));
  it("at exactly break-even customers the contribution is zero", () => {
    const be = calculateOpeningHoursScenario({ ...base, additionalCustomersPerHour: r.breakEvenCustomersPerDay! })!;
    expect(be.estimatedContribution).toBeCloseTo(0, 8);
  });
  it("scales with additional hours and includes other costs", () => {
    const two = calculateOpeningHoursScenario({ ...base, additionalHoursPerDay: 2, otherMonthlyCost: 100 })!;
    expect(two.additionalLaborCost).toBe(1_976);
    expect(two.totalAdditionalCost).toBe(2_076);
    expect(two.additionalCustomersPerDay).toBe(20);
  });
  it("zero customers gives negative contribution equal to cost", () => {
    const z = calculateOpeningHoursScenario({ ...base, additionalCustomersPerHour: 0 })!;
    expect(z.estimatedContribution).toBe(-988);
  });
  it("missing input → null", () => {
    expect(calculateOpeningHoursScenario({ ...base, averageBasket: Number.NaN })).toBeNull();
  });
});

describe("break-even", () => {
  it("revenue requires positive margin", () => {
    expect(calculateBreakEvenRevenue(1_000, 25)).toBe(4_000);
    expect(calculateBreakEvenRevenue(1_000, 0)).toBeNull();
    expect(calculateBreakEvenRevenue(null, 25)).toBeNull();
  });
  it("customers", () => {
    expect(calculateBreakEvenCustomers(1_000, 10, 25, 20)).toBe(20);
    expect(calculateBreakEvenCustomers(1_000, 0, 25, 20)).toBeNull();
  });
  it("investment (spec §17): €25,000 / €4.10 = 6,098 transactions", () => {
    const r = calculateInvestmentBreakEven({ investment: 25_000, contributionPerTransaction: 4.1 })!;
    expect(Math.ceil(r.requiredTransactions)).toBe(6_098);
    expect(r.paybackMonths).toBeNull();
  });
  it("payback period from assumed volume", () => {
    const r = calculateInvestmentBreakEven({
      investment: 25_000,
      contributionPerTransaction: 4.1,
      additionalTransactionsPerMonth: 600,
    })!;
    expect(r.monthlyContribution).toBeCloseTo(2_460, 8);
    expect(r.paybackMonths).toBeCloseTo(10.1626, 3);
  });
  it("no payback when running cost exceeds contribution", () => {
    const r = calculateInvestmentBreakEven({
      investment: 25_000,
      contributionPerTransaction: 4.1,
      additionalTransactionsPerMonth: 100,
      monthlyRunningCost: 500,
    })!;
    expect(r.monthlyContribution).toBeCloseTo(-90, 8);
    expect(r.paybackMonths).toBeNull();
  });
  it("invalid contribution → null", () => {
    expect(calculateInvestmentBreakEven({ investment: 1, contributionPerTransaction: 0 })).toBeNull();
  });
});

describe("revenue opportunity (spec §20)", () => {
  const r = calculateRevenueOpportunity({
    customersPerDay: 1_000,
    averageBasket: 15,
    days: 30,
    trafficChangePct: 3,
    basketChangePct: 2,
  })!;
  it("current revenue = 1,000 × €15 × 30 = €450,000", () => expect(r.currentRevenue).toBe(450_000));
  it("new customers 1,030 and basket €15.30", () => {
    expect(r.newCustomersPerDay).toBeCloseTo(1_030, 8);
    expect(r.newBasket).toBeCloseTo(15.3, 8);
  });
  it("scenario revenue = 1,030 × €15.30 × 30 = €472,770", () => expect(r.scenarioRevenue).toBeCloseTo(472_770, 6));
  it("individual effects", () => {
    expect(r.trafficEffect).toBeCloseTo(13_500, 6);
    expect(r.basketEffect).toBeCloseTo(9_000, 6);
    expect(r.interactionEffect).toBeCloseTo(270, 6);
  });
  it("effects sum exactly to the difference", () => {
    expect(r.trafficEffect + r.basketEffect + r.interactionEffect).toBeCloseTo(r.revenueDifference, 6);
  });
  it("margin is optional", () => {
    expect(r.currentGrossProfit).toBeNull();
    const m = calculateRevenueOpportunity({
      customersPerDay: 1_000,
      averageBasket: 15,
      days: 30,
      trafficChangePct: 0,
      basketChangePct: 0,
      grossMarginPct: 30,
      marginChangePts: 1,
    })!;
    expect(m.currentGrossProfit).toBeCloseTo(135_000, 6);
    expect(m.scenarioGrossProfit).toBeCloseTo(139_500, 6);
    expect(m.marginEffect).toBeCloseTo(4_500, 6);
  });
  it("calculateScenarioRevenue", () => {
    expect(calculateScenarioRevenue(1_030, 15.3, 30)).toBeCloseTo(472_770, 6);
    expect(calculateScenarioRevenue(null, 15.3, 30)).toBeNull();
  });
});

describe("basket change at constant volume (spec §31)", () => {
  const r = calculateBasketChange(31_000, 14.2, 0.5)!;
  it("current €440,200 → scenario €455,700", () => {
    expect(r.currentRevenue).toBeCloseTo(440_200, 6);
    expect(r.newBasket).toBeCloseTo(14.7, 8);
    expect(r.scenarioRevenue).toBeCloseTo(455_700, 6);
  });
  it("+€15,500/month, +€186,000/year", () => {
    expect(r.monthlyDifference).toBeCloseTo(15_500, 6);
    expect(r.annualizedDifference).toBeCloseTo(186_000, 6);
  });
});

describe("transaction uplift (spec §51 lunch card)", () => {
  const r = calculateTransactionUplift({
    additionalTransactionsPerDay: 15,
    averageBasket: 8.4,
    daysPerMonth: 26,
    grossMarginPct: 35,
    oneOffCost: 2_500,
  })!;
  it("15 × €8.40 × 26 = €3,276", () => expect(r.additionalRevenue).toBeCloseTo(3_276, 8));
  it("at 35% → €1,146.60", () => expect(r.additionalGrossProfit).toBeCloseTo(1_146.6, 8));
  it("payback of €2,500 one-off", () => expect(r.paybackMonths).toBeCloseTo(2.1804, 3));
});

import { calculateCostReduction } from "@/lib/calc";

describe("cost reduction", () => {
  it("net saving and payback", () => {
    const r = calculateCostReduction({ baselineMonthlyCost: 6_000, reductionPct: 20, monthlyCost: 200, oneOffCost: 3_000 })!;
    expect(r.grossSaving).toBe(1_200);
    expect(r.netMonthlySaving).toBe(1_000);
    expect(r.paybackMonths).toBe(3);
  });
  it("no payback when the measure costs more than it saves", () => {
    const r = calculateCostReduction({ baselineMonthlyCost: 1_000, reductionPct: 10, monthlyCost: 150, oneOffCost: 500 })!;
    expect(r.netMonthlySaving).toBe(-50);
    expect(r.paybackMonths).toBeNull();
  });
});
