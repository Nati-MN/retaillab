"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { formToObject, safeAction, type ActionState } from "@/server/action";
import { enforceRateLimit } from "@/server/rateLimit";
import { assertStoreInOrg, ForbiddenError, requireOrg, requireWriter } from "@/server/session";
import { idSchema, isoDateSchema, optionalNumber, text } from "@/lib/validation";
import {
  canTransition, EXPERIMENT_DECISIONS, EXPERIMENT_STATUSES, METRIC_UNITS, STATUS_LABELS, strategyStatusForDecision,
} from "@/lib/experiments/model";
import { fmtDate } from "@/lib/format";

const MAX_VALUE = 1e11;

function revalidateExperiment(id: string, storeIds: (string | null)[]) {
  revalidatePath("/experiments");
  revalidatePath(`/experiments/${id}`);
  revalidatePath("/strategies");
  revalidatePath("/reports", "layout");
  for (const s of storeIds) if (s) revalidatePath(`/stores/${s}`);
}

const createSchema = z
  .object({
    title: text(120),
    hypothesis: text(1000),
    testStoreId: idSchema,
    controlStoreId: idSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    cost: optionalNumber({ min: 0, max: MAX_VALUE }),
    notes: text(4000, 0).optional(),
    strategyId: idSchema.optional(),
    primaryName: text(80),
    primaryUnit: z.enum(METRIC_UNITS),
  })
  .superRefine((v, ctx) => {
    if (v.controlStoreId && v.controlStoreId === v.testStoreId) {
      ctx.addIssue({ code: "custom", path: ["controlStoreId"], message: "Control store must differ from the test store" });
    }
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must not be before the start date" });
    }
  });

const secondarySchema = z
  .array(z.object({ name: text(80), unit: z.enum(METRIC_UNITS) }))
  .max(12, "At most 12 secondary metrics");

export async function createExperiment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = createSchema.parse(formToObject(formData));
    const names = formData.getAll("metricName").map((v) => String(v).trim());
    const units = formData.getAll("metricUnit").map((v) => String(v));
    const secondary = secondarySchema.parse(
      names.map((name, i) => ({ name, unit: units[i] })).filter((m) => m.name !== ""),
    );
    const seen = new Set([input.primaryName.toLowerCase()]);
    for (const m of secondary) {
      if (seen.has(m.name.toLowerCase())) throw new ForbiddenError(`Metric “${m.name}” is listed twice.`);
      seen.add(m.name.toLowerCase());
    }

    await assertStoreInOrg(ctx.orgId, input.testStoreId);
    if (input.controlStoreId) await assertStoreInOrg(ctx.orgId, input.controlStoreId);
    let strategyId: string | null = null;
    if (input.strategyId) {
      const s = await db.strategy.findFirst({ where: { id: input.strategyId, organizationId: ctx.orgId }, select: { id: true } });
      if (!s) throw new ForbiddenError("Strategy not found in this organization.");
      strategyId = s.id;
    }

    const created = await db.$transaction(async (tx) => {
      const e = await tx.experiment.create({
        data: {
          organizationId: ctx.orgId,
          strategyId,
          title: input.title,
          hypothesis: input.hypothesis,
          testStoreId: input.testStoreId,
          controlStoreId: input.controlStoreId ?? null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          cost: input.cost ?? null,
          notes: input.notes || null,
          isDemo: false,
          metrics: {
            create: [
              { name: input.primaryName, unit: input.primaryUnit, isPrimary: true },
              ...secondary.map((m) => ({ name: m.name, unit: m.unit, isPrimary: false })),
            ],
          },
        },
      });
      if (strategyId) {
        await tx.strategy.updateMany({ where: { id: strategyId, organizationId: ctx.orgId }, data: { status: "TESTING" } });
      }
      return e;
    });
    revalidateExperiment(created.id, [input.testStoreId, input.controlStoreId ?? null]);
    redirect(`/experiments/${created.id}`);
  });
}

async function loadOwned(orgId: string, id: string) {
  const e = await db.experiment.findFirst({ where: { id, organizationId: orgId }, include: { metrics: true } });
  if (!e) throw new ForbiddenError("Experiment not found in this organization.");
  return e;
}

const statusSchema = z.object({
  id: idSchema,
  to: z.enum(EXPERIMENT_STATUSES),
  reason: text(500, 0).optional(),
});

export async function setExperimentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = statusSchema.parse(formToObject(formData));
    const e = await loadOwned(ctx.orgId, input.id);
    if (!canTransition(e.status, input.to)) {
      throw new ForbiddenError(`An experiment that is ${STATUS_LABELS[e.status].toLowerCase()} cannot be set to ${STATUS_LABELS[input.to].toLowerCase()}.`);
    }
    if (input.to === "STOPPED" && !input.reason) {
      throw new z.ZodError([{ code: "custom", path: ["reason"], message: "State why the experiment is stopped" }]);
    }
    const today = fmtDate(new Date());
    const reopening = (e.status === "COMPLETED" || e.status === "STOPPED") && (input.to === "RUNNING" || input.to === "PLANNED");
    const lines: string[] = [];
    if (input.to === "STOPPED") lines.push(`[Stopped ${today}] ${input.reason}`);
    if (reopening) {
      lines.push(`[Reopened ${today}]${e.decision ? ` Previous decision (${e.decision.toLowerCase()}) withdrawn.` : ""}`);
    }
    const notes = lines.length > 0 ? [e.notes, ...lines].filter(Boolean).join("\n\n").slice(0, 4000) : e.notes;
    await db.$transaction(async (tx) => {
      await tx.experiment.update({
        where: { id: e.id },
        data: { status: input.to, notes, ...(reopening ? { decision: null, decisionNote: null } : {}) },
      });
      if (reopening && e.strategyId && e.decision && strategyStatusForDecision(e.decision)) {
        await tx.strategy.updateMany({ where: { id: e.strategyId, organizationId: ctx.orgId }, data: { status: "TESTING" } });
      }
    });
    revalidateExperiment(e.id, [e.testStoreId, e.controlStoreId]);
    return { message: `Status set to ${STATUS_LABELS[input.to]}.` };
  });
}

const VALUE_KEYS = ["testBefore", "testAfter", "controlBefore", "controlAfter"] as const;
const valueSchema = optionalNumber({ min: -MAX_VALUE, max: MAX_VALUE });

export async function saveExperimentResults(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const raw = formToObject(formData);
    const id = idSchema.parse(raw.id);
    const e = await loadOwned(ctx.orgId, id);
    const hasControl = e.controlStoreId !== null;
    const fieldErrors: Record<string, string[]> = {};
    const updates = e.metrics.map((m) => {
      const data: Record<(typeof VALUE_KEYS)[number], number | null> = { testBefore: null, testAfter: null, controlBefore: null, controlAfter: null };
      for (const k of VALUE_KEYS) {
        if (!hasControl && k.startsWith("control")) continue;
        const field = `${m.id}.${k}`;
        const parsed = valueSchema.safeParse(raw[field]);
        if (!parsed.success) fieldErrors[field] = parsed.error.issues.map((i) => i.message);
        else data[k] = (parsed.data as number | undefined) ?? null;
      }
      return { id: m.id, data };
    });
    if (Object.keys(fieldErrors).length > 0) {
      throw new z.ZodError(Object.entries(fieldErrors).map(([path, msgs]) => ({ code: "custom" as const, path: [path], message: msgs[0] ?? "Enter a number" })));
    }
    await db.$transaction(updates.map((u) => db.experimentMetric.update({ where: { id: u.id }, data: u.data })));
    revalidateExperiment(e.id, [e.testStoreId, e.controlStoreId]);
    return { message: "Results saved." };
  });
}

const notesSchema = z.object({ id: idSchema, notes: text(4000, 0).optional() });

export async function saveExperimentNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = notesSchema.parse(formToObject(formData));
    const e = await loadOwned(ctx.orgId, input.id);
    await db.experiment.update({ where: { id: e.id }, data: { notes: input.notes || null } });
    revalidateExperiment(e.id, [e.testStoreId, e.controlStoreId]);
    return { message: "Notes saved." };
  });
}

const decisionSchema = z.object({
  id: idSchema,
  decision: z.enum(EXPERIMENT_DECISIONS, { required_error: "Choose a decision", invalid_type_error: "Choose a decision" }),
  decisionNote: text(1000, 0).optional(),
});

export async function recordExperimentDecision(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = decisionSchema.parse(formToObject(formData));
    const e = await loadOwned(ctx.orgId, input.id);
    if (e.status !== "COMPLETED" && e.status !== "STOPPED") {
      throw new ForbiddenError("A decision can only be recorded once the experiment is completed or stopped.");
    }
    const strategyStatus = strategyStatusForDecision(input.decision);
    await db.$transaction(async (tx) => {
      await tx.experiment.update({ where: { id: e.id }, data: { decision: input.decision, decisionNote: input.decisionNote || null } });
      if (e.strategyId && strategyStatus) {
        await tx.strategy.updateMany({ where: { id: e.strategyId, organizationId: ctx.orgId }, data: { status: strategyStatus } });
      }
    });
    revalidateExperiment(e.id, [e.testStoreId, e.controlStoreId]);
    return { message: "Decision recorded." };
  });
}

export async function deleteExperiment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOrg();
    if (ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can delete an experiment.");
    await enforceRateLimit("write", ctx.userId);
    const id = idSchema.parse(formToObject(formData).id);
    const e = await loadOwned(ctx.orgId, id);
    await db.experiment.delete({ where: { id: e.id } });
    revalidateExperiment(e.id, [e.testStoreId, e.controlStoreId]);
    redirect("/experiments");
  });
}
