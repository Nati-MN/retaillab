"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { ActionState } from "@/server/action";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * useActionState for forms that must KEEP what the user typed when the server
 * rejects the input (React resets a form after its action by default).
 * Spread `form` onto the <form>. `resetOnSuccess` clears "add another" forms.
 */
export function useFormAction(action: FormAction, opts: { resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const reset = opts.resetOnSuccess ?? false;

  useEffect(() => {
    if (!state) return;
    if (state.ok && reset) ref.current?.reset();
    if (!state.ok) {
      const first = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    }
  }, [state, reset]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return {
    state,
    pending,
    fieldErrors,
    error: state && !state.ok ? state.error : null,
    message: state && state.ok ? (state.message ?? null) : null,
    form: { ref, onSubmit, action: dispatch, noValidate: true as const },
    /** aria props for an input bound to a field name */
    invalid: (name: string, id: string = name) => (fieldErrors[name]?.length ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {}),
  };
}
