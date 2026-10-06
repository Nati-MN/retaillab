"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { EVENTS, NAV, openAnalyst } from "./nav";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/** CMD/CTRL+K palette. Arrow keys to move, Enter to run, Escape to close. */
export function CommandPalette({ stores }: { stores: { id: string; name: string; code: string; city: string }[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setIndex(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENTS.palette, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENTS.palette, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      { id: "compare", group: "Actions", label: "Compare stores", run: go("/compare") },
      { id: "experiment", group: "Actions", label: "Create experiment", run: go("/experiments/new") },
      { id: "analysis", group: "Actions", label: "Run analysis", hint: "Generate hypotheses from current data", keywords: "strategy engine hypotheses", run: go("/strategies?tab=hypotheses") },
      { id: "map", group: "Actions", label: "Open map", run: go("/map") },
      { id: "strategy", group: "Actions", label: "Create strategy", keywords: "hypothesis new", run: go("/strategies/new") },
      { id: "research", group: "Actions", label: "Search research", keywords: "sources location competitors", run: go("/research") },
      { id: "simulator", group: "Actions", label: "Open strategy simulator", keywords: "scenario break-even", run: go("/strategies?tab=simulator") },
      { id: "anomalies", group: "Actions", label: "Find unusual changes", keywords: "anomaly", run: go("/analytics?tab=anomalies") },
      { id: "add-store", group: "Actions", label: "Add store", run: go("/stores/new") },
      ...stores.map((s) => ({ id: `open-${s.id}`, group: "Open store", label: s.name, hint: `${s.code} · ${s.city}`, keywords: `open store ${s.code} ${s.city}`, run: go(`/stores/${s.id}`) })),
      ...stores.map((s) => ({ id: `data-${s.id}`, group: "Add revenue data", label: `Add revenue data — ${s.name}`, hint: s.code, keywords: `monthly financial enter ${s.city}`, run: go(`/stores/${s.id}/data`) })),
      ...NAV.map((n) => ({ id: `nav-${n.href}`, group: "Go to", label: n.label, run: go(n.href) })),
    ];
  }, [router, stores]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = terms.length === 0
      ? commands.filter((c) => c.group === "Actions" || c.group === "Open store")
      : commands.filter((c) => {
          const hay = `${c.label} ${c.group} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        });
    const list = matched.slice(0, 14);
    if (q.trim().length > 2) {
      list.push({ id: "ask", group: "Analyst", label: `Ask the analyst: “${q.trim()}”`, hint: "Answers from your data using deterministic tools", run: () => openAnalyst(q.trim()) });
    }
    return list;
  }, [commands, q]);

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.1 }} onClick={close} />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Command palette"
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="relative w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(results[index]); }
            }}
          >
            <div className="flex h-11 items-center gap-2 border-b border-line px-3">
              <Search className="h-4 w-4 text-ink-3" aria-hidden />
              <input
                ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Type a command, a store, or a question…" aria-label="Command"
                role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[index] ? `cmd-${results[index].id}` : undefined}
                className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3 focus-visible:ring-0"
              />
              <kbd className="rounded-sm border border-line px-1 font-mono text-[10px] text-ink-3">Esc</kbd>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
              {results.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-3">No matching command.</li>}
              {results.map((c, i) => (
                <li key={c.id} role="presentation">
                  {(i === 0 || results[i - 1]!.group !== c.group) && <div className="label px-2 pb-1 pt-2">{c.group}</div>}
                  <button
                    id={`cmd-${c.id}`} type="button" role="option" aria-selected={i === index} data-index={i}
                    onMouseMove={() => setIndex(i)} onClick={() => run(c)}
                    className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left", i === index ? "bg-line/70" : "")}
                  >
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">{c.label}</span>
                    {c.hint && <span className="ml-auto truncate pl-3 text-xs text-ink-3">{c.hint}</span>}
                    {i === index && <CornerDownLeft className={cn("h-3 w-3 shrink-0 text-ink-3", !c.hint && "ml-auto")} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
