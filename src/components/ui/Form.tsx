import { cn } from "@/lib/cn";

export function Field({
  label, htmlFor, hint, error, optional, children, className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | string[];
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-xs font-medium text-ink-2">
        <span>{label}</span>
        {optional && <span className="font-normal text-ink-3">optional</span>}
      </label>
      {children}
      {err ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-neg">{err}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Top-of-form error summary for server action failures. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded border border-neg/40 bg-neg/5 px-3 py-2 text-xs text-neg">{message}</p>;
}
