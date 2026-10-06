"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/action";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Small inline feedback line for a server action result (announced to screen readers). */
export function ActionFeedback({ state, className }: { state: ActionState; className?: string }) {
  if (!state) return null;
  return state.ok ? (
    state.message ? <span role="status" className={cn("text-xs text-ink-2", className)}>{state.message}</span> : null
  ) : (
    <span role="alert" className={cn("text-xs text-neg", className)}>{state.error}</span>
  );
}

/** A button that posts hidden fields to a server action. Optional confirm for destructive actions. */
export function ActionButton({
  action, fields, children, className = "btn-secondary btn-sm", confirm, pendingLabel, feedback = "inline", title,
}: {
  action: Action;
  fields?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingLabel?: string;
  /** "inline" shows the result next to the button, "block" below it, "errors" only shows failures. */
  feedback?: "inline" | "block" | "errors";
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const show = feedback === "errors" ? (state && !state.ok ? state : null) : state;
  return (
    <form
      action={formAction}
      className={cn(feedback === "block" ? "flex flex-col gap-2" : "inline-flex flex-wrap items-center gap-2")}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={cn(className, feedback === "block" && "self-start")} disabled={pending} title={title}>
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      <ActionFeedback state={show} />
    </form>
  );
}

/** A labelled select that saves on change through a server action (keyboard operable; no drag and drop). */
export function ActionSelect({
  action, fields, name, value, options, label, className,
}: {
  action: Action;
  fields?: Record<string, string>;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  /** Accessible name, e.g. "Status of Extend opening hours". */
  label: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        name={name}
        key={value}
        defaultValue={value}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn("input h-7 w-auto min-w-[9rem] py-0 text-xs", className)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {pending ? <span className="text-2xs text-ink-3">Saving…</span> : <ActionFeedback state={state} className="text-2xs" />}
    </form>
  );
}

/** Selects that write their value into the URL query (GET navigation, linkable). */
export function QueryFilter({
  basePath, params, filters,
}: {
  basePath: string;
  /** Params that must be kept (e.g. tab). */
  params: Record<string, string>;
  filters: { name: string; label: string; value: string; options: { value: string; label: string }[]; allLabel: string }[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const go = () => {
    const fd = new FormData(ref.current!);
    const q = new URLSearchParams(params);
    for (const f of filters) {
      const v = String(fd.get(f.name) ?? "");
      if (v) q.set(f.name, v);
    }
    router.push(`${basePath}?${q.toString()}`, { scroll: false });
  };
  return (
    <form ref={ref} className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
      {filters.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {f.label}
          <select name={f.name} defaultValue={f.value} key={f.value} onChange={go} className="input h-8 w-auto min-w-[10rem]">
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
    </form>
  );
}

/** Scrolls an element into view once (used after creating a hypothesis). */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  }, [targetId]);
  return null;
}

/** Opens (and scrolls to) the <details> element named by the URL hash, e.g. #lib-cross-selling. */
export function OpenHashDetails() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
