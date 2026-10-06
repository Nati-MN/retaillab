import "server-only";
import { storeDataQuality, type StoreDataQuality, type StoreQualityInput } from "@/lib/analytics/quality";
import type { StoreDTO } from "@/lib/analytics/types";
import { db } from "./db";

/**
 * Counts what data exists per store (never the values themselves) and turns it
 * into completeness checks. `stores` must already be scoped to the caller's
 * organization (they come from getStores / getStore).
 */
export async function getStoreQuality(orgId: string, stores: readonly StoreDTO[]): Promise<Map<string, StoreDataQuality>> {
  const ids = stores.map((s) => s.id);
  const out = new Map<string, StoreDataQuality>();
  if (ids.length === 0) return out;
  const storeWhere = { id: { in: ids }, organizationId: orgId };

  const [revenue, costMonths, wasteMonths, categories, hourly, research, competitors, signals] = await Promise.all([
    db.monthlyRevenue.groupBy({
      by: ["storeId"], where: { store: storeWhere },
      _count: { _all: true, transactions: true, customers: true, grossMarginPct: true },
    }),
    db.cost.groupBy({ by: ["storeId", "month"], where: { store: storeWhere } }),
    db.cost.groupBy({ by: ["storeId"], where: { store: storeWhere, type: "WASTE" }, _count: { _all: true } }),
    db.categoryMetric.groupBy({
      by: ["storeId"], where: { store: storeWhere },
      _count: { _all: true, marginPct: true, wasteValue: true },
    }),
    db.storeMetric.groupBy({ by: ["storeId"], where: { store: storeWhere, kind: "HOURLY_TRANSACTIONS" }, _count: { _all: true } }),
    db.researchResult.groupBy({ by: ["storeId"], where: { organizationId: orgId, storeId: { in: ids }, status: { not: "UNAVAILABLE" } }, _count: { _all: true } }),
    db.competitor.groupBy({ by: ["storeId"], where: { store: storeWhere }, _count: { _all: true } }),
    db.locationSignal.groupBy({ by: ["storeId"], where: { store: storeWhere }, _count: { _all: true } }),
  ]);

  const count = (rows: { storeId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.storeId === id)?._count._all ?? 0;

  for (const s of stores) {
    const rev = revenue.find((r) => r.storeId === s.id)?._count;
    const cat = categories.find((r) => r.storeId === s.id)?._count;
    const input: StoreQualityInput = {
      store: s,
      revenueMonths: rev?._all ?? 0,
      monthsWithTransactions: rev?.transactions ?? 0,
      monthsWithCustomers: rev?.customers ?? 0,
      monthsWithMargin: rev?.grossMarginPct ?? 0,
      monthsWithCosts: costMonths.filter((c) => c.storeId === s.id).length,
      monthsWithWasteCost: count(wasteMonths, s.id),
      categoryRevenueRows: cat?._all ?? 0,
      categoryMarginRows: cat?.marginPct ?? 0,
      categoryWasteRows: cat?.wasteValue ?? 0,
      hourlyRows: count(hourly, s.id),
      researchItems: count(research, s.id) + count(competitors, s.id) + count(signals, s.id),
    };
    out.set(s.id, storeDataQuality(input));
  }
  return out;
}
