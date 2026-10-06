"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/ui/Form";
import type { ActionState } from "@/server/action";

export function AuthForm({ mode, action }: { mode: "login" | "register"; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-sm bg-ink font-mono text-xs font-bold text-surface">R</span>
          <span className="text-sm font-semibold tracking-tight">RetailLab</span>
        </Link>
        <h1 className="text-lg">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <p className="mt-0.5 text-ink-2">{mode === "login" ? "Access your organization." : "Next, you will set up your organization and stores."}</p>
        <form action={formAction} className="mt-5 space-y-3 rounded-md border border-line bg-surface p-4">
          <FormError message={state && !state.ok ? state.error : null} />
          {mode === "register" && (
            <Field label="Your name" htmlFor="name" error={fe?.name}>
              <input id="name" name="name" className="input" autoComplete="name" required maxLength={80} />
            </Field>
          )}
          <Field label="Email" htmlFor="email" error={fe?.email}>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" error={fe?.password} hint={mode === "register" ? "At least 10 characters." : undefined}>
            <input id="password" name="password" type="password" className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : 1} />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="mt-3 text-xs text-ink-2">
          {mode === "login" ? (
            <>No account? <Link href="/register" className="link">Create an organization</Link> or go back and <Link href="/" className="link">explore the demo</Link>.</>
          ) : (
            <>Already registered? <Link href="/login" className="link">Sign in</Link>.</>
          )}
        </p>
      </div>
    </main>
  );
}
