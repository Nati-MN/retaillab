"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/server/authActions";
import { NAV } from "./nav";

export function Sidebar({ orgName, userName, userEmail, isDemo }: { orgName: string; userName: string; userEmail: string; isDemo: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="no-print flex h-full w-[208px] shrink-0 flex-col border-r border-line bg-surface">
      <Link href="/overview" className="flex h-12 items-center gap-2 border-b border-line px-3.5">
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-sm bg-ink font-mono text-[11px] font-bold text-surface">R</span>
        <span className="text-[13px] font-semibold tracking-tight">RetailLab</span>
      </Link>
      <nav aria-label="Main" className="scroll-thin flex-1 overflow-y-auto p-2">
        <ul className="space-y-px">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded px-2 text-[13px]",
                    active ? "bg-line/70 font-medium text-ink" : "text-ink-2 hover:bg-line/40 hover:text-ink",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-ink" : "text-ink-3")} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded bg-line font-mono text-2xs font-semibold text-ink-2">
            {orgName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium" title={orgName}>{orgName}</div>
            <div className="truncate text-2xs text-ink-3" title={userEmail}>{userName || userEmail}</div>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="btn-ghost btn-sm px-1.5" aria-label="Sign out" title="Sign out"><LogOut className="h-3.5 w-3.5" /></button>
          </form>
        </div>
        {isDemo && <div className="mt-2 rounded-sm border border-accent/40 bg-accent/5 px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">Fictional demo data</div>}
      </div>
    </aside>
  );
}
