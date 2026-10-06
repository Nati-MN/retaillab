"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseMonthlyCsv } from "@/lib/onboarding/csv";
import { monthToDate } from "@/lib/period";
import { idSchema, monthKeySchema, optionalNumber, organizationSchema, storeSchema, text } from "@/lib/validation";
import { formToObject, safeAction, type ActionState } from "../action";
import { db } from "../db";
import { getOnboardingContext, requireOnboardingOrg } from "../onboarding";
import { enforceRateLimit } from "../rateLimit";
import { ForbiddenError, ORG_COOKIE } from "../session";
import { deleteMonth, fieldError, importMonths, parseMonthEntry, saveStore, writeMonth } from "../storeWrites";

/** Store id from the form, verified against the organization in setup. */
async function onboardingStore(orgId: string, rawId: string | undefined) {
  const store = await db.store.findFirst({ where: { id: idSchema.parse(rawId), organizationId: orgId } });
  if (!store) throw new ForbiddenError("Store not found in this organization.");
  return store;
}

/** Step 1 — creates the organization and the OWNER membership (or updates the one in setup). */
export async function saveCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await getOnboardingContext();
    await enforceRateLimit("write", ctx.userId);
    if (ctx.hasCompletedOrg) redirect("/overview");
    const input = organizationSchema.parse(formToObject(formData));
    let orgId: string;
    if (ctx.org) {
      await db.organization.update({ where: { id: ctx.org.id }, data: input });
      orgId = ctx.org.id;
    } else {
      const org = await db.organization.create({
        data: { ...input, memberships: { create: { userId: ctx.userId, role: "OWNER" } } },
        select: { id: true },
      });
      orgId = org.id;
    }
    (await cookies()).set(ORG_COOKIE, orgId, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    redirect("/onboarding?step=2");
  });
}

/** Step 2 — add a store to the organization in setup. */
export async function onboardingAddStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);
    const input = storeSchema.parse(formToObject(formData));
    const count = await db.store.count({ where: { organizationId: org.id } });
    if (count >= 200) throw new ForbiddenError("Add further stores after setup, under Stores.");
    await saveStore(org.id, input);
    revalidatePath("/onboarding");
    return { message: `${input.name} added.` };
  });
}

export async function onboardingRemoveStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);
    const store = await onboardingStore(org.id, formToObject(formData).storeId);
    await db.store.deleteMany({ where: { id: store.id, organizationId: org.id } });
    revalidatePath("/onboarding");
    return { message: `${store.name} removed.` };
  });
}

/** Step 3 — one month of figures for a store. */
export async function onboardingSaveMonthAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);
    const raw = formToObject(formData);
    const store = await onboardingStore(org.id, raw.storeId);
    const entry = parseMonthEntry(raw, []);
    await writeMonth(store.id, entry, []);
    revalidatePath("/onboarding");
    return { message: `${entry.month} saved for ${store.name}.` };
  });
}

export async function onboardingDeleteMonthAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);
    const raw = formToObject(formData);
    const store = await onboardingStore(org.id, raw.storeId);
    await deleteMonth(store.id, monthKeySchema.parse(raw.month));
    revalidatePath("/onboarding");
    return { message: "Month removed." };
  });
}

/** Step 3 — pasted history. All lines are validated first; nothing is saved if any line is wrong. */
export async function onboardingImportCsvAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);
    const store = await onboardingStore(org.id, formToObject(formData).storeId);
    const csv = String(formData.get("csv") ?? "");
    if (csv.length > 20_000) throw fieldError("csv", "The pasted text is too long.");
    const { rows, errors } = parseMonthlyCsv(csv);
    const now = new Date().toISOString().slice(0, 7);
    const future = rows.filter((r) => r.month > now).map((r) => `${r.month} is in the future`);
    if (errors.length > 0 || future.length > 0) {
      throw new z.ZodError([
        ...errors.map((e) => ({ code: "custom" as const, path: ["csv"], message: `Line ${e.line}: ${e.message}` })),
        ...future.map((m) => ({ code: "custom" as const, path: ["csv"], message: m })),
      ]);
    }
    await importMonths(store.id, rows);
    revalidatePath("/onboarding");
    return { message: `${rows.length} month${rows.length === 1 ? "" : "s"} imported for ${store.name}.` };
  });
}

const categoryName = text(60);

/**
 * Step 4 — saves the category list (and optional figures for one store's
 * latest month), marks onboarding complete and opens the overview.
 */
export async function finishOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const { userId, org } = await requireOnboardingOrg();
    await enforceRateLimit("write", userId);

    const rawNames = formData.getAll("category").filter((v): v is string => typeof v === "string");
    if (rawNames.length > 40) throw fieldError("category", "At most 40 categories.");
    const names: string[] = [];
    for (const n of rawNames) {
      const name = categoryName.parse(n);
      if (!names.some((x) => x.toLowerCase() === name.toLowerCase())) names.push(name);
    }

    const raw = formToObject(formData);
    const figures: { name: string; revenue: number; marginPct?: number }[] = [];
    names.forEach((name, i) => {
      const idx = rawNames.findIndex((n) => n.trim().toLowerCase() === name.toLowerCase());
      const parsed = z.object({ revenue: optionalNumber({ min: 0, max: 1e10 }), margin: optionalNumber({ min: -100, max: 100 }) }).safeParse({
        revenue: raw[`revenue_${idx}`], margin: raw[`margin_${idx}`],
      });
      if (!parsed.success) throw fieldError(`row_${i}`, `${name}: ${parsed.error.issues[0]?.message ?? "invalid number"}`);
      if (parsed.data.revenue === undefined && parsed.data.margin !== undefined) throw fieldError(`row_${i}`, `${name}: enter the revenue for this margin`);
      if (parsed.data.revenue !== undefined) figures.push({ name, revenue: parsed.data.revenue, marginPct: parsed.data.margin });
    });

    let target: { storeId: string; month: Date } | null = null;
    if (figures.length > 0) {
      const store = await onboardingStore(org.id, raw.storeId);
      const latest = await db.monthlyRevenue.findFirst({ where: { storeId: store.id }, orderBy: { month: "desc" }, select: { month: true } });
      if (!latest) throw fieldError("storeId", `${store.name} has no monthly revenue yet, so category figures have no month to belong to. Clear them or go back to step 3.`);
      const monthK = monthKeySchema.parse(raw.month);
      if (monthToDate(monthK).getTime() !== latest.month.getTime()) throw fieldError("storeId", "The store's latest month changed. Reload this step.");
      target = { storeId: store.id, month: latest.month };
    }

    await db.$transaction(async (tx) => {
      await tx.category.deleteMany({ where: { organizationId: org.id, name: { notIn: names } } });
      for (const [i, name] of names.entries()) {
        await tx.category.upsert({
          where: { organizationId_name: { organizationId: org.id, name } },
          create: { organizationId: org.id, name, sortOrder: i },
          update: { sortOrder: i },
        });
      }
      if (target) {
        const cats = await tx.category.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } });
        for (const f of figures) {
          const categoryId = cats.find((c) => c.name === f.name)!.id;
          await tx.categoryMetric.upsert({
            where: { storeId_categoryId_month: { storeId: target.storeId, categoryId, month: target.month } },
            create: { storeId: target.storeId, categoryId, month: target.month, revenue: f.revenue, marginPct: f.marginPct ?? null },
            update: { revenue: f.revenue, marginPct: f.marginPct ?? null },
          });
        }
      }
      await tx.organization.update({ where: { id: org.id }, data: { onboardingCompletedAt: new Date() } });
    });
    revalidatePath("/", "layout");
    redirect("/overview");
  });
}
