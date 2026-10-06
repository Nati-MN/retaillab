import "server-only";
import type { Organization } from "@prisma/client";
import { db } from "./db";
import { ForbiddenError, requireUser } from "./session";

export interface OnboardingContext {
  userId: string;
  /** The organization being set up, or null before step 1 is saved. */
  org: Organization | null;
  /** True when the user already belongs to an organization that finished onboarding. */
  hasCompletedOrg: boolean;
}

/**
 * Onboarding state is derived from the database on every request: the
 * organization in setup is the one this user OWNS whose onboarding is not
 * completed. Nothing about it is taken from the client.
 */
export async function getOnboardingContext(): Promise<OnboardingContext> {
  const user = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { organization: { createdAt: "asc" } },
  });
  const inSetup = memberships.find((m) => m.role === "OWNER" && !m.organization.onboardingCompletedAt && !m.organization.isDemo);
  return {
    userId: user.id,
    org: inSetup?.organization ?? null,
    hasCompletedOrg: memberships.some((m) => m.organization.onboardingCompletedAt !== null),
  };
}

/** For onboarding steps 2–4: the organization in setup, or a permission error. */
export async function requireOnboardingOrg(): Promise<{ userId: string; org: Organization }> {
  const ctx = await getOnboardingContext();
  if (!ctx.org) throw new ForbiddenError("No organization setup is in progress. Start with step 1.");
  return { userId: ctx.userId, org: ctx.org };
}
