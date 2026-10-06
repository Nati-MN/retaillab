import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { monthKey, monthToDate, type MonthKey } from "@/lib/period";
import type { CategoryFact, CostTypeKey, MonthFact, StoreDTO } from "@/lib/analytics/types";

/**
 * Read models. Every function takes the organization id obtained from
 * requireOrg() and filters by it. Decimals are converted to numbers here so
 * nothing downstream has to know about Prisma types.
 */

const num = (d: Prisma.Decimal | null | undefined): number | null => (d == null ? null : d.toNumber());

export interface FactFilter {
  from?: MonthKey;
  to?: MonthKey;
  storeIds?: string[];
}

function monthWhere(f: FactFilter): Prisma.DateTimeFilter | undefined {
  if (!f.from && !f.to) return undefined;
  return {
    ...(f.from ? { gte: monthToDate(f.from) } : {}),
    ...(f.to ? { lte: monthToDate(f.to) } : {}),
  };
}

export function toStoreDTO(s: {
  id: string; name: string; code: string; address: string; city: string;
  latitude: number | null; longitude: number | null; openingDate: Date | null;
  areaSqm: number | null; employees: number | null; parkingSpaces: number | null;
  type: StoreDTO["type"]; opensAt: string | null; closesAt: string | null;
  openDaysPerWeek: number | null; isDemo: boolean;
}): StoreDTO {
  return {
    id: s.id, name: s.name, code: s.code, address: s.address, city: s.city,
    latitude: s.latitude, longitude: s.longitude,
    openingDate: s.openingDate ? s.openingDate.toISOString().slice(0, 10) : null,
    areaSqm: s.areaSqm, employees: s.employees, parkingSpaces: s.parkingSpaces,
    type: s.type, opensAt: s.opensAt, closesAt: s.closesAt,
    openDaysPerWeek: s.openDaysPerWeek, isDemo: s.isDemo,
  };
}

export async function getStores(orgId: string): Promise<StoreDTO[]> {
  const rows = await db.store.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } });
  return rows.map(toStoreDTO);
}

export async function getStore(orgId: string, storeId: string): Promise<StoreDTO | null> {
  const row = await db.store.findFirst({ where: { id: storeId, organizationId: orgId } });
  return row ? toStoreDTO(row) : null;
}

/** Latest month with any revenue row in the organization, or null when there is no data. */
export async function getLatestMonth(orgId: string): Promise<MonthKey | null> {
  const r = await db.monthlyRevenue.aggregate({
    where: { store: { organizationId: orgId } },
    _max: { month: true },
  });
  return r._max.month ? monthKey(r._max.month) : null;
}

export async function getEarliestMonth(orgId: string): Promise<MonthKey | null> {
  const r = await db.monthlyRevenue.aggregate({
    where: { store: { organizationId: orgId } },
    _min: { month: true },
  });
  return r._min.month ? monthKey(r._min.month) : null;
}

/** Store-month facts with costs, limited to the requested window. */
export async function getMonthFacts(orgId: string, filter: FactFilter = {}): Promise<MonthFact[]> {
  const storeWhere: Prisma.StoreWhereInput = {
    organizationId: orgId,
    ...(filter.storeIds ? { id: { in: filter.storeIds } } : {}),
  };
  const month = monthWhere(filter);
  const [revenue, costs] = await Promise.all([
    db.monthlyRevenue.findMany({
      where: { store: storeWhere, ...(month ? { month } : {}) },
      select: { storeId: true, month: true, revenue: true, transactions: true, customers: true, grossMarginPct: true, openDays: true },
      orderBy: [{ month: "asc" }],
    }),
    db.cost.findMany({
      where: { store: storeWhere, ...(month ? { month } : {}) },
      select: { storeId: true, month: true, type: true, amount: true },
    }),
  ]);
  const costMap = new Map<string, Partial<Record<CostTypeKey, number>>>();
  for (const c of costs) {
    const key = `${c.storeId}|${monthKey(c.month)}`;
    const entry = costMap.get(key) ?? {};
    entry[c.type] = c.amount.toNumber();
    costMap.set(key, entry);
  }
  return revenue.map((r) => {
    const mk = monthKey(r.month);
    const c = costMap.get(`${r.storeId}|${mk}`);
    return {
      storeId: r.storeId,
      month: mk,
      revenue: r.revenue.toNumber(),
      transactions: r.transactions,
      customers: r.customers,
      grossMarginPct: num(r.grossMarginPct),
      openDays: r.openDays,
      costs: c ?? {},
      operatingCosts: c ? Object.values(c).reduce((a, b) => a + b, 0) : null,
    };
  });
}

export async function getCategoryFacts(orgId: string, filter: FactFilter = {}): Promise<CategoryFact[]> {
  const month = monthWhere(filter);
  const rows = await db.categoryMetric.findMany({
    where: {
      store: { organizationId: orgId, ...(filter.storeIds ? { id: { in: filter.storeIds } } : {}) },
      ...(month ? { month } : {}),
    },
    select: {
      storeId: true, categoryId: true, month: true, revenue: true, marginPct: true,
      wasteValue: true, stockoutRatePct: true, areaSqm: true,
      category: { select: { name: true, sortOrder: true } },
    },
    orderBy: [{ month: "asc" }, { category: { sortOrder: "asc" } }],
  });
  return rows.map((r) => ({
    storeId: r.storeId,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    month: monthKey(r.month),
    revenue: r.revenue.toNumber(),
    marginPct: num(r.marginPct),
    wasteValue: num(r.wasteValue),
    stockoutRatePct: num(r.stockoutRatePct),
    areaSqm: r.areaSqm,
  }));
}

export interface HourlyPoint {
  storeId: string;
  hour: number;
  /** Average transactions per day in this hour, averaged over the months returned. */
  transactions: number;
}

/** Average hourly transaction profile over the given window. Empty when the store has no hourly data. */
export async function getHourlyProfile(orgId: string, filter: FactFilter = {}): Promise<HourlyPoint[]> {
  const month = monthWhere(filter);
  const rows = await db.storeMetric.groupBy({
    by: ["storeId", "hour"],
    where: {
      kind: "HOURLY_TRANSACTIONS",
      store: { organizationId: orgId, ...(filter.storeIds ? { id: { in: filter.storeIds } } : {}) },
      ...(month ? { month } : {}),
    },
    _avg: { value: true },
    orderBy: [{ storeId: "asc" }, { hour: "asc" }],
  });
  return rows.map((r) => ({ storeId: r.storeId, hour: r.hour, transactions: r._avg.value?.toNumber() ?? 0 }));
}

export interface KnownEventDTO {
  id: string;
  storeId: string | null;
  date: string;
  title: string;
  description: string | null;
}

export async function getKnownEvents(orgId: string, storeId?: string): Promise<KnownEventDTO[]> {
  const rows = await db.knownEvent.findMany({
    where: { organizationId: orgId, ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}) },
    orderBy: { date: "asc" },
  });
  return rows.map((e) => ({
    id: e.id, storeId: e.storeId, date: e.date.toISOString().slice(0, 10), title: e.title, description: e.description,
  }));
}

export interface SourceDTO {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string;
  excerpt: string;
  reliability: "OFFICIAL" | "COMMUNITY" | "COMMERCIAL" | "UNKNOWN" | "DEMO";
  isDemo: boolean;
}

export function toSourceDTO(s: {
  id: string; title: string; url: string; publisher: string; publishedAt: Date | null;
  accessedAt: Date; excerpt: string; reliability: SourceDTO["reliability"]; isDemo: boolean;
}): SourceDTO {
  return {
    id: s.id, title: s.title, url: s.url, publisher: s.publisher,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
    accessedAt: s.accessedAt.toISOString(), excerpt: s.excerpt,
    reliability: s.reliability, isDemo: s.isDemo,
  };
}
