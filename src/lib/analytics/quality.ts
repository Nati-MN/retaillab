import { calculateDataQuality, type DataQuality, type QualityCheck } from "@/lib/calc";
import type { StoreDTO } from "./types";

/**
 * What exists for one store. Counts only — no values. Built by the server from
 * the database, consumed by the pure function below.
 */
export interface StoreQualityInput {
  store: Pick<StoreDTO, "latitude" | "longitude" | "areaSqm" | "employees" | "opensAt" | "closesAt" | "parkingSpaces">;
  /** Months with a revenue row. */
  revenueMonths: number;
  monthsWithTransactions: number;
  monthsWithCustomers: number;
  monthsWithMargin: number;
  /** Months with at least one operating cost line. */
  monthsWithCosts: number;
  /** Months with a WASTE cost line. */
  monthsWithWasteCost: number;
  categoryRevenueRows: number;
  categoryMarginRows: number;
  categoryWasteRows: number;
  hourlyRows: number;
  /** Research runs, competitors and location signals stored for the store. */
  researchItems: number;
}

export interface StoreQualityCheck extends QualityCheck {
  /** How much of the input exists, e.g. "9 of 24 months". */
  detail?: string;
  group: "Master data" | "History" | "Monthly figures" | "Categories" | "Operations & location";
}

export interface StoreDataQuality extends DataQuality {
  checks: StoreQualityCheck[];
  missing: StoreQualityCheck[];
}

function coverage(n: number, total: number): string | undefined {
  if (total === 0) return undefined;
  return `${n} of ${total} months`;
}

/**
 * Completeness checks for one store. A check is "present" when the input
 * exists at all; `detail` states the coverage so partial data stays visible.
 * The score says how much can be analysed — it says nothing about how well
 * the store performs.
 */
export function buildStoreQualityChecks(i: StoreQualityInput): StoreQualityCheck[] {
  const m = i.revenueMonths;
  return [
    {
      key: "coordinates", group: "Master data", label: "Coordinates",
      present: i.store.latitude !== null && i.store.longitude !== null,
      impact: "Without coordinates the store cannot be placed on the map and no location or competitor research can be run.",
    },
    {
      key: "area", group: "Master data", label: "Sales area (m²)",
      present: i.store.areaSqm !== null,
      impact: "Revenue per m² and cost per m² cannot be calculated, so space productivity cannot be compared across stores.",
    },
    {
      key: "employees", group: "Master data", label: "Employees",
      present: i.store.employees !== null,
      impact: "Revenue per employee cannot be calculated; staffing scenarios have no baseline.",
    },
    {
      key: "openingHours", group: "Master data", label: "Opening hours",
      present: i.store.opensAt !== null && i.store.closesAt !== null,
      impact: "Opening-hours scenarios and comparisons with competitor hours are not possible.",
    },
    {
      key: "parking", group: "Master data", label: "Parking spaces",
      present: i.store.parkingSpaces !== null,
      impact: "Parking cannot be considered when comparing locations (0 is a valid entry for a store without parking).",
    },
    {
      key: "revenue12", group: "History", label: "12 months of revenue",
      present: m >= 12, detail: `${m} months on record`,
      impact: "Fewer than 12 months: no full-year totals, no seasonality, no trend-based forecast.",
    },
    {
      key: "revenue24", group: "History", label: "24 months of revenue",
      present: m >= 24, detail: `${m} months on record`,
      impact: "Fewer than 24 months: year-over-year comparison is incomplete, anomaly detection falls back to month-over-month, and forecasts carry no seasonal adjustment.",
    },
    {
      key: "transactions", group: "Monthly figures", label: "Transactions",
      present: i.monthsWithTransactions > 0, detail: coverage(i.monthsWithTransactions, m),
      impact: "Average basket (revenue / transactions) cannot be calculated; revenue changes cannot be split into traffic and basket.",
    },
    {
      key: "customers", group: "Monthly figures", label: "Customer counts",
      present: i.monthsWithCustomers > 0, detail: coverage(i.monthsWithCustomers, m),
      impact: "Customers per day and revenue per customer are unavailable; break-even cannot be expressed in customers.",
    },
    {
      key: "grossMargin", group: "Monthly figures", label: "Gross margin",
      present: i.monthsWithMargin > 0, detail: coverage(i.monthsWithMargin, m),
      impact: "Gross profit and operating profit cannot be calculated; scenarios can only be stated in revenue, not profit.",
    },
    {
      key: "costs", group: "Monthly figures", label: "Operating costs",
      present: i.monthsWithCosts > 0, detail: coverage(i.monthsWithCosts, m),
      impact: "Operating profit, cost ratios and break-even revenue are unavailable.",
    },
    {
      key: "categoryRevenue", group: "Categories", label: "Category revenue",
      present: i.categoryRevenueRows > 0,
      impact: "No assortment view: category shares and category growth cannot be shown or compared with other stores.",
    },
    {
      key: "categoryMargins", group: "Categories", label: "Category margins",
      present: i.categoryMarginRows > 0,
      impact: "It is unknown which categories contribute profit; assortment hypotheses can only refer to revenue.",
    },
    {
      key: "waste", group: "Categories", label: "Waste data",
      present: i.categoryWasteRows > 0 || i.monthsWithWasteCost > 0,
      impact: "Food-waste levels are unknown, so waste-reduction ideas cannot be sized or measured.",
    },
    {
      key: "hourlyTraffic", group: "Operations & location", label: "Hourly traffic",
      present: i.hourlyRows > 0,
      impact: "No hourly transaction profile: peak hours are unknown and opening-hours or staffing scenarios rest entirely on assumptions.",
    },
    {
      key: "locationResearch", group: "Operations & location", label: "Location research on file",
      present: i.researchItems > 0,
      impact: "Nothing is known about nearby competitors or surroundings; location-based explanations cannot be examined.",
    },
  ];
}

export function storeDataQuality(input: StoreQualityInput): StoreDataQuality {
  const checks = buildStoreQualityChecks(input);
  const q = calculateDataQuality(checks);
  return { ...q, checks, missing: checks.filter((c) => !c.present) };
}
