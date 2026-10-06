import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Panel, Tag } from "@/components/ui";
import type { StoreDataQuality, StoreQualityCheck } from "@/lib/analytics/quality";
import { fmtPct } from "@/lib/format";

const GROUPS: StoreQualityCheck["group"][] = ["Master data", "History", "Monthly figures", "Categories", "Operations & location"];

/**
 * Completeness of the data behind a store. States explicitly that the score is
 * about what can be analysed — never about how the store performs.
 */
export function DataQualityPanel({ quality, storeId, canEdit }: { quality: StoreDataQuality; storeId: string; canEdit: boolean }) {
  const present = quality.checks.length - quality.missing.length;
  return (
    <Panel
      id="data-quality" title="Data quality" kind="CALCULATED"
      subtitle="Completeness of the data on record — not a rating of the business"
      actions={canEdit ? <><Link href={`/stores/${storeId}/edit`} className="btn-ghost btn-sm">Edit store</Link><Link href={`/stores/${storeId}/data`} className="btn-ghost btn-sm">Enter data</Link></> : undefined}
    >
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="num text-2xl font-semibold tracking-tight">{fmtPct(quality.scorePct, 0)}</span>
            <span className="num text-xs text-ink-3">{present} of {quality.checks.length} checks</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-line" role="img" aria-label={`${present} of ${quality.checks.length} completeness checks met`}>
            <div className="h-full bg-ink-2" style={{ width: `${quality.scorePct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[10px] text-ink-3">Checks met / all checks × 100, equal weight</p>
          <p className="mt-3 text-xs leading-5 text-ink-2">
            This score measures <strong className="font-semibold text-ink">completeness only</strong>. A store with 100% can perform poorly and a store with 40% can perform well — a low score means fewer questions can be answered, not that the store is weak.
          </p>
        </div>
        <div className="min-w-0">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g}>
                <div className="label mb-1">{g}</div>
                <ul className="space-y-0.5">
                  {quality.checks.filter((c) => c.group === g).map((c) => (
                    <li key={c.key} className="flex items-baseline gap-1.5 text-xs">
                      {c.present
                        ? <Check className="h-3 w-3 shrink-0 translate-y-0.5 text-pos" aria-hidden />
                        : <Minus className="h-3 w-3 shrink-0 translate-y-0.5 text-warn" aria-hidden />}
                      <span className={c.present ? "text-ink-2" : "font-medium text-ink"}>{c.label}</span>
                      <span className="sr-only">{c.present ? "present" : "missing"}</span>
                      {c.detail && <span className="num text-ink-3">· {c.detail}</span>}
                      {!c.present && <span className="font-mono text-[10px] uppercase tracking-wider text-warn">missing</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-1.5 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">What is missing, and what it limits</h3>
          <Tag kind="UNKNOWN">{quality.missing.length} gap{quality.missing.length === 1 ? "" : "s"}</Tag>
        </div>
        {quality.missing.length === 0 ? (
          <p className="text-xs text-ink-2">Every checked input is on record. Complete data still does not explain performance — it only makes the analysis possible.</p>
        ) : (
          <dl className="divide-y divide-line rounded border border-line">
            {quality.missing.map((c) => (
              <div key={c.key} className="grid gap-x-4 gap-y-0.5 px-3 py-2 sm:grid-cols-[13rem_minmax(0,1fr)]">
                <dt className="text-xs font-medium">{c.label}{c.detail && <span className="num ml-1.5 font-normal text-ink-3">{c.detail}</span>}</dt>
                <dd className="text-xs text-ink-2">{c.impact}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Panel>
  );
}
