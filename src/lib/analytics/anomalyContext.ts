import { calculateAverageBasket, calculateGrowthRate, median } from "@/lib/calc";
import { monthRange, type MonthKey } from "@/lib/period";
import type { AnomalyMetric } from "./anomalies";
import type { CostTypeKey, MonthFact } from "./types";

/** The monthly series of one anomaly metric for one store, gaps as null. Mirrors the series findAnomalies analyses. */
export function metricSeries(facts: readonly MonthFact[], storeId: string, metric: AnomalyMetric, from: MonthKey, to: MonthKey): { month: MonthKey; value: number | null }[] {
  const byMonth = new Map(facts.filter((f) => f.storeId === storeId).map((f) => [f.month, f]));
  return monthRange(from, to).map((month) => {
    const f = byMonth.get(month);
    let value: number | null = null;
    if (f) {
      if (metric === "revenue") value = f.revenue;
      else if (metric === "customers") value = f.customers;
      else if (metric === "averageBasket") value = calculateAverageBasket(f.revenue, f.transactions);
      else if (metric === "grossMarginPct") value = f.grossMarginPct;
      else value = f.costs[metric.slice(5) as CostTypeKey] ?? null;
    }
    return { month, value };
  });
}

export interface AnomalyGuidance {
  /** Generic candidate explanations for this TYPE of metric. Hypotheses to check — none is asserted. */
  internal: string[];
  external: string[];
  /** Data that would help discriminate between the candidates and is not held in RetailLab. */
  missing: string[];
}

const COMMON_MISSING = ["Daily or hourly figures (only monthly totals are stored, so the timing within the month is unknown)"];

const GUIDANCE: Record<string, AnomalyGuidance> = {
  revenue: {
    internal: ["Change in opening days or hours", "Promotion, price change or assortment change", "Partial closure, refit or out-of-stock period", "Booking or period-cutoff difference in the source data"],
    external: ["Competitor opening, closure or promotion", "Roadworks or access changes", "Weather", "Local events or a shifted holiday (e.g. Easter moving between March and April)"],
    missing: ["Hourly customer traffic", "Competitor activity and prices", "Weather data", "Promotion calendar", ...COMMON_MISSING],
  },
  customers: {
    internal: ["Change in opening days or hours", "Customer counter fault or changed counting method", "Partial closure or refit", "Promotion or leaflet timing"],
    external: ["Competitor opening or closure", "Roadworks, parking or public-transport changes", "Weather", "Local events, school holidays"],
    missing: ["Hourly customer traffic", "Counter maintenance log", "Competitor activity", "Weather data", ...COMMON_MISSING],
  },
  averageBasket: {
    internal: ["Price changes", "Assortment or promotion mix", "Change in how transactions are counted (e.g. split receipts, self-checkout)", "Shift between small top-up and large weekly shops"],
    external: ["Supplier price inflation", "A change in who shops (commuters vs. households)", "Competitor offers pulling specific baskets away"],
    missing: ["Item-level sales (units and prices per receipt)", "Promotion calendar", "Customer segment data", ...COMMON_MISSING],
  },
  grossMarginPct: {
    internal: ["Promotion depth or markdowns", "Category mix shift", "Shrink or waste booked in the month", "Inventory valuation or supplier-rebate timing"],
    external: ["Supplier cost changes", "Competitive price pressure"],
    missing: ["Purchase prices per item", "Markdown and promotion log", "Stock-take results", ...COMMON_MISSING],
  },
  "cost:ENERGY": {
    internal: ["Equipment fault (refrigeration, HVAC)", "Changed operating hours", "New or replaced equipment", "Billing correction or back-payment"],
    external: ["Tariff change", "Weather (heating or cooling demand)"],
    missing: ["Meter readings in kWh (only the invoiced amount is stored)", "Tariff per kWh", "Weather data", "Equipment maintenance log"],
  },
  "cost:WASTE": {
    internal: ["Over-ordering or forecast error", "Cooling failure", "Change in how waste is recorded", "Markdown policy change", "Assortment change in fresh categories"],
    external: ["Demand drop (weather, competitor)", "Supplier quality or delivery timing"],
    missing: ["Waste by item and reason code", "Order quantities", "Temperature logs", "Weather data"],
  },
  "cost:PERSONNEL": {
    internal: ["Headcount or hours change", "Overtime", "Bonus, holiday pay or one-off payments", "Sick-leave cover", "Accrual or payroll-period timing"],
    external: ["Collective-agreement wage change"],
    missing: ["Hours worked and roster", "Payroll breakdown (base, overtime, one-offs)", "Headcount per month (only the current employee count is stored)"],
  },
};

const GENERIC_COST: AnomalyGuidance = {
  internal: ["One-off invoice or project", "Billing correction or changed booking period", "Contract change"],
  external: ["Supplier price change"],
  missing: ["Invoice-level detail", "Contract terms"],
};

/** Candidate explanations by metric type. Static, generic text — it never looks at the anomaly itself. */
export function anomalyGuidance(metric: AnomalyMetric): AnomalyGuidance {
  return GUIDANCE[metric] ?? GENERIC_COST;
}

/**
 * The series' typical change (median of the YoY or MoM changes, in %) — the
 * centre that detectAnomalies measures each month against. Null with fewer
 * than 4 comparable months (the same minimum detectAnomalies uses).
 */
export function typicalChange(values: ReadonlyArray<number | null>, basis: "yoy" | "mom"): number | null {
  const lag = basis === "yoy" ? 12 : 1;
  const changes: number[] = [];
  for (let i = lag; i < values.length; i++) {
    const g = calculateGrowthRate(values[i], values[i - lag]);
    if (g !== null) changes.push(g);
  }
  return changes.length < 4 ? null : median(changes);
}
