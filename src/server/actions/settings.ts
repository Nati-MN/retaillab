"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_USER } from "@/lib/demo/dataset";
import {
  checkAddMember, checkCategoryRemoval, checkDemoReset, checkMemberRemoval, checkOrganizationDeletion, checkRoleChange, type Decision,
} from "@/lib/settings/permissions";
import { idSchema, organizationSchema, text } from "@/lib/validation";
import { formToObject, safeAction, type ActionState } from "../action";
import { db } from "../db";
import { seedDemo } from "../demo/seedDemo";
import { enforceRateLimit } from "../rateLimit";
import { ForbiddenError, ORG_COOKIE, requireOwner, requireWriter } from "../session";

/** Settings mutations. The organization always comes from the session; ids from the form are re-checked against it. */

function enforce(d: Decision): void {
  if (!d.ok) throw new ForbiddenError(d.reason);
}

const roleSchema = z.enum(["OWNER", "ANALYST", "VIEWER"]);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

// ── Organization ─────────────────────────────────────────────────────────────

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const input = organizationSchema.parse(formToObject(formData));
    await db.organization.update({ where: { id: ctx.orgId }, data: input });
    revalidatePath("/", "layout");
    return { message: "Organization saved." };
  });
}

// ── Privacy & AI ─────────────────────────────────────────────────────────────

const privacySchema = z.object({
  aiIncludeFinancials: checkbox,
  aiIncludeStoreNames: checkbox,
  aiIncludeResearch: checkbox,
  aiExplanations: checkbox,
});

export async function updatePrivacyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const input = privacySchema.parse({
      aiIncludeFinancials: formData.get("aiIncludeFinancials"),
      aiIncludeStoreNames: formData.get("aiIncludeStoreNames"),
      aiIncludeResearch: formData.get("aiIncludeResearch"),
      aiExplanations: formData.get("aiExplanations"),
    });
    await db.organization.update({ where: { id: ctx.orgId }, data: input });
    revalidatePath("/", "layout");
    return { message: "Privacy settings saved." };
  });
}

// ── Team ─────────────────────────────────────────────────────────────────────

const roleChangeSchema = z.object({ membershipId: idSchema, role: roleSchema });

export async function changeMemberRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const input = roleChangeSchema.parse(formToObject(formData));
    const name = await db.$transaction(async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: input.membershipId, organizationId: ctx.orgId }, include: { user: { select: { name: true, email: true } } } });
      if (!target) throw new ForbiddenError("Member not found in this organization.");
      const ownerCount = await tx.membership.count({ where: { organizationId: ctx.orgId, role: "OWNER" } });
      enforce(checkRoleChange({ actorRole: ctx.role, targetRole: target.role, newRole: input.role, ownerCount }));
      await tx.membership.update({ where: { id: target.id }, data: { role: input.role } });
      return target.user.name || target.user.email;
    });
    revalidatePath("/settings");
    return { message: `${name} is now ${input.role.toLowerCase()}.` };
  });
}

const addMemberSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email").max(254), role: roleSchema });

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const input = addMemberSchema.parse(formToObject(formData));
    const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true, name: true } });
    const existing = user ? await db.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: ctx.orgId } }, select: { id: true } }) : null;
    enforce(checkAddMember({ actorRole: ctx.role, userExists: !!user, alreadyMember: !!existing }));
    await db.membership.create({ data: { userId: user!.id, organizationId: ctx.orgId, role: input.role } });
    revalidatePath("/settings");
    return { message: `${user!.name || input.email} was added as ${input.role.toLowerCase()}.` };
  });
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const { membershipId } = z.object({ membershipId: idSchema }).parse(formToObject(formData));
    const removedSelf = await db.$transaction(async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: membershipId, organizationId: ctx.orgId } });
      if (!target) throw new ForbiddenError("Member not found in this organization.");
      const ownerCount = await tx.membership.count({ where: { organizationId: ctx.orgId, role: "OWNER" } });
      enforce(checkMemberRemoval({ actorRole: ctx.role, targetRole: target.role, ownerCount }));
      await tx.membership.delete({ where: { id: target.id } });
      return target.userId === ctx.userId;
    });
    if (removedSelf) {
      (await cookies()).delete(ORG_COOKIE);
      redirect("/overview");
    }
    revalidatePath("/settings");
    return { message: "Member removed." };
  });
}

// ── Categories ───────────────────────────────────────────────────────────────

const categoryName = text(60);

export async function addCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const { name } = z.object({ name: categoryName }).parse(formToObject(formData));
    const clash = await db.category.findFirst({ where: { organizationId: ctx.orgId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new ForbiddenError(`A category named “${name}” already exists.`);
    const last = await db.category.aggregate({ where: { organizationId: ctx.orgId }, _max: { sortOrder: true } });
    await db.category.create({ data: { organizationId: ctx.orgId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    revalidatePath("/settings");
    revalidatePath("/analytics");
    return { message: `Category “${name}” added.` };
  });
}

export async function renameCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const { categoryId, name } = z.object({ categoryId: idSchema, name: categoryName }).parse(formToObject(formData));
    const cat = await db.category.findFirst({ where: { id: categoryId, organizationId: ctx.orgId } });
    if (!cat) throw new ForbiddenError("Category not found in this organization.");
    const clash = await db.category.findFirst({ where: { organizationId: ctx.orgId, id: { not: cat.id }, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new ForbiddenError(`A category named “${name}” already exists.`);
    await db.category.update({ where: { id: cat.id }, data: { name } });
    revalidatePath("/settings");
    revalidatePath("/analytics");
    return { message: `Renamed to “${name}”.` };
  });
}

export async function removeCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireWriter();
    await enforceRateLimit("write", ctx.userId);
    const { categoryId, confirm } = z.object({ categoryId: idSchema, confirm: z.string().optional() }).parse(formToObject(formData));
    const cat = await db.category.findFirst({ where: { id: categoryId, organizationId: ctx.orgId }, include: { _count: { select: { metrics: true } } } });
    if (!cat) throw new ForbiddenError("Category not found in this organization.");
    enforce(checkCategoryRemoval({ role: ctx.role, dataRows: cat._count.metrics, confirmed: confirm === "yes" }));
    await db.category.delete({ where: { id: cat.id } });
    revalidatePath("/settings");
    revalidatePath("/analytics");
    return { message: `Category “${cat.name}” removed${cat._count.metrics > 0 ? ` with ${cat._count.metrics} data row(s)` : ""}.` };
  });
}

// ── Demo reset / delete organization ─────────────────────────────────────────

export async function resetDemoAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    enforce(checkDemoReset({ role: ctx.role, isDemo: ctx.org.isDemo }));
    await enforceRateLimit("write", ctx.userId);
    // seedDemo() deletes the demo organization and creates a new one (new ids)
    // with an OWNER membership for the demo user. Anyone else who had been
    // added to the demo organization keeps their role in the new one.
    const others = await db.membership.findMany({
      where: { organizationId: ctx.orgId, user: { email: { not: DEMO_USER.email } } },
      select: { userId: true, role: true },
    });
    const { organizationId } = await seedDemo(db);
    if (others.length > 0) {
      await db.membership.createMany({ data: others.map((m) => ({ userId: m.userId, organizationId, role: m.role })), skipDuplicates: true });
    }
    // The cookie may still name the deleted organization; requireOrg() then falls back to the membership list.
    (await cookies()).delete(ORG_COOKIE);
    revalidatePath("/", "layout");
    redirect("/overview");
  });
}

export async function deleteOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await requireOwner();
    await enforceRateLimit("write", ctx.userId);
    const { confirmName } = z.object({ confirmName: z.string().max(200).default("") }).parse(formToObject(formData));
    enforce(checkOrganizationDeletion({ role: ctx.role, isDemo: ctx.org.isDemo, organizationName: ctx.org.name, typedName: confirmName }));
    await db.organization.delete({ where: { id: ctx.orgId } });
    (await cookies()).delete(ORG_COOKIE);
    revalidatePath("/", "layout");
    // requireOrg() sends the user to another organization they belong to, or to onboarding.
    redirect("/overview");
  });
}
