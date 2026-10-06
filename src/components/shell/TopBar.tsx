"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Search, Sparkles, Sun, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EVENTS, NAV, openAnalyst } from "./nav";

export function TopBar({ isDemo }: { isDemo: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  useEffect(() => setMenu(false), [pathname]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("rl-theme", next); } catch { /* storage unavailable */ }
    setTheme(next);
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-3 lg:px-5">
        <button type="button" className="btn-ghost btn-sm px-1.5 lg:hidden" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {menu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(EVENTS.palette))}
          className="flex h-8 w-full max-w-sm items-center gap-2 rounded border border-line bg-surface-2 px-2.5 text-ink-3 hover:border-line-strong"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span className="flex-1 text-left text-xs">Search stores, commands…</span>
          <kbd className="rounded-sm border border-line bg-surface px-1 font-mono text-[10px]">Ctrl K</kbd>
        </button>
        <div className="flex-1" />
        {isDemo && <span className="hidden rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent md:inline">Demo · all stores and figures are fictional</span>}
        <button type="button" onClick={() => openAnalyst()} className="btn-secondary btn-sm">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Analyst
        </button>
        <button type="button" onClick={toggleTheme} className="btn-ghost btn-sm px-1.5" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      {menu && (
        <nav aria-label="Main (mobile)" className="grid grid-cols-2 gap-px border-t border-line bg-line lg:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("flex h-10 items-center gap-2 bg-surface px-3", pathname.startsWith(href) && "font-semibold")}>
              <Icon className="h-4 w-4 text-ink-3" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
