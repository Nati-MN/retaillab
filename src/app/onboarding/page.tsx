import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/stores/ConfirmSubmit";
import { MonthForm } from "@/components/stores/MonthForm";
import { StoreForm } from "@/components/stores/StoreForm";
import { Missing, Notice } from "@/components/ui";
import { STORE_TYPE_LABELS } from "@/lib/analytics/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { addMonths, monthKey, monthLabelLong } from "@/lib/period";
import {
  finishOnboardingAction, onboardingAddStoreAction, onboardingDeleteMonthAction, onboardingImportCsvAction,
  onboardingRemoveStoreAction, onboardingSaveMonthAction, saveCompanyAction,
} from "@/server/actions/onboarding";
import { signOutAction } from "@/server/authActions";
import { db } from "@/server/db";
import { getOnboardingContext } from "@/server/onboarding";
import { first, type SearchParams } from "@/server/period";
import { getMonthFacts, getStores } from "@/server/queries";
import { CategoriesForm } from "./CategoriesForm";
import { CompanyForm } from "./CompanyForm";
import { CsvImportForm } from "./CsvImportForm";

export const metadata = { title: "Set up your organization" };

const STEPS = [
  { n: 1, title: "Company", blurb: "Who the data belongs to" },
  { n: 2, title: "Stores", blurb: "Where you sell" },
  { n: 3, title: "Financial data", blurb: "Monthly figures per store" },
  { n: 4, title: "Categories", blurb: "How the assortment is grouped" },
] as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await getOnboardingContext();
  if (ctx.hasCompletedOrg) redirect("/overview");
  const sp = await searchParams;
  const org = ctx.org;
  const stores = org ? await getStores(org.id) : [];
  const requested = Number(first(sp.step));
  const maxStep = !org ? 1 : stores.length === 0 ? 2 : 4;
  const step = Math.min(maxStep, Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : !org ? 1 : 2);
  const current = STEPS[step - 1]!;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-sm bg-ink font-mono text-xs font-bold text-surface">R</span>
          <span className="text-sm font-semibold tracking-tight">RetailLab</span>
          {org && <span className="ml-2 truncate text-xs text-ink-3">Setting up {org.name}</span>}
        </div>
        <form action={signOutAction}><button type="submit" className="btn-ghost btn-sm">Sign out</button></form>
      </header>

      <nav aria-label="Setup progress" className="mb-5">
        <ol className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
          {STEPS.map((s) => {
            const done = s.n < step;
            const reachable = s.n <= maxStep && s.n !== step;
            const inner = (
              <>
                <span className={cn("num grid h-5 w-5 shrink-0 place-items-center rounded-sm border font-mono text-2xs", s.n === step ? "border-ink bg-ink text-surface" : done ? "border-pos/50 text-pos" : "border-line-strong text-ink-3")}>
                  {done ? <Check className="h-3 w-3" aria-hidden /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-xs", s.n === step ? "font-semibold text-ink" : "text-ink-2")}>{s.title}</span>
                  <span className="hidden truncate text-2xs text-ink-3 sm:block">{s.blurb}</span>
                </span>
                <span className="sr-only">{s.n === step ? "(current step)" : done ? "(completed)" : ""}</span>
              </>
            );
            return (
              <li key={s.n} aria-current={s.n === step ? "step" : undefined} className={cn("bg-surface", s.n === step && "bg-surface-2")}>
                {reachable ? (
                  <Link href={`/onboarding?step=${s.n}`} className="flex items-center gap-2 px-2.5 py-2 hover:bg-surface-2">{inner}</Link>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mb-3">
        <div className="label">Step <span className="num">{step}</span> of 4</div>
        <h1 className="text-xl leading-7">
          {step === 1 ? "Tell us about your company" : step === 2 ? "Add your stores" : step === 3 ? "Enter financial data" : "Choose product categories"}
        </h1>
        <p className="mt-0.5 max-w-2xl text-ink-2">
          {step === 1 && "This creates your organization. Your data is private to it; you become its owner."}
          {step === 2 && "Add one or more stores. Only name, code, address, city and type are required."}
          {step === 3 && "Enter the most recent months for each store, or paste a history. RetailLab analyses only what you enter — it never fills gaps with estimates."}
          {step === 4 && "Categories let you see what the revenue consists of. Start from the suggestions and adjust."}
        </p>
      </div>

      {step === 1 && (
        <section className="rounded-md border border-line bg-surface p-4">
          <CompanyForm action={saveCompanyAction} initial={org ? { name: org.name, industry: org.industry, country: org.country, currency: org.currency } : undefined} />
        </section>
      )}

      {step === 2 && org && <StoresStep stores={stores} />}
      {step === 3 && org && <DataStep orgId={org.id} currency={org.currency} stores={stores} selected={first(sp.store)} />}
      {step === 4 && org && <CategoriesStep orgId={org.id} currency={org.currency} stores={stores} />}

      <p className="mt-6 text-xs text-ink-3">Each step is saved as you go. You can leave and continue later; everything can be changed after setup.</p>
    </main>
  );
}

type Stores = Awaited<ReturnType<typeof getStores>>;

function StepNav({ back, next, nextLabel, skip }: { back: number; next?: number; nextLabel?: string; skip?: boolean }) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <Link href={`/onboarding?step=${back}`} className="btn-ghost">Back</Link>
      <div className="flex items-center gap-2">
        {skip && next && <Link href={`/onboarding?step=${next}`} className="btn-ghost">Skip for now</Link>}
        {next ? <Link href={`/onboarding?step=${next}`} className="btn-primary">{nextLabel ?? "Continue"}</Link> : <span className="btn-primary cursor-not-allowed opacity-50" aria-disabled="true">{nextLabel ?? "Continue"}</span>}
      </div>
    </div>
  );
}

function StoresStep({ stores }: { stores: Stores }) {
  return (
    <>
      <section className="mb-4 rounded-md border border-line bg-surface">
        <header className="border-b border-line px-3 py-2 text-[13px] font-semibold">Stores added <span className="num ml-1 font-normal text-ink-3">{stores.length}</span></header>
        {stores.length === 0 ? (
          <p className="px-3 py-4 text-xs text-ink-3">No stores yet. Add at least one to continue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Store</th><th>City</th><th>Type</th><th className="text-right">Area m²</th><th className="text-right">Employees</th><th className="text-right">Coordinates</th><th /></tr></thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap font-medium">{s.name}<span className="ml-2 font-mono text-2xs font-normal text-ink-3">{s.code}</span></td>
                    <td className="text-ink-2">{s.city}</td>
                    <td className="whitespace-nowrap text-ink-2">{STORE_TYPE_LABELS[s.type]}</td>
                    <td className="r">{s.areaSqm === null ? <Missing reason="Not provided" /> : fmtNumber(s.areaSqm)}</td>
                    <td className="r">{s.employees === null ? <Missing reason="Not provided" /> : fmtNumber(s.employees)}</td>
                    <td className="r">{s.latitude === null ? <Missing reason="Not provided" /> : "Yes"}</td>
                    <td className="py-1 text-right"><ConfirmSubmit action={onboardingRemoveStoreAction} fields={{ storeId: s.id }} label="Remove" subject={s.name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-semibold">{stores.length === 0 ? "Add your first store" : "Add another store"}</h2>
        <StoreForm action={onboardingAddStoreAction} submitLabel="Add store" resetOnSuccess />
      </section>
      <StepNav back={1} next={stores.length > 0 ? 3 : undefined} />
    </>
  );
}

async function DataStep({ orgId, currency, stores, selected }: { orgId: string; currency: string; stores: Stores; selected?: string }) {
  const store = stores.find((s) => s.id === selected) ?? stores[0]!;
  const facts = await getMonthFacts(orgId);
  const months = facts.filter((f) => f.storeId === store.id).sort((a, b) => (a.month < b.month ? 1 : -1));
  const thisMonth = monthKey(new Date());
  const earliest = months[months.length - 1]?.month;
  const defaultMonth = earliest ? addMonths(earliest, -1) : addMonths(thisMonth, -1);
  const count = (id: string) => facts.filter((f) => f.storeId === id).length;
  const without = stores.filter((s) => count(s.id) === 0);

  return (
    <>
      <nav aria-label="Store" className="scroll-thin mb-3 flex gap-1 overflow-x-auto">
        {stores.map((s) => (
          <Link
            key={s.id} href={`/onboarding?step=3&store=${s.id}`} scroll={false} aria-current={s.id === store.id ? "page" : undefined}
            className={cn("flex h-8 shrink-0 items-center gap-2 rounded border px-2.5 text-xs", s.id === store.id ? "border-ink bg-ink font-medium text-surface" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2")}
          >
            {s.name}
            <span className={cn("num rounded-sm px-1 text-2xs", s.id === store.id ? "bg-surface/20" : "bg-line/70")}>{count(s.id)} mo</span>
          </Link>
        ))}
      </nav>

      <section className="mb-4 rounded-md border border-line bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Add a month for {store.name}</h2>
        <MonthForm
          key={store.id}
          action={onboardingSaveMonthAction} storeId={store.id} initial={{ month: defaultMonth }} currency={currency} maxMonth={thisMonth}
          submitLabel="Save month" resetOnSuccess
        />
      </section>

      <section className="mb-4 rounded-md border border-line bg-surface p-4">
        <h2 className="mb-1 text-[13px] font-semibold">Or paste several months at once</h2>
        <CsvImportForm key={store.id} action={onboardingImportCsvAction} storeId={store.id} storeName={store.name} />
      </section>

      <section className="rounded-md border border-line bg-surface">
        <header className="border-b border-line px-3 py-2 text-[13px] font-semibold">Months entered for {store.name} <span className="num ml-1 font-normal text-ink-3">{months.length}</span></header>
        {months.length === 0 ? (
          <p className="px-3 py-4 text-xs text-ink-3">Nothing entered yet for this store.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">Transactions</th><th className="text-right">Customers</th><th className="text-right">Margin</th><th className="text-right">Operating costs</th><th /></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td className="num whitespace-nowrap font-medium">{monthLabelLong(m.month)}</td>
                    <td className="r">{fmtMoney(m.revenue, currency)}</td>
                    <td className="r">{m.transactions === null ? <Missing reason="Not provided" /> : fmtNumber(m.transactions)}</td>
                    <td className="r">{m.customers === null ? <Missing reason="Not provided" /> : fmtNumber(m.customers)}</td>
                    <td className="r">{m.grossMarginPct === null ? <Missing reason="Not provided" /> : fmtPct(m.grossMarginPct)}</td>
                    <td className="r">{m.operatingCosts === null ? <Missing reason="Not provided" /> : fmtMoney(m.operatingCosts, currency)}</td>
                    <td className="py-1 text-right"><ConfirmSubmit action={onboardingDeleteMonthAction} fields={{ storeId: store.id, month: m.month }} label="Remove" subject={monthLabelLong(m.month)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {without.length > 0 && (
        <Notice tone="info" className="mt-3">
          No data yet for: {without.map((s) => s.name).join(", ")}. You can continue — these stores will show as “no data” until months are entered.
        </Notice>
      )}
      <StepNav back={2} next={4} skip={facts.length === 0} nextLabel="Continue" />
    </>
  );
}

async function CategoriesStep({ orgId, currency, stores }: { orgId: string; currency: string; stores: Stores }) {
  const [categories, latest] = await Promise.all([
    db.category.findMany({ where: { organizationId: orgId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    db.monthlyRevenue.groupBy({ by: ["storeId"], where: { store: { organizationId: orgId } }, _max: { month: true } }),
  ]);
  const withData = stores.flatMap((s) => {
    const m = latest.find((l) => l.storeId === s.id)?._max.month;
    if (!m) return [];
    const key = monthKey(m);
    return [{ id: s.id, name: s.name, latestMonth: key, latestLabel: monthLabelLong(key) }];
  });
  return (
    <>
      <section className="rounded-md border border-line bg-surface p-4">
        <CategoriesForm action={finishOnboardingAction} existing={categories.map((c) => c.name)} stores={withData} currency={currency} />
      </section>
      <div className="mt-4"><Link href="/onboarding?step=3" className="btn-ghost">Back</Link></div>
    </>
  );
}
