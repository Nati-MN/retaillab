import Link from "next/link";
import { cn } from "@/lib/cn";
import type { StoreDTO } from "@/lib/analytics/types";
import { Formula } from "@/components/ui";
import { ParamSelect } from "./ParamSelect";

export type SP = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** /analytics URL keeping the current parameters, with `patch` applied (null removes a key). */
export function analyticsHref(sp: SP, patch: Record<string, string | null>, keep?: string[]): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s !== undefined && (!keep || keep.includes(k))) p.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString();
  return q ? `/analytics?${q}` : "/analytics";
}

/** Props every analytics tab receives from the page. */
export interface TabProps {
  orgId: string;
  currency: string;
  isDemo: boolean;
  country: string;
  aiExplanations: boolean;
  stores: StoreDTO[];
  /** Selected store (validated against the organization) or null for all stores. */
  store: StoreDTO | null;
  sp: SP;
}

/** URL-driven segmented control (server component; plain links). */
export function Segmented({ label, items, active }: { label: string; items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="no-print flex items-center gap-1.5">
      <span className="label">{label}</span>
      <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded border border-line-strong bg-surface">
        {items.map((i) => (
          <Link
            key={i.key}
            href={i.href}
            scroll={false}
            aria-current={i.key === active ? "true" : undefined}
            className={cn("flex h-7 items-center whitespace-nowrap border-r border-line px-2.5 text-xs last:border-r-0", i.key === active ? "bg-ink font-medium text-surface" : "text-ink-2 hover:bg-surface-2")}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function StoreSelect({ stores, value, allLabel = "All stores" }: { stores: StoreDTO[]; value: string; allLabel?: string }) {
  return (
    <ParamSelect
      param="store"
      label="Store"
      value={value}
      defaultValue="all"
      options={[{ value: "all", label: allLabel }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
    />
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>;
}

/** Definition list of "figure → formula" used under tables so every number has provenance. */
export function MethodList({ items, className }: { items: { term: string; formula: string; note?: string }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.term} className="min-w-0">
          <dt className="font-medium text-ink-2">{i.term}</dt>
          <dd className="min-w-0 break-words">
            <Formula>{i.formula}</Formula>
            {i.note && <span className="text-ink-3"> — {i.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Small coloured square identifying a store; always paired with its name. */
export function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-[1px] align-baseline" style={{ background: color }} />;
}

export function names(ids: readonly string[], stores: readonly StoreDTO[]): string {
  return ids.map((id) => stores.find((s) => s.id === id)?.name ?? "Unknown store").join(", ");
}
