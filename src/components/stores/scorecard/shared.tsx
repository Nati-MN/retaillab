import type { StoreDTO } from "@/lib/analytics/types";
import type { MonthKey, Period } from "@/lib/period";

export interface ScorecardProps {
  orgId: string;
  store: StoreDTO;
  /** All stores of the organization, sorted by name (colour slots follow this order). */
  stores: StoreDTO[];
  currency: string;
  period: Period;
  latest: MonthKey;
  canEdit: boolean;
}

/** Numbered question heading: the scorecard reads top to bottom as a chain of questions. */
export function Question({ n, children, hint }: { n: number; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 first:mt-0">
      <h2 className="text-[15px] font-semibold tracking-tight">
        <span className="num mr-2 font-mono text-xs font-medium text-ink-3">{String(n).padStart(2, "0")}</span>
        {children}
      </h2>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export const minMonth = (...keys: string[]) => keys.reduce((a, b) => (a < b ? a : b));
