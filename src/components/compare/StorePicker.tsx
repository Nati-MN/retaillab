"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const SLOTS = ["A", "B", "C", "D"] as const;

/** Store A–D selectors. Selection lives in the URL (?stores=id,id,…) so a comparison can be linked. */
export function StorePicker({ stores, selected, colors }: { stores: { id: string; name: string }[]; selected: string[]; colors: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (slot: number, id: string) => {
    const next = [...selected];
    if (id === "") next.splice(slot, 1);
    else next[slot] = id;
    const p = new URLSearchParams(params.toString());
    p.set("stores", next.filter(Boolean).join(","));
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy={pending}>
      {SLOTS.map((slot, i) => {
        const value = selected[i] ?? "";
        // A slot can only be filled once the previous one is.
        const disabled = i > selected.length;
        return (
          <div key={slot} className="flex flex-col gap-1">
            <label htmlFor={`cmp-${slot}`} className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
              <span aria-hidden className="inline-block h-2 w-2 rounded-[1px] border border-line-strong" style={value ? { background: colors[value], borderColor: colors[value] } : undefined} />
              Store {slot}
            </label>
            <select id={`cmp-${slot}`} className="input" value={value} disabled={disabled} onChange={(e) => set(i, e.target.value)}>
              <option value="">{value ? "Remove" : "Not selected"}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id !== value && selected.includes(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
