"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { formToObject, safeAction, type ActionState } from "@/server/action";
import { getEarliestMonth, getLatestMonth } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { ForbiddenError, requireWriter } from "@/server/session";
import { monthToDate } from "@/lib/period";
import { normalizeSections } from "@/lib/reports/sections";
import { idSchema, monthKeySchema, text } from "@/lib/validation";

const createSchema = z
  .object({
    title: text(160),
    from: monthKeySchema,
    to: monthKeySchema,
    storeScope: z.enum(["all", "selection"]),
  })
  .superRefine((v, ctx) => {
    if (v.from > v.to) ctx.addIssue({ code: "custom", path: ["to"], message: "End month must not be before the start month" });
  });

const fieldError = (path: string, message: string) => new z.ZodError([{ code: "custom", path: [path], message }]);

export async function createReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = createSchema.parse(formToObject(formData));

    const [earliest, latest] = await Promise.all([getEarliestMonth(ctx.orgId), getLatestMonth(ctx.orgId)]);
    if (!earliest || !latest) throw new ForbiddenError("There is no revenue data yet, so a report has no period to cover.");
    if (input.from < earliest) throw fieldError("from", `Data starts in ${earliest}`);
    if (input.to > latest) throw fieldError("to", `Data ends in ${latest}`);

    const sections = normalizeSections(formData.getAll("sections").map(String));
    if (sections.length === 0) throw fieldError("sections", "Select at least one section");

    let storeIds: string[] = [];
    if (input.storeScope === "selection") {
      const wanted = z.array(idSchema).max(500).parse(formData.getAll("storeIds").map(String));
      if (wanted.length === 0) throw fieldError("storeIds", "Select at least one store");
      const owned = await db.store.findMany({ where: { organizationId: ctx.orgId, id: { in: wanted } }, select: { id: true } });
      if (owned.length !== new Set(wanted).size) throw new ForbiddenError("Store not found in this organization.");
      storeIds = owned.map((s) => s.id);
    }

    const report = await db.report.create({
      data: {
        organizationId: ctx.orgId,
        createdById: ctx.userId,
        title: input.title,
        periodStart: monthToDate(input.from),
        periodEnd: monthToDate(input.to),
        sections,
        storeIds,
      },
    });
    revalidatePath("/reports");
    redirect(`/reports/${report.id}`);
  });
}

export async function deleteReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const id = idSchema.parse(formToObject(formData).id);
    const r = await db.report.deleteMany({ where: { id, organizationId: ctx.orgId } });
    if (r.count === 0) throw new ForbiddenError("Report not found in this organization.");
    revalidatePath("/reports");
    redirect("/reports");
  });
}
