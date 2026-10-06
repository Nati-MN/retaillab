"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from "@/lib/period";

/**
 * Date range control. State lives in the URL (?range=12m or ?range=custom&from=…&to=…)
 * so server components re-query only the months they need.
 */
export function RangeFilter({ active, from, to, min, max }: { active: RangePreset; from: string; to: string; min?: string; max?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState({ from, to });

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div role="group" aria-label="Date range" className="inline-flex overflow-hidden rounded border border-line-strong bg-surface">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={active === p}
            onClick={() => (p === "custom" ? go({ range: "custom", from: custom.from, to: custom.to }) : go({ range: p, from: null, to: null }))}
            className={cn("h-7 border-r border-line px-2.5 text-xs last:border-r-0", active === p ? "bg-ink font-medium text-surface" : "text-ink-2 hover:bg-surface-2")}
          >
            {RANGE_LABELS[p]}
          </button>
        ))}
      </div>
      {active === "custom" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            go({ range: "custom", from: custom.from, to: custom.to });
          }}
        >
          <label className="sr-only" htmlFor="range-from">From month</label>
          <input id="range-from" type="month" className="input h-7 w-36" min={min} max={max} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <span className="text-ink-3">–</span>
          <label className="sr-only" htmlFor="range-to">To month</label>
          <input id="range-to" type="month" className="input h-7 w-36" min={min} max={max} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          <button type="submit" className="btn-secondary btn-sm">Apply</button>
        </form>
      )}
    </div>
  );
}
