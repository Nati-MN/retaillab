import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ForbiddenError } from "./session";
import { RateLimitError } from "./rateLimit";

/** Result shape for every server action used with useActionState. */
export type ActionState<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

/**
 * Wraps a server action body: lets Next.js redirects through, converts
 * validation / permission / rate-limit errors into user-facing messages and
 * hides everything else behind a generic message (details go to the server log).
 */
export async function safeAction<T>(fn: () => Promise<{ message?: string; data?: T } | void>): Promise<ActionState<T>> {
  try {
    const r = await fn();
    return { ok: true, message: r?.message, data: r?.data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ZodError) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: e.flatten().fieldErrors as Record<string, string[]> };
    }
    if (e instanceof ForbiddenError || e instanceof RateLimitError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. The change was not saved." };
  }
}

/** Reads a FormData into a plain object; empty strings become undefined so zod `.optional()` works. */
export function formToObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  }
  return out;
}
