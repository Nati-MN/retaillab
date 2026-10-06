"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { DEMO_USER } from "@/lib/demo/dataset";
import { registerSchema } from "@/lib/validation";
import { formToObject, safeAction, type ActionState } from "./action";
import { db } from "./db";
import { seedDemo } from "./demo/seedDemo";
import { enforceRateLimit } from "./rateLimit";

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Signs into the shared, fictional demo organization. Seeds it first if it does not exist yet. */
export async function exploreDemo(): Promise<void> {
  await enforceRateLimit("login", `demo:${await clientKey()}`);
  const demoOrg = await db.organization.findFirst({ where: { isDemo: true }, select: { id: true } });
  if (!demoOrg) await seedDemo(db);
  await signIn("credentials", { email: DEMO_USER.email, password: DEMO_USER.password, redirectTo: "/overview" });
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/overview",
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "Email or password is incorrect, or too many attempts were made." };
    throw e; // redirect
  }
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await safeAction(async () => {
    await enforceRateLimit("register", await clientKey());
    const input = registerSchema.parse(formToObject(formData));
    const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw new (await import("./session")).ForbiddenError("An account with this email already exists.");
    await db.user.create({ data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12) } });
  });
  if (result && !result.ok) return result;
  await signIn("credentials", {
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    redirectTo: "/onboarding",
  });
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
