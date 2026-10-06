"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SCENARIO_VARIANTS } from "@/lib/calc";
import { addMonths } from "@/lib/period";
import { STRATEGY_CATEGORIES, getLibraryEntry } from "@/lib/strategy/library";
import { generateStrategyDrafts } from "@/lib/strategy/rules";
import { allowedInputKeys } from "@/lib/strategy/scenarioKinds";
import { idSchema, optionalNumber, text } from "@/lib/validation";
import { formToObject, safeAction, type ActionState } from "@/server/action";
import { db } from "@/server/db";
import { persistStrategyDraft } from "@/server/demo/seedDemo";
import { getCategoryFacts, getHourlyProfile, getLatestMonth, getMonthFacts, getStores } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { assertStoreInOrg, requireWriter } from "@/server/session";

/** An expected, user-facing failure (as opposed to a bug, which safeAction hides). */
class UserError extends Error {}

async function act<T>(fn: () => Promise<{ message?: string; data?: T } | void>): Promise<ActionState<T>> {
  let userError: string | null = null;
  const result = await safeAction<T>(async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UserError) {
        userError = e.message;
        return;
      }
      throw e;
    }
  });
  return userError !== null ? { ok: false, error: userError } : result;
}

function revalidate(storeId?: string | null) {
  revalidatePath("/strategies");
  if (storeId) revalidatePath(`/stores/${storeId}`);
}

const lines = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean))
    .pipe(z.array(z.string().max(400, "Each line: at most 400 characters")).max(max, `At most ${max} lines`));

const CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;
const EFFORT = ["LOW", "MEDIUM", "HIGH"] as const;
const STRATEGY_STATUS = ["HYPOTHESIS", "SIMULATED", "TESTING", "VALIDATED", "REJECTED"] as const;
const OPPORTUNITY_STATUS = ["NEW", "INVESTIGATING", "READY_TO_TEST", "TESTING", "VALIDATED", "REJECTED", "INCONCLUSIVE"] as const;
const SCENARIO_KIND = ["OPENING_HOURS", "BREAK_EVEN", "REVENUE_OPPORTUNITY", "TRANSACTION_UPLIFT", "COST_REDUCTION"] as const;

// ── Rule engine ─────────────────────────────────────────────────────────────

/**
 * Runs the deterministic rule engine over the organization's data and stores
 * the resulting hypotheses. No language model is involved.
 */
export async function runAnalysis(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const latest = await getLatestMonth(ctx.orgId);
    if (!latest) throw new UserError("There is no monthly revenue data yet, so there is nothing to analyse. Enter monthly data for at least one store first.");

    const [stores, facts, categoryFacts, hourly, signalRows] = await Promise.all([
      getStores(ctx.orgId),
      getMonthFacts(ctx.orgId),
      getCategoryFacts(ctx.orgId, { from: addMonths(latest, -2), to: latest }),
      getHourlyProfile(ctx.orgId, { from: addMonths(latest, -5), to: latest }),
      db.locationSignal.findMany({
        where: { store: { organizationId: ctx.orgId } },
        select: { storeId: true, type: true, name: true, distanceM: true, isDemo: true },
      }),
    ]);

    const drafts = generateStrategyDrafts({
      stores, facts, categoryFacts, hourly, signals: signalRows, latestMonth: latest, currency: ctx.org.currency,
    });

    let created = 0;
    let updated = 0;
    let kept = 0;
    for (const d of drafts) {
      const existing = await db.strategy.findFirst({
        where: { organizationId: ctx.orgId, storeId: d.storeId, ruleKey: d.ruleKey },
        select: { id: true, status: true, opportunities: { select: { id: true } }, experiments: { select: { id: true } } },
      });
      if (existing && existing.status !== "HYPOTHESIS") {
        kept++; // persistStrategyDraft leaves records that progressed beyond HYPOTHESIS untouched
        continue;
      }
      if (existing) {
        // The draft replaces the old record. Remove its generated scenario so it does not linger as an orphan.
        await db.scenario.deleteMany({ where: { organizationId: ctx.orgId, strategyId: existing.id } });
      }
      const id = await persistStrategyDraft(db, ctx.orgId, d);
      if (existing) {
        // Deleting the old record cleared these links (ON DELETE SET NULL) — point them at the replacement.
        const oppIds = existing.opportunities.map((o) => o.id);
        const expIds = existing.experiments.map((e) => e.id);
        if (oppIds.length) await db.opportunity.updateMany({ where: { id: { in: oppIds }, organizationId: ctx.orgId }, data: { strategyId: id } });
        if (expIds.length) await db.experiment.updateMany({ where: { id: { in: expIds }, organizationId: ctx.orgId }, data: { strategyId: id } });
        updated++;
      } else {
        created++;
      }
    }

    revalidate();
    for (const s of stores) revalidatePath(`/stores/${s.id}`);
    const n = drafts.length;
    return {
      message:
        n === 0
          ? `Analysis complete: no rule was triggered by the data of ${stores.length} store${stores.length === 1 ? "" : "s"} (data to ${latest}). Rules stay silent when the data they need is missing.`
          : `Analysis complete: the rules produced ${n} hypothes${n === 1 ? "is" : "es"} from ${stores.length} store${stores.length === 1 ? "" : "s"} (data to ${latest}) — ${created} created, ${updated} updated` +
            (kept ? `, ${kept} left unchanged because ${kept === 1 ? "it has" : "they have"} moved beyond “Hypothesis” status.` : "."),
    };
  });
}

// ── Strategies ──────────────────────────────────────────────────────────────

const userStrategySchema = z.object({
  storeId: idSchema,
  libraryKey: z.string().max(60).optional(),
  title: text(140),
  category: z.enum(STRATEGY_CATEGORIES as [string, ...string[]]),
  observation: text(1500),
  hypothesis: text(1000),
  whyItMayMatter: text(1500),
  proposedTest: text(1500),
  assumptions: lines(12),
  risks: lines(12),
  metricsToWatch: lines(12),
  costAssumption: optionalNumber({ min: 0, max: 1_000_000_000 }),
  dataConfidence: z.enum(CONFIDENCE),
  confidenceNote: text(600),
});

export async function createUserStrategy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = userStrategySchema.parse(formToObject(formData));
    await assertStoreInOrg(ctx.orgId, input.storeId);
    const s = await db.strategy.create({
      data: {
        organizationId: ctx.orgId,
        storeId: input.storeId,
        libraryKey: getLibraryEntry(input.libraryKey)?.key ?? null,
        title: input.title,
        category: input.category as (typeof STRATEGY_CATEGORIES)[number],
        origin: "USER",
        observation: input.observation,
        hypothesis: input.hypothesis,
        whyItMayMatter: input.whyItMayMatter,
        proposedTest: input.proposedTest,
        assumptions: input.assumptions,
        risks: input.risks,
        metricsToWatch: input.metricsToWatch,
        costAssumption: input.costAssumption ?? null,
        dataConfidence: input.dataConfidence,
        confidenceNote: input.confidenceNote,
      },
    });
    revalidate(input.storeId);
    redirect(`/strategies?tab=hypotheses&store=${input.storeId}&open=${s.id}#strategy-${s.id}`);
  });
}

export async function updateStrategyStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id, status } = z.object({ id: idSchema, status: z.enum(STRATEGY_STATUS) }).parse(formToObject(formData));
    const s = await db.strategy.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, storeId: true } });
    if (!s) throw new UserError("Hypothesis not found.");
    await db.strategy.update({ where: { id: s.id }, data: { status } });
    revalidate(s.storeId);
    return { message: "Status saved." };
  });
}

export async function dismissStrategy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id } = z.object({ id: idSchema }).parse(formToObject(formData));
    const s = await db.strategy.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, storeId: true } });
    if (!s) throw new UserError("Hypothesis not found.");
    await db.$transaction([
      db.scenario.deleteMany({ where: { organizationId: ctx.orgId, strategyId: s.id } }),
      db.strategy.delete({ where: { id: s.id } }),
    ]);
    revalidate(s.storeId);
    return { message: "Hypothesis dismissed." };
  });
}

export async function addStrategyToBoard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id } = z.object({ id: idSchema }).parse(formToObject(formData));
    const s = await db.strategy.findFirst({
      where: { id, organizationId: ctx.orgId },
      include: { scenarios: { orderBy: { createdAt: "asc" }, take: 1 }, opportunities: { select: { id: true } } },
    });
    if (!s) throw new UserError("Hypothesis not found.");
    if (!s.storeId) throw new UserError("This hypothesis is not linked to a store, so it cannot be placed on the board.");
    if (s.opportunities.length) throw new UserError("This hypothesis is already on the opportunity board.");
    const sc = s.scenarios[0];
    await db.opportunity.create({
      data: {
        organizationId: ctx.orgId,
        storeId: s.storeId,
        strategyId: s.id,
        title: s.title,
        observation: s.observation,
        hypothesis: s.hypothesis,
        impactScenario: sc?.derivation ?? "No scenario has been calculated for this hypothesis yet.",
        estimatedCost: s.costAssumption,
        effort: sc?.kind === "OPENING_HOURS" ? "HIGH" : sc?.kind === "COST_REDUCTION" ? "LOW" : "MEDIUM",
        dataConfidence: s.dataConfidence,
        suggestedExperiment: s.proposedTest,
      },
    });
    revalidate(s.storeId);
    return { message: "Added to the opportunity board." };
  });
}

// ── Scenarios ───────────────────────────────────────────────────────────────

const scenarioSchema = z.object({
  scenarioId: idSchema.optional(),
  name: text(120),
  kind: z.enum(SCENARIO_KIND),
  storeId: idSchema.optional(),
  derivation: z.string().trim().max(1500, "At most 1500 characters").optional(),
  inputs: z.string().max(8000),
});

const variantInputs = z.record(z.string().max(60), z.number().finite().min(-999_999_999).max(999_999_999));
const inputsSchema = z.object({ CONSERVATIVE: variantInputs, BASE: variantInputs, OPTIMISTIC: variantInputs });

export async function saveScenario(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const input = scenarioSchema.parse(formToObject(formData));
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.inputs);
    } catch {
      throw new UserError("The scenario inputs could not be read. Reload the page and try again.");
    }
    const variants = inputsSchema.parse(parsed);
    const allowed = new Set(allowedInputKeys(input.kind));
    const rows = SCENARIO_VARIANTS.flatMap((variant) =>
      Object.entries(variants[variant])
        .filter(([key]) => allowed.has(key))
        .map(([key, value]) => ({ variant, key, value })),
    );
    if (rows.length === 0) throw new UserError("Enter at least one assumption before saving.");
    if (input.storeId) await assertStoreInOrg(ctx.orgId, input.storeId);

    let id: string;
    if (input.scenarioId) {
      const existing = await db.scenario.findFirst({ where: { id: input.scenarioId, organizationId: ctx.orgId } });
      if (!existing) throw new UserError("Scenario not found.");
      if (existing.strategyId) throw new UserError("This scenario belongs to a hypothesis and cannot be overwritten. Use “Save as new scenario”.");
      id = existing.id;
      await db.$transaction([
        db.scenarioInput.deleteMany({ where: { scenarioId: id } }),
        db.scenario.update({
          where: { id },
          data: { name: input.name, kind: input.kind, storeId: input.storeId ?? null, derivation: input.derivation ?? null, inputs: { create: rows } },
        }),
      ]);
    } else {
      const created = await db.scenario.create({
        data: {
          organizationId: ctx.orgId, name: input.name, kind: input.kind, storeId: input.storeId ?? null,
          derivation: input.derivation ?? null, inputs: { create: rows },
        },
      });
      id = created.id;
    }
    revalidate();
    redirect(`/strategies?tab=simulator&scenario=${id}&saved=1`);
  });
}

export async function deleteScenario(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id } = z.object({ id: idSchema }).parse(formToObject(formData));
    const r = await db.scenario.deleteMany({ where: { id, organizationId: ctx.orgId, strategyId: null } });
    if (r.count === 0) throw new UserError("Scenario not found, or it belongs to a hypothesis and cannot be deleted here.");
    revalidate();
    return { message: "Scenario deleted." };
  });
}

// ── Opportunity board ───────────────────────────────────────────────────────

const opportunitySchema = z.object({
  id: idSchema.optional(),
  storeId: idSchema,
  title: text(140),
  observation: text(1500),
  hypothesis: text(1000),
  impactScenario: text(1500),
  estimatedCost: optionalNumber({ min: 0, max: 1_000_000_000 }),
  effort: z.enum(EFFORT),
  dataConfidence: z.enum(CONFIDENCE),
  suggestedExperiment: text(1500),
  status: z.enum(OPPORTUNITY_STATUS),
});

export async function saveOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const { id, ...input } = opportunitySchema.parse(formToObject(formData));
    await assertStoreInOrg(ctx.orgId, input.storeId);
    const data = { ...input, estimatedCost: input.estimatedCost ?? null };
    if (id) {
      const existing = await db.opportunity.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, storeId: true } });
      if (!existing) throw new UserError("Opportunity not found.");
      await db.opportunity.update({ where: { id: existing.id }, data });
      if (existing.storeId !== input.storeId) revalidatePath(`/stores/${existing.storeId}`);
    } else {
      await db.opportunity.create({ data: { ...data, organizationId: ctx.orgId } });
    }
    revalidate(input.storeId);
    redirect("/strategies?tab=board");
  });
}

export async function updateOpportunityStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id, status } = z.object({ id: idSchema, status: z.enum(OPPORTUNITY_STATUS) }).parse(formToObject(formData));
    const o = await db.opportunity.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, storeId: true } });
    if (!o) throw new UserError("Opportunity not found.");
    await db.opportunity.update({ where: { id: o.id }, data: { status } });
    revalidate(o.storeId);
    return { message: "Status saved." };
  });
}

export async function deleteOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async () => {
    const ctx = await requireWriter();
    const { id } = z.object({ id: idSchema }).parse(formToObject(formData));
    const o = await db.opportunity.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, storeId: true } });
    if (!o) throw new UserError("Opportunity not found.");
    await db.opportunity.delete({ where: { id: o.id } });
    revalidate(o.storeId);
    return { message: "Opportunity deleted." };
  });
}
