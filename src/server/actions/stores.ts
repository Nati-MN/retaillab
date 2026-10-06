"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isoDateSchema, idSchema, monthKeySchema, storeSchema, text } from "@/lib/validation";
import { formToObject, safeAction, type ActionState } from "../action";
import { db } from "../db";
import { enforceRateLimit } from "../rateLimit";
import { assertStoreInOrg, requireOwner, requireWriter } from "../session";
import { deleteMonth, fieldError, parseMonthEntry, saveStore, writeMonth } from "../storeWrites";

function revalidateStore(storeId: string) {
  revalidatePath("/overview");
  revalidatePath("/stores");
  revalidatePath(`/stores/${storeId}`, "layout");
}

/** Create (no `storeId` field) or update a store. Redirects to the scorecard on success. */
export async function saveStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const input = storeSchema.parse(raw);
    let storeId: string | undefined;
    if (raw.storeId !== undefined) storeId = (await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId))).id;
    const id = await saveStore(ctx.orgId, input, storeId);
    revalidateStore(id);
    redirect(`/stores/${id}`);
  });
}

/** Owner only. The form must repeat the store code as confirmation. */
export async function deleteStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const store = await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId));
    if ((raw.confirm ?? "").toUpperCase() !== store.code.toUpperCase()) {
      throw fieldError("confirm", `Type the store code ${store.code} to confirm`);
    }
    await db.store.deleteMany({ where: { id: store.id, organizationId: ctx.orgId } });
    revalidatePath("/overview");
    revalidatePath("/stores");
    redirect("/stores");
  });
}

async function orgCategoryIds(orgId: string): Promise<string[]> {
  const rows = await db.category.findMany({ where: { organizationId: orgId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Upsert one month of figures for a store (unique on store + month). */
export async function saveMonthAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const store = await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId));
    const categoryIds = await orgCategoryIds(ctx.orgId);
    const entry = parseMonthEntry(raw, categoryIds);
    await writeMonth(store.id, entry, categoryIds);
    revalidateStore(store.id);
    redirect(`/stores/${store.id}/data?saved=${entry.month}`);
  });
}

export async function deleteMonthAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const store = await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId));
    const month = monthKeySchema.parse(raw.month);
    await deleteMonth(store.id, month);
    revalidateStore(store.id);
    return { message: `Deleted ${month}.` };
  });
}

const eventSchema = z.object({
  date: isoDateSchema,
  title: text(120),
  description: text(500, 0).optional(),
});

export async function addEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const store = await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId));
    const input = eventSchema.parse(raw);
    const date = new Date(`${input.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw fieldError("date", "This date does not exist");
    await db.knownEvent.create({
      data: { organizationId: ctx.orgId, storeId: store.id, date, title: input.title, description: input.description || null },
    });
    revalidateStore(store.id);
    return { message: "Event recorded." };
  });
}

export async function deleteEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const store = await assertStoreInOrg(ctx.orgId, idSchema.parse(raw.storeId));
    await db.knownEvent.deleteMany({ where: { id: idSchema.parse(raw.eventId), organizationId: ctx.orgId, storeId: store.id } });
    revalidateStore(store.id);
    return { message: "Event removed." };
  });
}
