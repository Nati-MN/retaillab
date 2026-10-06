"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { EVENTS, NAV } from "@/components/shell/nav";
import { Notice, Skeleton } from "@/components/ui/States";
import { Tag } from "@/components/ui/Tag";
import { MAX_QUESTION_LENGTH } from "@/lib/ai/request";
import { suggestionsFor } from "@/lib/ai/router";
import type { AnalystResponse } from "@/lib/ai/types";
import { AnswerBlocks, SuggestionList, ToolsUsed } from "./Blocks";

type Failure = { kind: "auth" | "rate" | "unavailable" | "network" | "invalid"; message: string };

interface Entry {
  id: number;
  question: string;
  pathname: string;
  status: "loading" | "done" | "error";
  response?: AnalystResponse;
  failure?: Failure;
}

interface PanelContext {
  mode: "rules" | "llm";
  provider: string | null;
  store: { id: string; name: string; code: string } | null;
  isDemo: boolean;
  suggestions: string[];
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function pageLabel(pathname: string): string {
  const nav = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return nav?.label ?? "RetailLab";
}

async function askServer(question: string, pathname: string): Promise<{ response: AnalystResponse } | { failure: Failure }> {
  let res: Response;
  try {
    res = await fetch("/api/analyst", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, pathname }),
    });
  } catch {
    return { failure: { kind: "network", message: "The request did not reach the server. Check your connection and try again." } };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch { /* handled below */ }
  const serverMessage = body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string" ? (body as { error: string }).error : null;
  if (res.ok && body && typeof body === "object" && Array.isArray((body as AnalystResponse).blocks)) return { response: body as AnalystResponse };
  if (res.status === 401) return { failure: { kind: "auth", message: "You are signed out. Sign in again to use the analyst." } };
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    return { failure: { kind: "rate", message: `Too many questions in a short time.${retry ? ` Try again in ${retry} seconds.` : " Try again shortly."}` } };
  }
  if (res.status === 400) return { failure: { kind: "invalid", message: serverMessage ?? "The question could not be processed." } };
  return { failure: { kind: "unavailable", message: serverMessage ?? "The analyst is unavailable right now. Nothing was calculated." } };
}

/**
 * Global analyst slide-over. Mounted once in the app layout; opened with
 * `openAnalyst(query?)`. The conversation lives in memory only — it is gone
 * after a reload and is never written to localStorage.
 */
export function AnalystPanel() {
  const pathname = usePathname() ?? "/";
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<PanelContext | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const nextId = useRef(1);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const busy = entries.some((e) => e.status === "loading");

  const close = useCallback(() => {
    setOpen(false);
    const el = lastFocus.current;
    lastFocus.current = null;
    // Wait for the dialog to leave the accessibility tree before moving focus back.
    requestAnimationFrame(() => el?.focus?.());
  }, []);

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) return;
    const id = nextId.current++;
    const at = pathRef.current;
    setDraft("");
    setEntries((es) => [...es, { id, question, pathname: at, status: "loading" }]);
    const r = await askServer(question, at);
    setEntries((es) => es.map((e) => (e.id !== id ? e : "response" in r ? { ...e, status: "done", response: r.response } : { ...e, status: "error", failure: r.failure })));
  }, []);

  const retry = useCallback(async (id: number) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, status: "loading", failure: undefined } : e)));
    const r = await askServer(entry.question, entry.pathname);
    setEntries((es) => es.map((e) => (e.id !== id ? e : "response" in r ? { ...e, status: "done", response: r.response } : { ...e, status: "error", failure: r.failure })));
  }, [entries]);

  // Open from anywhere: top bar button, command palette, page buttons.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const query = (e as CustomEvent<{ query?: string } | undefined>).detail?.query;
      setOpen((wasOpen) => {
        if (!wasOpen) lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return true;
      });
      if (typeof query === "string" && query.trim()) void ask(query);
    };
    window.addEventListener(EVENTS.analyst, onOpen);
    return () => window.removeEventListener(EVENTS.analyst, onOpen);
  }, [ask]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Page context: which store is this, which questions fit, which mode answers.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch(`/api/analyst?pathname=${encodeURIComponent(pathname)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: PanelContext | null) => {
        if (c) setContext(c);
      })
      .catch(() => { /* context is optional; the panel works without it */ });
    return () => ac.abort();
  }, [open, pathname]);

  // Keep the newest question in view.
  const lastId = entries[entries.length - 1]?.id;
  useEffect(() => {
    if (lastId === undefined) return;
    scrollRef.current?.querySelector<HTMLElement>(`[data-entry="${lastId}"]`)?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [lastId, reduce]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const mode = context?.mode ?? "rules";
  const contextLabel = context?.store && pathname.startsWith("/stores/") ? `${context.store.name} (${context.store.code})` : pageLabel(pathname);
  const suggestions = context?.suggestions ?? suggestionsFor(pathname);

  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-black/25"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.12 }}
            onClick={close} aria-hidden
          />
          <motion.aside
            ref={panelRef}
            role="dialog" aria-modal="true" aria-labelledby="analyst-title" aria-describedby="analyst-mode"
            initial={reduce ? false : { x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: "easeOut" }}
            onKeyDown={onKeyDown}
            className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-line bg-surface shadow-pop"
          >
            <header className="border-b border-line px-3 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ink-3" aria-hidden />
                <h2 id="analyst-title" className="text-[13px] font-semibold">Analyst</h2>
                {context?.isDemo && <Tag kind="DEMO">Demo data</Tag>}
                <div className="ml-auto flex items-center gap-1">
                  {entries.length > 0 && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => { setEntries([]); inputRef.current?.focus(); }} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-sm px-1.5" onClick={close} aria-label="Close analyst"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <p id="analyst-mode" className="mt-1 text-2xs leading-4 text-ink-3">
                {mode === "rules"
                  ? "Rule-based analyst · no language model connected · answers come from deterministic tools"
                  : `Language model connected (${context?.provider ?? "provider"}) · it chooses tools and wording · all figures come from deterministic tools`}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
                <span className="label">Context</span>
                <span className="truncate">{contextLabel}</span>
              </p>
            </header>

            <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-3 py-3" aria-live="polite" aria-busy={busy}>
              {entries.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs leading-5 text-ink-2">
                    Ask about your stores. Each answer shows which tool ran, with which parameters and on which data — so every number can be traced.
                    Questions outside the tools are declined, not guessed.
                  </p>
                  <div>
                    <div className="label mb-1.5">Suggested for this page</div>
                    <SuggestionList items={suggestions} onAsk={(q) => void ask(q)} />
                  </div>
                </div>
              ) : (
                <ol className="space-y-5">
                  {entries.map((e) => (
                    <li key={e.id} data-entry={e.id} className="scroll-mt-2">
                      <div className="mb-2 rounded border border-line bg-surface-2 px-2.5 py-1.5">
                        <div className="label mb-0.5">Question</div>
                        <p className="break-words font-medium leading-5">{e.question}</p>
                      </div>
                      {e.status === "loading" && (
                        <div role="status" className="space-y-2">
                          <p className="text-xs text-ink-2">Running tools…</p>
                          <Skeleton className="h-4 w-4/5" />
                          <Skeleton className="h-20 w-full" />
                          <Skeleton className="h-4 w-3/5" />
                        </div>
                      )}
                      {e.status === "error" && e.failure && (
                        <Notice
                          tone={e.failure.kind === "rate" || e.failure.kind === "invalid" ? "warn" : "error"}
                          title={{ auth: "Signed out", rate: "Rate limit reached", unavailable: "Analyst unavailable", network: "Network error", invalid: "Question not accepted" }[e.failure.kind]}
                          action={e.failure.kind === "auth"
                            ? <a href="/login" className="btn-secondary btn-sm">Sign in</a>
                            : e.failure.kind !== "invalid"
                              ? <button type="button" className="btn-secondary btn-sm" onClick={() => void retry(e.id)}><RotateCcw className="h-3 w-3" aria-hidden /> Retry</button>
                              : undefined}
                        >
                          {e.failure.message}
                        </Notice>
                      )}
                      {e.status === "done" && e.response && (
                        <div className="space-y-3">
                          <AnswerBlocks blocks={e.response.blocks} onAsk={(q) => void ask(q)} onNavigate={close} />
                          <ToolsUsed calls={e.response.toolCalls} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <form
              className="border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void ask(draft);
              }}
            >
              <div className="flex items-center gap-2">
                <label htmlFor="analyst-input" className="sr-only">Question for the analyst</label>
                <input
                  id="analyst-input" ref={inputRef} className="input" autoComplete="off" enterKeyHint="send"
                  placeholder="Ask about stores, traffic, baskets, experiments…"
                  value={draft} maxLength={MAX_QUESTION_LENGTH} onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="btn-primary px-2.5" disabled={busy || draft.trim().length === 0} aria-label="Send question">
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 flex justify-between text-2xs text-ink-3">
                <span>Enter to send · Esc to close · history is kept for this session only</span>
                {draft.length > MAX_QUESTION_LENGTH - 100 && <span className="num">{draft.length}/{MAX_QUESTION_LENGTH}</span>}
              </p>
            </form>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
