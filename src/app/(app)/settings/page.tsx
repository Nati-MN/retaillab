import type { Metadata } from "next";
import Link from "next/link";
import {
  AddCategoryForm, AddMemberForm, CategoryRow, DeleteOrganizationForm, DemoResetForm, OrganizationForm, PrivacyForm, RemoveMemberForm, RoleForm,
} from "@/components/settings/forms";
import { Chip, EmptyState, Notice, PageHeader, Panel, TabNav, Tag } from "@/components/ui";
import type { ResearchToolResult, StoreKpisResult } from "@/lib/ai/types";
import { getIntegrationStatus, type IntegrationStatus } from "@/lib/providers/registry";
import { AUSTRIAN_SOURCE_CATALOG } from "@/lib/providers/types";
import { canEditData, canManageOrganization, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/settings/permissions";
import { executeTool } from "@/server/ai/tools";
import { db } from "@/server/db";
import { first, type SearchParams } from "@/server/period";
import { getStores } from "@/server/queries";
import { requireOrg, type OrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "organization", label: "Organization" },
  { key: "privacy", label: "Privacy & AI" },
  { key: "integrations", label: "Integrations" },
  { key: "team", label: "Team" },
  { key: "data", label: "Data" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const requested = first(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "organization";
  const owner = canManageOrganization(ctx.role);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Settings {ctx.org.isDemo && <Tag kind="DEMO" />}</span>}
        subtitle={`${ctx.org.name} · you are signed in as ${ctx.userName || ctx.userEmail} (${ROLE_LABELS[ctx.role]})`}
      />
      <TabNav label="Settings sections" active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/settings?tab=${t.key}` }))} />
      {!owner && tab !== "integrations" && (
        <Notice className="mb-4" tone="info">
          {canEditData(ctx.role) ? "As an analyst you can manage categories. Organization, privacy and team settings can only be changed by an owner." : "You have read-only access. Settings can only be changed by an owner."}
        </Notice>
      )}
      {tab === "organization" && <OrganizationTab ctx={ctx} owner={owner} />}
      {tab === "privacy" && <PrivacyTab ctx={ctx} owner={owner} />}
      {tab === "integrations" && <IntegrationsTab ctx={ctx} />}
      {tab === "team" && <TeamTab ctx={ctx} owner={owner} />}
      {tab === "data" && <DataTab ctx={ctx} owner={owner} />}
    </>
  );
}

// ── Organization ─────────────────────────────────────────────────────────────

function OrganizationTab({ ctx, owner }: { ctx: OrgContext; owner: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Panel title="Organization profile" subtitle="Shown in the sidebar, on reports and in exports">
        {ctx.org.isDemo && <Notice tone="demo" className="mb-3">This is the shared demo organization. Changes are visible to everyone exploring the demo and are undone by “Reset demo data”.</Notice>}
        <OrganizationForm org={{ name: ctx.org.name, industry: ctx.org.industry, country: ctx.org.country, currency: ctx.org.currency }} canEdit={owner} />
      </Panel>
      <Panel title="About this organization">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
          <dt className="label">Type</dt>
          <dd>{ctx.org.isDemo ? "Demo — all data is fictional" : "Your organization"}</dd>
          <dt className="label">Created</dt>
          <dd className="num">{ctx.org.createdAt.toISOString().slice(0, 10)}</dd>
          <dt className="label">Your role</dt>
          <dd>{ROLE_LABELS[ctx.role]} — {ROLE_DESCRIPTIONS[ctx.role]}</dd>
          <dt className="label">Setup</dt>
          <dd>{ctx.org.onboardingCompletedAt ? "Completed" : <Link href="/onboarding" className="link">Not finished — continue setup</Link>}</dd>
        </dl>
      </Panel>
    </div>
  );
}

// ── Privacy & AI ─────────────────────────────────────────────────────────────

async function buildPrivacySample(ctx: OrgContext): Promise<{ sample: unknown | null; label: string }> {
  const stores = await getStores(ctx.orgId);
  const store = stores[0];
  if (!store) return { sample: null, label: "" };
  const [kpis, research] = await Promise.all([
    executeTool(ctx, "get_store_kpis", { store: store.id, period: "1m" }),
    executeTool(ctx, "get_research", { store: store.id }),
  ]);
  const k = kpis.result as StoreKpisResult;
  const r = research.result as ResearchToolResult;
  if (!k.kpis) return { sample: null, label: "" };
  const sample = {
    get_store_kpis: {
      store: { ...k.store, city: store.city },
      window: k.window,
      kpis: {
        revenue: k.kpis.revenue, transactions: k.kpis.transactions, customers: k.kpis.customers, averageBasket: k.kpis.averageBasket,
        grossMarginPct: k.kpis.grossMarginPct, operatingCosts: k.kpis.operatingCosts,
      },
    },
    get_research: {
      store: r.store,
      research: {
        competitors: r.research.competitors.slice(0, 2).map((c) => ({ name: c.name, category: c.category, distanceM: c.distanceM })),
        findings: r.research.findings.slice(0, 1).map((f) => ({ kind: f.kind, text: f.text })),
      },
    },
  };
  return { sample, label: `Sample: two real tool results for ${store.name} (shortened).` };
}

async function PrivacyTab({ ctx, owner }: { ctx: OrgContext; owner: boolean }) {
  const [{ sample, label }, stores] = await Promise.all([buildPrivacySample(ctx), getStores(ctx.orgId)]);
  const paths = [
    {
      title: "1 · Internal financial data",
      body: "Revenue, transactions, costs and margins you enter are stored in this application's database and processed on its server. All KPIs, scenarios and analyst answers are calculated there by deterministic code.",
      leaves: "Never leaves the server.",
    },
    {
      title: "2 · Public location research",
      body: "When you run research for a store, a places provider is asked what is around a point. The request contains the store's coordinates and a radius — no store name, no revenue, nothing else.",
      leaves: "Coordinates + radius only.",
    },
    {
      title: "3 · AI context",
      body: "If a language model is connected later, it may choose which tools to run and phrase the answer. It would receive tool output only after the filter below — and it is never asked to do arithmetic.",
      leaves: "Nothing today: no provider is connected.",
    },
  ];
  return (
    <div className="space-y-4">
      <Notice tone="unavailable" title="No external AI is connected">
        The analyst and the strategy engine run on deterministic rules inside this application, so nothing is currently sent to any AI service — whatever these switches say.
        They are stored now and will govern any provider that is added later.
      </Notice>
      <Panel title="Three separate data paths" subtitle="What can leave the server, and what cannot" flush>
        <div className="grid gap-px bg-line md:grid-cols-3">
          {paths.map((p) => (
            <div key={p.title} className="bg-surface p-3">
              <h3 className="text-[13px] font-semibold">{p.title}</h3>
              <p className="mt-1 text-xs leading-5 text-ink-2">{p.body}</p>
              <p className="mt-2 font-mono text-2xs uppercase tracking-wider text-ink-3">Leaves the server</p>
              <p className="text-xs font-medium">{p.leaves}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="AI context controls" subtitle="Apply to path 3 only. Paths 1 and 2 are fixed by design.">
        <PrivacyForm
          canEdit={owner}
          initial={{
            aiIncludeFinancials: ctx.org.aiIncludeFinancials, aiIncludeStoreNames: ctx.org.aiIncludeStoreNames,
            aiIncludeResearch: ctx.org.aiIncludeResearch, aiExplanations: ctx.org.aiExplanations,
          }}
          sample={sample}
          sampleLabel={label}
          stores={stores.map((s) => ({ name: s.name, code: s.code }))}
        />
      </Panel>
    </div>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────

function integrationState(i: IntegrationStatus): { chip: React.ReactNode; note: string | null } {
  if (!i.connected || !i.provider) return { chip: <Chip>Not connected</Chip>, note: null };
  if (i.provider.isDemo) return { chip: <Chip tone="accent">Demo provider</Chip>, note: "Returns fictional places for the demo stores only. Not a real data source." };
  if (i.provider.id.startsWith("overpass")) return { chip: <Chip tone="warn">Configured · unverified</Chip>, note: "Mapping unit-tested; live call not verified in the build environment." };
  return { chip: <Chip tone="info">Configured</Chip>, note: "Requests go from the browser to the tile server. The server does not check that they succeed." };
}

function IntegrationsTab({ ctx }: { ctx: OrgContext }) {
  const rows = getIntegrationStatus(ctx.org);
  return (
    <div className="space-y-4">
      <Panel title="Capabilities" subtitle="What this installation can reach. Nothing is shown as connected unless a provider is configured." flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl min-w-[760px]">
            <thead>
              <tr><th scope="col">Capability</th><th scope="col">Status</th><th scope="col">Provider</th><th scope="col">How to connect</th></tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const s = integrationState(i);
                return (
                  <tr key={i.capability}>
                    <td className="whitespace-nowrap font-medium">{i.capability}</td>
                    <td className="whitespace-nowrap">{s.chip}</td>
                    <td>
                      {i.provider ? (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">{i.provider.label}{i.provider.isDemo && <Tag kind="DEMO">Demo</Tag>}</div>
                          {(i.provider.note ?? s.note) && <div className="text-xs text-ink-3">{i.provider.note ?? s.note}</div>}
                          {i.provider.note && s.note && <div className="text-xs text-ink-3">{s.note}</div>}
                        </>
                      ) : (
                        <span className="text-ink-3">None</span>
                      )}
                    </td>
                    <td className="max-w-md text-xs leading-5 text-ink-2">
                      {i.howToConnect}
                      {i.capability.startsWith("Places") && <div className="mt-1 text-ink-3">OpenStreetMap (Overpass): mapping unit-tested; live call not verified in the build environment.</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Designed to integrate — not connected" subtitle="Austrian public sources the research layer has interfaces for. None of them is queried in this build." flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr><th scope="col">Source</th><th scope="col">Would provide</th><th scope="col">Interface</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {AUSTRIAN_SOURCE_CATALOG.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium">{s.name}</div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="link font-mono text-2xs">{s.url}</a>
                  </td>
                  <td className="text-ink-2">{s.kind}</td>
                  <td><code className="font-mono text-xs text-ink-2">{s.provider}</code></td>
                  <td className="whitespace-nowrap"><Chip>Not connected</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────

async function TeamTab({ ctx, owner }: { ctx: OrgContext; owner: boolean }) {
  const members = await db.membership.findMany({
    where: { organizationId: ctx.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  return (
    <div className="space-y-4">
      <Panel title="Members" subtitle={`${members.length} ${members.length === 1 ? "person has" : "people have"} access to ${ctx.org.name}`} flush>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th>{owner && <th scope="col"><span className="sr-only">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const lastOwner = m.role === "OWNER" && ownerCount <= 1;
                const name = m.user.name || m.user.email;
                return (
                  <tr key={m.id}>
                    <td className="font-medium">{name}{m.user.id === ctx.userId && <span className="ml-2 font-normal text-ink-3">you</span>}</td>
                    <td className="text-ink-2">{m.user.email}</td>
                    <td>
                      {owner
                        ? <RoleForm membershipId={m.id} role={m.role} memberName={name} disabledReason={lastOwner ? "The only owner cannot be demoted. Make someone else an owner first." : undefined} />
                        : ROLE_LABELS[m.role]}
                      {owner && lastOwner && <div className="mt-1 text-2xs text-ink-3">Only owner — cannot be demoted</div>}
                    </td>
                    {owner && <td className="text-right"><RemoveMemberForm membershipId={m.id} memberName={name} disabledReason={lastOwner ? "" : undefined} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Add existing user by email">
          <Notice tone="unavailable" className="mb-3" title="No invitation emails">
            No mail provider is connected, so RetailLab cannot send invitations. The person first creates an account on the registration page; then you add that email address here.
          </Notice>
          {owner ? <AddMemberForm /> : <p className="text-xs text-ink-3">Only an owner can add members.</p>}
        </Panel>
        <Panel title="Roles">
          <dl className="space-y-2 text-xs">
            {ROLES.map((r) => (
              <div key={r}><dt className="font-semibold">{ROLE_LABELS[r]}</dt><dd className="leading-5 text-ink-2">{ROLE_DESCRIPTIONS[r]}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function DataTab({ ctx, owner }: { ctx: OrgContext; owner: boolean }) {
  const categories = await db.category.findMany({
    where: { organizationId: ctx.orgId },
    include: { _count: { select: { metrics: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const canEdit = canEditData(ctx.role);
  return (
    <div className="space-y-4">
      <Panel title="Product categories" subtitle="Used for category revenue, margin, waste and stock-out data" flush>
        {categories.length === 0 ? (
          <div className="p-3"><EmptyState title="No categories yet">Add the categories you report on, for example Bakery, Beverages or Dairy.</EmptyState></div>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="tbl min-w-[560px]">
              <thead>
                <tr><th scope="col">Category</th><th scope="col" className="r">Monthly data rows</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {categories.map((c) => <CategoryRow key={c.id} id={c.id} name={c.name} dataRows={c._count.metrics} canEdit={canEdit} />)}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && <div className="border-t border-line p-3"><AddCategoryForm /></div>}
      </Panel>

      {ctx.org.isDemo ? (
        <Panel title="Reset demo data" kind="DEMO">
          <p className="mb-3 max-w-3xl text-xs leading-5 text-ink-2">
            Restores the fictional AlpenMarkt dataset exactly as shipped: 6 stores, 24 months of figures, research, hypotheses and experiments.
            Everything added or changed in the demo organization is deleted. Privacy settings return to their defaults.
          </p>
          {owner ? <DemoResetForm /> : <p className="text-xs text-ink-3">Only an owner can reset the demo data.</p>}
        </Panel>
      ) : (
        <Panel title="Delete organization" className="border-neg/40">
          {owner ? <DeleteOrganizationForm organizationName={ctx.org.name} /> : <p className="text-xs text-ink-3">Only an owner can delete the organization.</p>}
        </Panel>
      )}
    </div>
  );
}
