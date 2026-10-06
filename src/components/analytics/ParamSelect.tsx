"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition } from "react";

/** Labelled <select> whose value lives in a URL search parameter. `clear` lists parameters to drop on change. */
export function ParamSelect({
  param, label, value, options, defaultValue, clear = [],
}: {
  param: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** When the chosen value equals this, the parameter is removed from the URL. */
  defaultValue?: string;
  clear?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <div className="no-print flex items-center gap-1.5" aria-busy={pending}>
      <label htmlFor={id} className="label">{label}</label>
      <select
        id={id}
        className="input h-7 w-auto min-w-[9rem] max-w-[15rem] py-0 pr-7 text-xs"
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          if (e.target.value === defaultValue) p.delete(param);
          else p.set(param, e.target.value);
          for (const c of clear) p.delete(c);
          start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
