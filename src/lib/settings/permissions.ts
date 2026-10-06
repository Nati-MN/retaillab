/**
 * Authorization rules for Settings. Pure, so the boundaries are unit-tested
 * (tests/permissions.test.ts). Server actions call these after loading the
 * facts they need (roles, owner count) from the database — the client never
 * supplies them.
 */

export const ROLES = ["OWNER", "ANALYST", "VIEWER"] as const;
export type RoleKey = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleKey, string> = { OWNER: "Owner", ANALYST: "Analyst", VIEWER: "Viewer" };
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  OWNER: "Everything, including settings, team and deleting the organization.",
  ANALYST: "Can enter and edit data, strategies, experiments and reports. Cannot change settings or team.",
  VIEWER: "Read-only.",
};

export type Decision = { ok: true } | { ok: false; reason: string };
const allow: Decision = { ok: true };
const deny = (reason: string): Decision => ({ ok: false, reason });

export const isRole = (v: unknown): v is RoleKey => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** Organization profile, privacy settings, team, demo reset, deletion. */
export function canManageOrganization(role: RoleKey): boolean {
  return role === "OWNER";
}

/** Categories and other business data. */
export function canEditData(role: RoleKey): boolean {
  return role === "OWNER" || role === "ANALYST";
}

export function checkRoleChange(i: { actorRole: RoleKey; targetRole: RoleKey; newRole: RoleKey; ownerCount: number }): Decision {
  if (!canManageOrganization(i.actorRole)) return deny("Only an owner can change roles.");
  if (!isRole(i.newRole)) return deny("Unknown role.");
  if (i.targetRole === i.newRole) return allow;
  if (i.targetRole === "OWNER" && i.ownerCount <= 1) return deny("An organization needs at least one owner. Make someone else an owner first.");
  return allow;
}

export function checkMemberRemoval(i: { actorRole: RoleKey; targetRole: RoleKey; ownerCount: number }): Decision {
  if (!canManageOrganization(i.actorRole)) return deny("Only an owner can remove members.");
  if (i.targetRole === "OWNER" && i.ownerCount <= 1) return deny("The last owner cannot be removed.");
  return allow;
}

export function checkAddMember(i: { actorRole: RoleKey; userExists: boolean; alreadyMember: boolean }): Decision {
  if (!canManageOrganization(i.actorRole)) return deny("Only an owner can add members.");
  if (!i.userExists) return deny("No account uses this email. The person has to register first — RetailLab does not send invitation emails.");
  if (i.alreadyMember) return deny("This person is already a member.");
  return allow;
}

export function checkDemoReset(i: { role: RoleKey; isDemo: boolean }): Decision {
  if (!i.isDemo) return deny("Only the demo organization can be reset.");
  if (!canManageOrganization(i.role)) return deny("Only an owner can reset the demo data.");
  return allow;
}

export function checkOrganizationDeletion(i: { role: RoleKey; isDemo: boolean; organizationName: string; typedName: string }): Decision {
  if (!canManageOrganization(i.role)) return deny("Only an owner can delete the organization.");
  if (i.isDemo) return deny("The demo organization cannot be deleted. Use “Reset demo data” instead.");
  if (i.typedName.trim() !== i.organizationName.trim()) return deny("The name you typed does not match the organization name.");
  return allow;
}

export function checkCategoryRemoval(i: { role: RoleKey; dataRows: number; confirmed: boolean }): Decision {
  if (!canEditData(i.role)) return deny("You do not have permission to change categories.");
  if (i.dataRows > 0 && !i.confirmed) return deny(`This category has ${i.dataRows} monthly data row(s). Confirm that they should be deleted with it.`);
  return allow;
}
