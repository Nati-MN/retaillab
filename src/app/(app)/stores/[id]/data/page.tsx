import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/stores/ConfirmSubmit";
import { EventForm } from "@/components/stores/EventForm";
import { MonthForm, type MonthFormInitial } from "@/components/stores/MonthForm";
import { EmptyState, Missing, Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { fmtDate, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { addMonths, isMonthKey, monthKey, monthLabelLong } from "@/lib/period";
import { addEventAction, deleteEventAction, deleteMonthAction, saveMonthAction } from "@/server/actions/stores";
import { db } from "@/server/db";
import { first, type SearchParams } from "@/server/period";
import { getCategoryFacts, getKnownEvents, getMonthFacts, getStore } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";

export const metadata = { title: "Monthly data" };

export default async function StoreDataPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const sp = await searchParams;
  const store = await getStore(ctx.orgId, id);
  if (!store) notFound();
  const currency = ctx.org.currency;
  const writer = canWrite(ctx.role);
  const base = `/stores/${store.id}/data`;

  const [facts, categories, events] = await Promise.all([
    getMonthFacts(ctx.orgId, { storeIds: [store.id] }),
    db.category.findMany({ where: { organizationId: ctx.orgId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    getKnownEvents(ctx.orgId, store.id),
  ]);
  const months = [...facts].sort((a, b) => (a.month < b.month ? 1 : -1));
  const thisMonth = monthKey(new Date());
  const editParam = first(sp.month);
  const editMonth = isMonthKey(editParam) && editParam <= thisMonth ? editParam : null;
  const existing = editMonth ? months.find((m) => m.month === editMonth) : undefined;
  const nextMonth = months[0] ? (addMonths(months[0].month, 1) <= thisMonth ? addMonths(months[0].month, 1) : thisMonth) : addMonths(thisMonth, -1);
  const formMonth = editMonth ?? nextMonth;
  const catFacts = existing ? await getCategoryFacts(ctx.orgId, { storeIds: [store.id], from: formMonth, to: formMonth }) : [];
  const catCounts = await db.categoryMetric.groupBy({ by: ["month"], where: { storeId: store.id, store: { organizationId: ctx.orgId } }, _count: { _all: true } });
  const catCount = new Map(catCounts.map((c) => [monthKey(c.month), c._count._all]));

  const initial: MonthFormInitial = existing
    ? {
        month: existing.month, revenue: existing.revenue, transactions: existing.transactions, customers: existing.customers,
        grossMarginPct: existing.grossMarginPct, openDays: existing.openDays, costs: existing.costs,
        categories: Object.fromEntries(catFacts.map((c) => [c.categoryId, { revenue: c.revenue, marginPct: c.marginPct }])),
      }
    : { month: formMonth };
  const saved = first(sp.saved);
  const annual = months.slice(0, 12);
  const annualRevenue = annual.reduce((a, m) => a + m.revenue, 0);

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/stores" className="hover:text-ink">Stores</Link> / <Link href={`/stores/${store.id}`} className="hover:text-ink">{store.name}</Link></>}
        title={<span className="flex flex-wrap items-center gap-2">Monthly data · {store.name} {store.isDemo && <Tag kind="DEMO" />}</span>}
        subtitle="One row per month. Revenue is required; every other figure is optional and stays “not provided” until you enter it."
        actions={<Link href={`/stores/${store.id}`} className="btn-secondary">Back to scorecard</Link>}
      />
      {saved && isMonthKey(saved) && <Notice tone="info" className="mb-3"><span className="num">{monthLabelLong(saved)}</span> was saved.</Notice>}
      {!writer && <Notice tone="warn" className="mb-3" title="Read-only access">Your role can view the recorded figures but not change them.</Notice>}

      {writer && (
        <Panel
          id="entry" className="mb-4"
          title={existing ? `Edit ${monthLabelLong(existing.month)}` : "Add a month"}
          subtitle={existing ? "Saving replaces the stored values of this month" : "If the month already exists, saving replaces it"}
        >
          <MonthForm
            key={`${formMonth}-${existing ? "edit" : "new"}`}
            action={saveMonthAction} storeId={store.id} initial={initial} categories={categories} currency={currency} maxMonth={thisMonth}
            submitLabel={existing ? "Save changes" : "Save month"} cancelHref={existing ? base : undefined} editing={!!existing}
          />
          {categories.length === 0 && (
            <p className="mt-3 text-xs text-ink-3">No product categories are defined for {ctx.org.name}, so category revenue cannot be entered here.</p>
          )}
        </Panel>
      )}

      <Panel
        title="Recorded months" flush
        subtitle={months.length > 0 ? `${months.length} month${months.length === 1 ? "" : "s"} · newest first` : undefined}
      >
        {months.length === 0 ? (
          <div className="p-3"><EmptyState title="No months recorded">Enter the first month above. The scorecard stays empty until revenue exists.</EmptyState></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Transactions</th>
                    <th className="text-right">Customers</th>
                    <th className="text-right">Margin</th>
                    <th className="text-right">Open days</th>
                    <th className="text-right">Operating costs</th>
                    <th className="text-right">Cost lines</th>
                    <th className="text-right">Categories</th>
                    {writer && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className={m.month === editMonth ? "bg-surface-2" : undefined}>
                      <td className="num whitespace-nowrap font-medium">{monthLabelLong(m.month)}</td>
                      <td className="r">{fmtMoney(m.revenue, currency)}</td>
                      <td className="r">{m.transactions === null ? <Missing reason="Not provided" /> : fmtNumber(m.transactions)}</td>
                      <td className="r">{m.customers === null ? <Missing reason="Not provided" /> : fmtNumber(m.customers)}</td>
                      <td className="r">{m.grossMarginPct === null ? <Missing reason="Not provided" /> : fmtPct(m.grossMarginPct)}</td>
                      <td className="r">{m.openDays === null ? <Missing reason="Not provided" /> : fmtNumber(m.openDays)}</td>
                      <td className="r">{m.operatingCosts === null ? <Missing reason="No cost lines entered" /> : fmtMoney(m.operatingCosts, currency)}</td>
                      <td className="r text-ink-2">{Object.keys(m.costs).length} / 8</td>
                      <td className="r text-ink-2">{catCount.get(m.month) ?? 0}{categories.length > 0 ? ` / ${categories.length}` : ""}</td>
                      {writer && (
                        <td className="whitespace-nowrap py-1 text-right">
                          <Link href={`${base}?month=${m.month}#entry`} className="btn-ghost btn-sm" aria-label={`Edit ${monthLabelLong(m.month)}`}>Edit</Link>
                          <ConfirmSubmit action={deleteMonthAction} fields={{ storeId: store.id, month: m.month }} label="Delete" subject={monthLabelLong(m.month)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
              <Tag kind="CALCULATED" className="mr-1.5" />
              Annual revenue is the sum of the entered months: the latest <span className="num">{annual.length}</span> month{annual.length === 1 ? "" : "s"} total <span className="num font-medium text-ink-2">{fmtMoney(annualRevenue, currency)}</span>
              {annual.length < 12 && <> — fewer than 12 months are recorded, so this is not a full year</>}. Operating costs = sum of the cost lines entered. Deleting a month removes its revenue, costs, category figures and operational metrics.
            </p>
          </>
        )}
      </Panel>

      <Panel title="Known events" kind="FACT" className="mt-4" subtitle="Dated facts you know about: renovation, road works, a competitor opening, a strike">
        <p className="mb-3 max-w-3xl text-xs text-ink-2">
          Anomaly views only cite events recorded here. RetailLab lists an event next to an unusual month — it never claims the event caused the change.
        </p>
        {events.length > 0 ? (
          <ul className="mb-3 divide-y divide-line rounded border border-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="num mr-2 text-ink-2">{fmtDate(e.date)}</span>
                  <span className="font-medium">{e.title}</span>
                  {e.storeId === null && <span className="ml-2 text-xs text-ink-3">(all stores)</span>}
                  {e.description && <div className="text-xs text-ink-2">{e.description}</div>}
                </div>
                {writer && e.storeId === store.id && (
                  <ConfirmSubmit action={deleteEventAction} fields={{ storeId: store.id, eventId: e.id }} label="Remove" subject={e.title} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 rounded border border-dashed border-line-strong px-3 py-2 text-xs text-ink-3">No events on record for this store.</p>
        )}
        {writer && <EventForm action={addEventAction} storeId={store.id} maxDate={new Date().toISOString().slice(0, 10)} />}
      </Panel>
    </>
  );
}
