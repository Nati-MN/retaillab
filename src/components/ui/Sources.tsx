"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import type { SourceDTO } from "@/server/queries";

/**
 * Sources drawer. Wrap the app once in <SourcesProvider>; anywhere below,
 * <Cite source={…} /> renders a citation that opens the drawer on that source
 * and <SourcesButton sources={[…]} /> opens the full list.
 */

interface Ctx {
  open: (sources: SourceDTO[], focusId?: string) => void;
}
const SourcesCtx = createContext<Ctx | null>(null);

const RELIABILITY: Record<SourceDTO["reliability"], { label: string; cls: string; note: string }> = {
  OFFICIAL: { label: "Official", cls: "text-pos border-pos/40", note: "Published by a public authority, statistical office or the operator itself." },
  COMMUNITY: { label: "Community-maintained", cls: "text-info border-info/40", note: "Collaboratively maintained (e.g. OpenStreetMap). Usually accurate; may be incomplete or outdated." },
  COMMERCIAL: { label: "Commercial", cls: "text-ink-2 border-line-strong", note: "Published by a company. May reflect its own interests." },
  UNKNOWN: { label: "Unrated", cls: "text-ink-3 border-line-strong border-dashed", note: "Reliability has not been assessed." },
  DEMO: { label: "Demo · fictional", cls: "text-accent border-accent/50", note: "Invented source for demonstration. The URL does not exist." },
};

export function SourcesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ sources: SourceDTO[]; focusId?: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((sources: SourceDTO[], focusId?: string) => {
    lastFocus.current = document.activeElement as HTMLElement | null;
    setState({ sources, focusId });
  }, []);
  const close = useCallback(() => {
    setState(null);
    lastFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!state) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    if (state.focusId) document.getElementById(`source-${state.focusId}`)?.scrollIntoView({ block: "nearest" });
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <SourcesCtx.Provider value={value}>
      {children}
      {state && (
        <div className="no-print fixed inset-0 z-50" role="presentation">
          <div className="absolute inset-0 bg-black/30" onClick={close} />
          <aside role="dialog" aria-modal="true" aria-label="Sources" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-pop">
            <header className="flex h-11 items-center justify-between border-b border-line px-3">
              <h2 className="text-[13px] font-semibold">Sources <span className="num ml-1 font-normal text-ink-3">{state.sources.length}</span></h2>
              <button ref={closeRef} type="button" onClick={close} className="btn-ghost btn-sm" aria-label="Close sources"><X className="h-4 w-4" /></button>
            </header>
            <ol className="scroll-thin flex-1 divide-y divide-line overflow-y-auto">
              {state.sources.length === 0 && <li className="p-4 text-xs text-ink-3">No sources recorded.</li>}
              {state.sources.map((s, i) => {
                const r = RELIABILITY[s.reliability];
                return (
                  <li key={s.id} id={`source-${s.id}`} className={cn("p-3", s.id === state.focusId && "bg-accent/5")}>
                    <div className="flex items-start gap-2">
                      <span className="num mt-0.5 font-mono text-2xs text-ink-3">[{i + 1}]</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-xs text-ink-2">{s.publisher}</div>
                        {s.isDemo ? (
                          <div className="mt-1 break-all font-mono text-2xs text-ink-3">{s.url} <span className="font-sans">(fictional — not a real address)</span></div>
                        ) : (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-flex items-center gap-1 break-all font-mono text-2xs">
                            {s.url} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                          </a>
                        )}
                        <p className="mt-2 border-l-2 border-line pl-2 text-xs text-ink-2">{s.excerpt}</p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
                          <div><dt className="label">Accessed</dt><dd className="num">{fmtDate(s.accessedAt)}</dd></div>
                          <div><dt className="label">Published</dt><dd className="num">{s.publishedAt ? fmtDate(s.publishedAt) : "Not stated"}</dd></div>
                          <div className="col-span-2">
                            <dt className="label">Reliability</dt>
                            <dd><span className={cn("mr-1.5 inline-block rounded-sm border px-1 font-mono text-[10px] uppercase", r.cls)}>{r.label}</span><span className="text-ink-3">{r.note}</span></dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}
    </SourcesCtx.Provider>
  );
}

function useSources(): Ctx {
  const ctx = useContext(SourcesCtx);
  if (!ctx) throw new Error("Cite/SourcesButton must be used inside <SourcesProvider>");
  return ctx;
}

/** Inline citation marker. `all` (optional) is the full list shown in the drawer; defaults to just this source. */
export function Cite({ source, all, n }: { source: SourceDTO; all?: SourceDTO[]; n?: number }) {
  const { open } = useSources();
  const list = all ?? [source];
  const index = n ?? list.findIndex((s) => s.id === source.id) + 1;
  return (
    <button
      type="button"
      onClick={() => open(list, source.id)}
      title={`${source.title} — ${source.publisher}`}
      aria-label={`Source ${index}: ${source.title}`}
      className="num mx-0.5 inline-flex h-4 items-center rounded-sm border border-line-strong px-1 align-[1px] font-mono text-[10px] text-ink-2 hover:border-ink hover:text-ink"
    >
      {index}
    </button>
  );
}

export function SourcesButton({ sources, label = "Sources" }: { sources: SourceDTO[]; label?: string }) {
  const { open } = useSources();
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={() => open(sources)}>
      {label} <span className="num text-ink-3">{sources.length}</span>
    </button>
  );
}
