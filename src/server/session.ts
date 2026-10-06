import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Organization, Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "./db";

export const ORG_COOKIE = "rl_org";

export interface OrgContext {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  role: Role;
  org: Organization;
}

/** Signed-in user id or redirect to /login. */
export const requireUser = cache(async (): Promise<{ id: string; name: string; email: string }> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return { id, name: session.user?.name ?? "", email: session.user?.email ?? "" };
});

/**
 * THE tenant boundary. Every page, server action and route handler obtains the
 * organization id from here — never from the request body, URL or a hidden
 * form field. Membership is re-read from the database on each request, so
 * removing a membership takes effect immediately.
 */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  const user = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { organization: { createdAt: "asc" } },
  });
  if (memberships.length === 0) redirect("/onboarding");
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.organizationId === preferred) ?? memberships[0]!;
  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    orgId: m.organizationId,
    role: m.role,
    org: m.organization,
  };
});

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function canWrite(role: Role): boolean {
  return role === "OWNER" || role === "ANALYST";
}

/** Like requireOrg, but rejects read-only members. Use in every mutating action. */
export async function requireWriter(): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!canWrite(ctx.role)) throw new ForbiddenError();
  return ctx;
}

export async function requireOwner(): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (ctx.role !== "OWNER") throw new ForbiddenError("Only an owner can change organization settings.");
  return ctx;
}

/**
 * Returns the store only if it belongs to the caller's organization.
 * Use before any read/write keyed by a store id that came from the client.
 */
export async function assertStoreInOrg(orgId: string, storeId: string) {
  const store = await db.store.findFirst({ where: { id: storeId, organizationId: orgId } });
  if (!store) throw new ForbiddenError("Store not found in this organization.");
  return store;
}
