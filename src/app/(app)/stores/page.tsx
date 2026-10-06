import Link from "next/link";
import { Plus } from "lucide-react";
import { Delta, EmptyState, Missing, PageHeader, Panel, Tag } from "@/components/ui";
import { computeKpis } from "@/lib/analytics/aggregate";
import { STORE_TYPE_LABELS } from "@/lib/analytics/types";
import { calculateGrowthRate } from "@/lib/calc";
import { storeColorMap } from "@/lib/colors";
import { fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { addMonths, monthLabel, monthLabelLong } from "@/lib/period";
import { getLatestMonth, getMonthFacts, getStores } from "@/server/queries";
import { canWrite, requireOrg } from "@/server/session";
import { getStoreQuality } from "@/server/storeQuality";

export const metadata = { title: "Stores" };

export default async function StoresPage() {
  const ctx = await requireOrg();
  const currency = ctx.org.currency;
  const [stores, latest] = await Promise.all([getStores(ctx.orgId), getLatestMonth(ctx.orgId)]);
  const writer = canWrite(ctx.role);
  const add = writer ? <Link href="/stores/new" className="btn-primary"><Plus className="h-3.5 w-3.5" aria-hidden />Add store</Link> : null;
  const title = <span className="flex flex-wrap items-center gap-2">Stores {ctx.org.isDemo && <Tag kind="DEMO" />}</span>;

  if (stores.length === 0) {
    return (
      <>
        <PageHeader title={title} actions={add} />
        <EmptyState title="No stores yet" action={add}>
          Add a store with its address and basic facts, then enter monthly figures. Analysis starts from recorded data only.
        </EmptyState>
      </>
    );
  }

  const yearAgo = latest ? addMonths(latest, -12) : null;
  const [facts, quality] = await Promise.all([
    latest ? getMonthFacts(ctx.orgId, { from: yearAgo!, to: latest }).then((fs) => fs.filter((f) => f.month === latest || f.month === yearAgo)) : Promise.resolve([]),
    getStoreQuality(ctx.orgId, stores),
  ]);
  const colors = storeColorMap(stores);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          latest
            ? <><span className="num">{stores.length}</span> store{stores.length === 1 ? "" : "s"} · figures for <span className="num">{monthLabelLong(latest)}</span>, the latest month with data</>
            : <><span className="num">{stores.length}</span> store{stores.length === 1 ? "" : "s"} · no monthly data entered yet</>
        }
        actions={add}
      />
      <Panel flush>
        <div className="overflow-x-auto">
          <table className="tbl [&_td]:px-2.5 [&_th]:px-2.5">
            <thead>
              <tr>
                <th>Store</th>
                <th>City</th>
                <th>Type</th>
                <th className="text-right">Area m²</th>
                <th className="text-right">Empl.</th>
                <th className="text-right">Revenue{latest ? ` · ${monthLabel(latest)}` : ""}</th>
                <th className="text-right">YoY</th>
                <th className="text-right">Cust. / day</th>
                <th className="text-right">Basket</th>
                <th className="text-right">Rev / m²</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Data</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const cur = computeKpis(facts.filter((f) => f.storeId === s.id && f.month === latest), [s]);
                const prev = computeKpis(facts.filter((f) => f.storeId === s.id && f.month === yearAgo), [s]);
                const q = quality.get(s.id);
                const noData = "No data for this month";
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/stores/${s.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colors[s.id] }} />
                        {s.name}
                      </Link>
                      <span className="ml-2 font-mono text-2xs text-ink-3">{s.code}</span>
                    </td>
                    <td className="whitespace-nowrap text-ink-2">{s.city}</td>
                    <td className="whitespace-nowrap text-ink-2">{STORE_TYPE_LABELS[s.type].replace(/ Store$/, "")}</td>
                    <td className="r">{s.areaSqm === null ? <Missing reason="Sales area not provided" /> : fmtNumber(s.areaSqm)}</td>
                    <td className="r">{s.employees === null ? <Missing reason="Employees not provided" /> : fmtNumber(s.employees)}</td>
                    <td className="r font-medium">{cur.revenue === null ? <Missing reason={noData} /> : fmtMoney(cur.revenue, currency)}</td>
                    <td className="r"><Delta value={calculateGrowthRate(cur.revenue, prev.revenue)} /></td>
                    <td className="r">{cur.customersPerDay === null ? <Missing reason="Customers or open days missing" /> : fmtNumber(cur.customersPerDay)}</td>
                    <td className="r">{cur.averageBasket === null ? <Missing reason="Transactions missing" /> : fmtMoney(cur.averageBasket, currency, 2)}</td>
                    <td className="r">{cur.revenuePerSqm === null ? <Missing reason="Revenue or sales area missing" /> : fmtMoney(cur.revenuePerSqm, currency)}</td>
                    <td className="r">{cur.grossMarginPct === null ? <Missing reason="Margin not entered" /> : fmtPct(cur.grossMarginPct)}</td>
                    <td className="r">
                      {q ? (
                        <Link href={`/stores/${s.id}#data-quality`} className="inline-flex items-center justify-end gap-2 hover:underline" title={q.missing.length ? `Missing: ${q.missing.map((m) => m.label).join(", ")}` : "All checked inputs are present"}>
                          <span aria-hidden className="h-1 w-8 overflow-hidden rounded-sm bg-line"><span className="block h-full bg-ink-2" style={{ width: `${q.scorePct}%` }} /></span>
                          {fmtPct(q.scorePct, 0)}
                        </Link>
                      ) : <Missing />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          <Tag kind="CALCULATED" className="mr-1.5" />
          YoY = revenue vs the same month one year earlier. Basket = revenue / transactions. Rev / m² = monthly revenue / sales area.
          Data quality = share of 16 completeness checks that are met — it measures how much can be analysed, not how well a store performs. — means the input is missing.
        </p>
      </Panel>
    </>
  );
}
