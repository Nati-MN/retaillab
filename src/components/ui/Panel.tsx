import { cn } from "@/lib/cn";
import { Tag, type EpistemicKind } from "./Tag";

export function Panel({
  title, subtitle, kind, actions, children, className, bodyClassName, flush, id,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Epistemic label for the panel's content. */
  kind?: EpistemicKind;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (tables, maps). */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-md border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[13px] font-semibold">{title}</h2>
              {kind && <Tag kind={kind} />}
            </div>
            {subtitle && <p className="truncate text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-xl leading-7">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
