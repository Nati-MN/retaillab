import type { KpiProps } from "@/components/ui";
import type { PeriodComparison } from "@/lib/analytics/periodCompare";
import type { KpiKey } from "@/lib/analytics/types";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";

type DeltaSpec = NonNullable<KpiProps["deltas"]>;

/** The two standard comparisons for a KPI tile. Null renders as "—" (not enough data to compare). */
export function kpiDeltas(c: PeriodComparison, key: KpiKey, goodWhen: "up" | "down" | "none" = "up"): DeltaSpec {
  const unit = key === "grossMarginPct" || key === "costRatioPct" ? "pts" : "%";
  if (c.referencesCoincide) return [{ value: c.vsPreviousYear[key], label: "prev. 12 months", unit, goodWhen }];
  return [
    { value: c.vsPrevious[key], label: "prev. period", unit, goodWhen },
    { value: c.vsPreviousYear[key], label: "prev. year", unit, goodWhen },
  ];
}

export type TileKey =
  | "revenue" | "monthlyRevenue" | "averageBasket" | "customers" | "customersPerDay" | "revenuePerSqm"
  | "revenuePerEmployee" | "grossMarginPct" | "operatingProfit" | "revenuePerCustomer" | "transactionsPerDay" | "costRatioPct" | "operatingCosts";

interface TileDef {
  label: string;
  formula: string;
  format: (v: number, currency: string) => string;
  /** Why the value may be missing. */
  missing: string;
  goodWhen?: "up" | "down" | "none";
}

export const TILES: Record<TileKey, TileDef> = {
  revenue: { label: "Total revenue", formula: "Σ monthly revenue", format: (v, c) => fmtMoney(v, c), missing: "No revenue recorded" },
  monthlyRevenue: { label: "Monthly revenue", formula: "Revenue / months in period", format: (v, c) => fmtMoney(v, c), missing: "No revenue recorded" },
  averageBasket: { label: "Average basket", formula: "Revenue / transactions", format: (v, c) => fmtMoney(v, c, 2), missing: "Transactions missing" },
  customers: { label: "Customers", formula: "Σ monthly customers", format: (v) => fmtNumber(v), missing: "Customer counts missing" },
  customersPerDay: { label: "Customers / day", formula: "Customers / open days", format: (v) => fmtNumber(v), missing: "Customers or open days missing" },
  transactionsPerDay: { label: "Transactions / day", formula: "Transactions / open days", format: (v) => fmtNumber(v), missing: "Transactions or open days missing" },
  revenuePerSqm: { label: "Revenue / m²", formula: "Monthly revenue / sales area", format: (v, c) => fmtMoney(v, c), missing: "Sales area missing" },
  revenuePerEmployee: { label: "Revenue / employee", formula: "Monthly revenue / employees", format: (v, c) => fmtMoney(v, c), missing: "Employees missing" },
  revenuePerCustomer: { label: "Revenue / customer", formula: "Revenue / customers", format: (v, c) => fmtMoney(v, c, 2), missing: "Customer counts missing" },
  grossMarginPct: { label: "Gross margin", formula: "Σ(revenue × margin) / Σ revenue", format: (v) => fmtPct(v), missing: "Margin not entered" },
  operatingProfit: { label: "Operating profit", formula: "Revenue × margin − operating costs", format: (v, c) => fmtMoney(v, c), missing: "Margin or costs missing" },
  operatingCosts: { label: "Operating costs", formula: "Σ cost lines", format: (v, c) => fmtMoney(v, c), missing: "Costs not entered", goodWhen: "down" },
  costRatioPct: { label: "Cost ratio", formula: "Operating costs / revenue", format: (v) => fmtPct(v), missing: "Costs not entered", goodWhen: "down" },
};

/** Props for a standard KPI tile: value, both comparisons and the formula caption. */
export function kpiTile(c: PeriodComparison, key: TileKey, currency: string, over: Partial<KpiProps> = {}): KpiProps {
  const def = TILES[key];
  const v = c.current[key];
  return {
    label: def.label,
    value: v === null ? null : def.format(v, currency),
    missingReason: c.current.months === 0 ? "No data in period" : def.missing,
    deltas: kpiDeltas(c, key, def.goodWhen ?? "up"),
    formula: def.formula,
    ...over,
  };
}
