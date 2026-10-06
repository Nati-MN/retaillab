import type { MonthKey } from "@/lib/period";

/** Plain, serializable shapes passed from server queries to pure analytics and client components. */

export const COST_TYPES = [
  "PERSONNEL", "RENT", "ENERGY", "LOGISTICS", "WASTE", "MARKETING", "MAINTENANCE", "OTHER",
] as const;
export type CostTypeKey = (typeof COST_TYPES)[number];

export const COST_LABELS: Record<CostTypeKey, string> = {
  PERSONNEL: "Personnel",
  RENT: "Rent",
  ENERGY: "Energy",
  LOGISTICS: "Logistics",
  WASTE: "Waste",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

export const STORE_TYPE_LABELS = {
  SUPERMARKET: "Supermarket",
  CONVENIENCE: "Convenience Store",
  DISCOUNT: "Discount Store",
  SPECIALTY: "Specialty Store",
} as const;
export type StoreTypeKey = keyof typeof STORE_TYPE_LABELS;

export interface StoreDTO {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  openingDate: string | null; // ISO date
  areaSqm: number | null;
  employees: number | null;
  parkingSpaces: number | null;
  type: StoreTypeKey;
  opensAt: string | null;
  closesAt: string | null;
  openDaysPerWeek: number | null;
  isDemo: boolean;
}

/** One store-month with its costs folded in. */
export interface MonthFact {
  storeId: string;
  month: MonthKey;
  revenue: number;
  transactions: number | null;
  customers: number | null;
  grossMarginPct: number | null;
  openDays: number | null;
  costs: Partial<Record<CostTypeKey, number>>;
  /** Sum of all cost rows for the month; null when no cost rows exist. */
  operatingCosts: number | null;
}

export interface CategoryFact {
  storeId: string;
  categoryId: string;
  categoryName: string;
  month: MonthKey;
  revenue: number;
  marginPct: number | null;
  wasteValue: number | null;
  stockoutRatePct: number | null;
  areaSqm: number | null;
}

/** KPIs for one store (or a group of stores) over a period. Null = cannot be calculated. */
export interface Kpis {
  months: number;
  revenue: number | null;
  /** revenue / months */
  monthlyRevenue: number | null;
  transactions: number | null;
  customers: number | null;
  openDays: number | null;
  customersPerDay: number | null;
  transactionsPerDay: number | null;
  averageBasket: number | null;
  revenuePerCustomer: number | null;
  /** Monthly revenue / m² */
  revenuePerSqm: number | null;
  /** Monthly revenue / employee */
  revenuePerEmployee: number | null;
  grossMarginPct: number | null;
  grossProfit: number | null;
  operatingCosts: number | null;
  operatingProfit: number | null;
  /** Operating costs / revenue × 100 */
  costRatioPct: number | null;
  areaSqm: number | null;
  employees: number | null;
}

export type KpiKey = Exclude<keyof Kpis, "months">;
