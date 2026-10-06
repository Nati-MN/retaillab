"use client";

import { useActionState, useCallback, useTransition, type FormEvent } from "react";
import type { ActionState } from "@/server/action";

/**
 * useActionState without React's automatic form reset: submitting through
 * onSubmit keeps what the user typed when the server returns an error.
 */
export function useFormAction(fn: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, actionPending] = useActionState(fn, null);
  const [transitionPending, start] = useTransition();
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if (submitter?.name) fd.set(submitter.name, submitter.value);
      start(() => dispatch(fd));
    },
    [dispatch],
  );
  const fieldErrors: Record<string, string[]> = state && !state.ok ? state.fieldErrors ?? {} : {};
  return {
    state,
    onSubmit,
    pending: actionPending || transitionPending,
    error: state && !state.ok ? state.error : null,
    message: state && state.ok ? state.message ?? null : null,
    fieldErrors,
  };
}
