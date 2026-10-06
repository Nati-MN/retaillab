import "server-only";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { COST_TYPES, type CostTypeKey } from "@/lib/analytics/types";
import { monthKey, monthToDate, type MonthKey } from "@/lib/period";
import { monthlyDataSchema, optionalNumber, type StoreInput } from "@/lib/validation";
import { db } from "./db";

/**
 * Shared write helpers for stores and monthly data. NOT server actions: callers
 * (src/server/actions/*) must authorize and verify that the store belongs to
 * the caller's organization before calling anything here.
 */

export function fieldError(field: string, message: string): ZodError {
  return new ZodError([{ code: "custom", path: [field], message }]);
}

export function storeData(input: StoreInput) {
  let openingDate: Date | null = null;
  if (input.openingDate) {
    openingDate = new Date(`${input.openingDate}T00:00:00Z`);
    if (Number.isNaN(openingDate.getTime()) || openingDate.toISOString().slice(0, 10) !== input.openingDate) {
      throw fieldError("openingDate", "This date does not exist");
    }
    if (openingDate.getTime() > Date.now()) throw fieldError("openingDate", "Opening date cannot be in the future");
  }
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    throw fieldError(input.latitude === undefined ? "latitude" : "longitude", "Enter both latitude and longitude, or neither");
  }
  if (input.opensAt && input.closesAt && input.opensAt >= input.closesAt) {
    throw fieldError("closesAt", "Closing time must be after opening time");
  }
  return {
    name: input.name,
    code: input.code.toUpperCase(),
    address: input.address,
    city: input.city,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    openingDate,
    areaSqm: input.areaSqm ?? null,
    employees: input.employees ?? null,
    parkingSpaces: input.parkingSpaces ?? null,
    type: input.type,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
    openDaysPerWeek: input.openDaysPerWeek ?? null,
  };
}

/** Creates or updates a store inside `orgId`; a duplicate code becomes a field error. */
export async function saveStore(orgId: string, input: StoreInput, storeId?: string): Promise<string> {
  const data = storeData(input);
  const clash = await db.store.findFirst({
    where: { organizationId: orgId, code: { equals: data.code, mode: "insensitive" }, ...(storeId ? { NOT: { id: storeId } } : {}) },
    select: { name: true },
  });
  if (clash) throw fieldError("code", `Code ${data.code} is already used by "${clash.name}"`);
  try {
    if (storeId) {
      const r = await db.store.updateMany({ where: { id: storeId, organizationId: orgId }, data });
      if (r.count !== 1) throw fieldError("name", "Store not found");
      return storeId;
    }
    const created = await db.store.create({ data: { ...data, organizationId: orgId }, select: { id: true } });
    return created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw fieldError("code", `Code ${data.code} is already used by another store`);
    }
    throw e;
  }
}

const money = () => optionalNumber({ min: 0, max: 1e10 });

export interface MonthEntry {
  month: MonthKey;
  revenue: number;
  transactions?: number;
  customers?: number;
  grossMarginPct?: number;
  openDays?: number;
  costs: Partial<Record<CostTypeKey, number>>;
  categories: { categoryId: string; revenue: number; marginPct?: number }[];
}

function assertMonthAllowed(month: MonthKey) {
  if (month > monthKey(new Date())) throw fieldError("month", "This month is in the future");
  if (month < "2000-01") throw fieldError("month", "Months before 2000 are not supported");
}

/**
 * Validates the monthly entry form: `monthlyDataSchema` fields, `cost_<TYPE>`
 * and — for the given category ids — `cat_<id>_revenue` / `cat_<id>_margin`.
 */
export function parseMonthEntry(raw: Record<string, string | undefined>, categoryIds: readonly string[]): MonthEntry {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const t of COST_TYPES) shape[`cost_${t}`] = money();
  for (const id of categoryIds) {
    shape[`cat_${id}_revenue`] = money();
    shape[`cat_${id}_margin`] = optionalNumber({ min: -100, max: 100 });
  }
  const base = monthlyDataSchema.parse(raw);
  const extra = z.object(shape).parse(raw) as Record<string, number | undefined>;
  assertMonthAllowed(base.month);
  if (base.customers !== undefined && base.transactions !== undefined && base.customers > base.transactions * 20) {
    throw fieldError("customers", "Customers is implausibly high compared with transactions");
  }
  const costs: MonthEntry["costs"] = {};
  for (const t of COST_TYPES) {
    const v = extra[`cost_${t}`];
    if (v !== undefined) costs[t] = v;
  }
  const categories: MonthEntry["categories"] = [];
  for (const id of categoryIds) {
    const revenue = extra[`cat_${id}_revenue`];
    const marginPct = extra[`cat_${id}_margin`];
    if (revenue === undefined && marginPct !== undefined) throw fieldError(`cat_${id}_revenue`, "Enter the revenue for this margin");
    if (revenue !== undefined) categories.push({ categoryId: id, revenue, marginPct });
  }
  return { ...base, costs, categories };
}

/**
 * Upserts one store-month. The form shows the complete month, so empty fields
 * clear the stored value (null = not provided), cost lines left empty are
 * removed, and listed categories left empty are removed.
 */
export async function writeMonth(storeId: string, entry: MonthEntry, categoryIds: readonly string[]): Promise<void> {
  const month = monthToDate(entry.month);
  const fields = {
    revenue: entry.revenue,
    transactions: entry.transactions ?? null,
    customers: entry.customers ?? null,
    grossMarginPct: entry.grossMarginPct ?? null,
    openDays: entry.openDays ?? null,
  };
  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.monthlyRevenue.upsert({ where: { storeId_month: { storeId, month } }, create: { storeId, month, ...fields }, update: fields }),
  ];
  for (const type of COST_TYPES) {
    const amount = entry.costs[type];
    ops.push(
      amount === undefined
        ? db.cost.deleteMany({ where: { storeId, month, type } })
        : db.cost.upsert({ where: { storeId_month_type: { storeId, month, type } }, create: { storeId, month, type, amount }, update: { amount } }),
    );
  }
  const given = new Map(entry.categories.map((c) => [c.categoryId, c]));
  for (const categoryId of categoryIds) {
    const c = given.get(categoryId);
    ops.push(
      c
        ? db.categoryMetric.upsert({
            where: { storeId_categoryId_month: { storeId, categoryId, month } },
            create: { storeId, categoryId, month, revenue: c.revenue, marginPct: c.marginPct ?? null },
            update: { revenue: c.revenue, marginPct: c.marginPct ?? null },
          })
        : db.categoryMetric.deleteMany({ where: { storeId, categoryId, month } }),
    );
  }
  await db.$transaction(ops);
}

/** Bulk import of historical months: sets revenue and only the optional fields that were supplied. */
export async function importMonths(
  storeId: string,
  rows: readonly { month: MonthKey; revenue: number; transactions?: number; customers?: number; grossMarginPct?: number }[],
): Promise<void> {
  const current = monthKey(new Date());
  await db.$transaction(
    rows.filter((r) => r.month <= current).map((r) => {
      const month = monthToDate(r.month);
      const optional = {
        ...(r.transactions !== undefined ? { transactions: r.transactions } : {}),
        ...(r.customers !== undefined ? { customers: r.customers } : {}),
        ...(r.grossMarginPct !== undefined ? { grossMarginPct: r.grossMarginPct } : {}),
      };
      return db.monthlyRevenue.upsert({
        where: { storeId_month: { storeId, month } },
        create: { storeId, month, revenue: r.revenue, ...optional },
        update: { revenue: r.revenue, ...optional },
      });
    }),
  );
}

export async function deleteMonth(storeId: string, monthK: MonthKey): Promise<void> {
  const month = monthToDate(monthK);
  await db.$transaction([
    db.monthlyRevenue.deleteMany({ where: { storeId, month } }),
    db.cost.deleteMany({ where: { storeId, month } }),
    db.categoryMetric.deleteMany({ where: { storeId, month } }),
    db.storeMetric.deleteMany({ where: { storeId, month } }),
  ]);
}
