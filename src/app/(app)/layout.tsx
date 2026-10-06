import { AnalystPanel } from "@/components/analyst/AnalystPanel";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { SourcesProvider } from "@/components/ui/Sources";
import { db } from "@/server/db";
import { requireOrg } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const stores = await db.store.findMany({
    where: { organizationId: ctx.orgId },
    select: { id: true, name: true, code: true, city: true },
    orderBy: { name: "asc" },
  });
  return (
    <SourcesProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-1.5 focus:text-surface">
        Skip to content
      </a>
      <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
        <div className="hidden lg:block">
          <Sidebar orgName={ctx.org.name} userName={ctx.userName} userEmail={ctx.userEmail} isDemo={ctx.org.isDemo} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar isDemo={ctx.org.isDemo} />
          <main id="main" tabIndex={-1} className="scroll-thin flex-1 overflow-y-auto px-3 py-4 outline-none lg:px-5 print:overflow-visible">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette stores={stores} />
      <AnalystPanel />
    </SourcesProvider>
  );
}
