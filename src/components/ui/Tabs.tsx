import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

/** URL-driven tabs (server component). The active tab lives in the URL so views are linkable. */
export function TabNav({ items, active, label }: { items: TabItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="no-print scroll-thin mb-4 flex gap-0.5 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13px]",
            t.key === active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded-sm bg-line/70 px-1 text-2xs text-ink-2">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
