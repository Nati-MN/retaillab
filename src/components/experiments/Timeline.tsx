import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { monthName } from "@/lib/period";
import { STATUS_LABELS, timelineLayout, type ExperimentDTO, type ExperimentStatusKey } from "@/lib/experiments/model";

const BAR: Record<ExperimentStatusKey, string> = {
  PLANNED: "border-dashed border-ink-3 bg-transparent",
  RUNNING: "border-info bg-info/25",
  COMPLETED: "border-pos bg-pos/25",
  STOPPED: "border-neg bg-neg/20",
};

const LEGEND: ExperimentStatusKey[] = ["PLANNED", "RUNNING", "COMPLETED", "STOPPED"];

/**
 * Month-axis timeline: one row per experiment, a bar from start to end date.
 * Status is carried by the text label next to each bar (colour is secondary).
 * The same list is readable without the graphic: every row has a full text
 * description for assistive technology.
 */
export function ExperimentTimeline({ experiments, todayIso }: { experiments: ExperimentDTO[]; todayIso: string }) {
  const layout = timelineLayout(experiments, todayIso);
  if (!layout) {
    return <p className="p-3 text-xs text-ink-3">No experiment has both a start and an end date yet, so there is nothing to place on the time axis.</p>;
  }
  const barById = new Map(layout.bars.map((b) => [b.id, b]));
  const rows = [...experiments].sort((a, b) => (a.startDate ?? "9999") < (b.startDate ?? "9999") ? -1 : 1);
  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[740px] sm:min-w-[820px]">
          {/* Axis */}
          <div className="flex border-b border-line" aria-hidden>
            <div className="label w-[150px] shrink-0 px-3 py-1.5 sm:w-[230px]">Experiment · test store</div>
            <div className="relative h-9 flex-1">
              {layout.months.map((m, i) => {
                const month = Number(m.key.slice(5, 7));
                const showYear = i === 0 || month === 1;
                return (
                  <div key={m.key} className="absolute inset-y-0 border-l border-line pl-1 pt-1" style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}>
                    <div className="num font-mono text-[10px] leading-3 text-ink-3">{showYear ? m.key.slice(0, 4) : " "}</div>
                    <div className="font-mono text-[10px] uppercase leading-4 text-ink-2">{monthName(month)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Rows */}
          <ol className="relative">
            {rows.map((e) => {
              const bar = barById.get(e.id);
              const labelLeft = bar ? bar.leftPct + bar.widthPct > 68 : false;
              const range = `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`;
              return (
                <li key={e.id} className="flex border-b border-line last:border-b-0 hover:bg-surface-2">
                  <div className="w-[150px] shrink-0 px-3 py-2 sm:w-[230px]">
                    <Link href={`/experiments/${e.id}`} className="block truncate font-medium hover:underline" title={e.title}>{e.title}</Link>
                    <div className="truncate text-xs text-ink-3">
                      {e.testStore.name}
                      {e.controlStore ? ` vs ${e.controlStore.name}` : " · no control"}
                    </div>
                    <span className="sr-only">
                      {STATUS_LABELS[e.status]}. {bar ? `From ${fmtDate(e.startDate)} to ${fmtDate(e.endDate)}.` : "Dates not set."}
                    </span>
                  </div>
                  <div className="relative flex-1" aria-hidden>
                    {layout.months.map((m) => (
                      <div key={m.key} className="absolute inset-y-0 border-l border-line/70" style={{ left: `${m.leftPct}%` }} />
                    ))}
                    {bar ? (
                      <>
                        <Link
                          href={`/experiments/${e.id}`}
                          tabIndex={-1}
                          title={`${e.title} — ${STATUS_LABELS[e.status]}, ${range}`}
                          className={cn("absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border", BAR[e.status])}
                          style={{ left: `${bar.leftPct}%`, width: `max(${bar.widthPct}%, 6px)` }}
                        />
                        <div
                          className="absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-xs"
                          style={labelLeft ? { right: `calc(${100 - bar.leftPct}% + 6px)` } : { left: `calc(${bar.leftPct + bar.widthPct}% + 6px)` }}
                        >
                          <span className="font-medium text-ink">{STATUS_LABELS[e.status]}</span>
                          <span className="num ml-1.5 text-ink-3">{range}</span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-3">Dates not set — not on the axis</div>
                    )}
                  </div>
                </li>
              );
            })}
            {layout.todayPct !== null && (
              <li aria-hidden className="pointer-events-none absolute inset-y-0 left-[150px] right-0 sm:left-[230px]">
                <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${layout.todayPct}%` }} />
              </li>
            )}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-ink-2">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("inline-block h-3 w-5 rounded-sm border", BAR[s])} />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-px bg-accent" />
          {layout.todayPct !== null ? <>Today <span className="num text-ink-3">{fmtDate(todayIso)}</span></> : <span className="text-ink-3">Today ({fmtDate(todayIso)}) is outside the axis</span>}
        </span>
      </div>
    </div>
  );
}
