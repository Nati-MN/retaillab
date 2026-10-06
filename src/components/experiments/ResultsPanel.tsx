import { BarsChart } from "@/components/charts";
import { CalcBlock, Kpi, KpiGrid, Notice, Tag } from "@/components/ui";
import { fmtSignedPct, fmtSignedPts } from "@/lib/format";
import {
  fmtMetric, fmtMetricDelta, liftLines, metricLift, orderMetrics, type ExperimentDTO, type ExperimentMetricDTO,
} from "@/lib/experiments/model";

function chartFormat(m: ExperimentMetricDTO): "money" | "money2" | "number" | "number1" | "pct" {
  const vals = [m.testBefore, m.testAfter, m.controlBefore, m.controlAfter].filter((v): v is number => v !== null);
  const fractional = vals.some((v) => !Number.isInteger(v)) && vals.every((v) => Math.abs(v) < 1000);
  if (m.unit === "EUR") return fractional ? "money2" : "money";
  if (m.unit === "pct") return "pct";
  return fractional ? "number1" : "number";
}

function NotEntered({ m, status }: { m: ExperimentMetricDTO; status: ExperimentDTO["status"] }) {
  const has = m.testBefore !== null ? "A baseline (before) value is recorded" : m.testAfter !== null ? "Only an after value is recorded" : "No values are recorded";
  return (
    <Notice tone="unavailable" title="Results not entered yet">
      {has}
      {m.testBefore !== null ? <> — <span className="num">{fmtMetric(m.testBefore, m.unit)}</span></> : null}. A result needs both the before and the after value of the test store.
      {status === "PLANNED" || status === "RUNNING" ? " Enter them when the test period ends." : " Enter them in the results form below."}
    </Notice>
  );
}

/** Results per metric, primary first. Every number comes from calculateExperimentLift. */
export function ResultsPanel({ experiment: e, currency }: { experiment: ExperimentDTO; currency: string }) {
  const hasControl = e.controlStore !== null;
  const metrics = orderMetrics(e.metrics);
  const [primary, ...secondary] = metrics;
  if (!primary) {
    return <Notice tone="unavailable" title="No metrics defined">This experiment has no metrics, so there is nothing to measure.</Notice>;
  }
  const pLift = metricLift(primary, hasControl);
  const pLines = liftLines(primary, { hasControl, currency });
  const controlComplete = hasControl && primary.controlBefore !== null && primary.controlAfter !== null;

  return (
    <div className="space-y-5">
      <section aria-labelledby={`m-${primary.id}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="label">Primary metric</span>
          <h3 id={`m-${primary.id}`} className="text-[15px]">{primary.name}</h3>
          {pLift && <Tag kind="EXPERIMENT_RESULT" />}
        </div>
        {!pLift || !pLines ? (
          <NotEntered m={primary} status={e.status} />
        ) : (
          <div className="space-y-3">
            <KpiGrid cols={5}>
              <Kpi label="Before" value={fmtMetric(primary.testBefore, primary.unit, currency)} size="lg" />
              <Kpi label="After" value={fmtMetric(primary.testAfter, primary.unit, currency)} size="lg" />
              <Kpi
                label="Test change"
                value={pLift.rawChangePct !== null ? fmtSignedPct(pLift.rawChangePct) : null}
                missingReason="Baseline is zero"
                size="lg"
                formula={`raw ${fmtMetricDelta(pLift.rawChangeAbs, primary.unit, currency)}`}
              />
              <Kpi
                label="Control change"
                value={pLift.controlChangePct !== null ? fmtSignedPct(pLift.controlChangePct) : null}
                missingReason={hasControl ? "Control values missing" : "No control store"}
                size="lg"
                formula={e.controlStore?.name}
              />
              <Kpi
                label="Control-adjusted"
                value={pLift.controlAdjustedPts !== null ? fmtSignedPts(pLift.controlAdjustedPts) : null}
                missingReason={hasControl ? "Not computable" : "No control store"}
                size="lg"
                formula="test % − control %"
              />
            </KpiGrid>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <CalcBlock lines={pLines} />
              <div className="rounded border border-line p-3">
                <BarsChart
                  height={200}
                  format={chartFormat(primary)}
                  currency={currency}
                  series={[
                    { key: "before", label: "Before", color: "rgb(var(--ink-3))" },
                    { key: "after", label: "After", color: "var(--s1)" },
                  ]}
                  data={[
                    { label: `Test · ${e.testStore.name}`, before: primary.testBefore, after: primary.testAfter },
                    ...(controlComplete ? [{ label: `Control · ${e.controlStore!.name}`, before: primary.controlBefore, after: primary.controlAfter }] : []),
                  ]}
                  summary={
                    `${primary.name}: test store ${fmtMetric(primary.testBefore, primary.unit, currency)} before, ${fmtMetric(primary.testAfter, primary.unit, currency)} after` +
                    (controlComplete
                      ? `; control store ${fmtMetric(primary.controlBefore, primary.unit, currency)} before, ${fmtMetric(primary.controlAfter, primary.unit, currency)} after.`
                      : `. ${hasControl ? "Control values are not entered." : "No control store to compare with."}`)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {secondary.length > 0 && (
        <section aria-label="Secondary metrics">
          <div className="label mb-2">Secondary metrics</div>
          <div className="scroll-thin overflow-x-auto rounded border border-line">
            <table className="tbl min-w-[760px]">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="text-right">Before</th>
                  <th className="text-right">After</th>
                  <th className="text-right">Raw change</th>
                  <th className="text-right">Test %</th>
                  <th className="text-right">Control %</th>
                  <th className="text-right">Control-adjusted</th>
                </tr>
              </thead>
              <tbody>
                {secondary.map((m) => {
                  const l = metricLift(m, hasControl);
                  return (
                    <tr key={m.id}>
                      <td className="font-medium">{m.name}</td>
                      {l ? (
                        <>
                          <td className="r">{fmtMetric(m.testBefore, m.unit, currency)}</td>
                          <td className="r">{fmtMetric(m.testAfter, m.unit, currency)}</td>
                          <td className="r">{fmtMetricDelta(l.rawChangeAbs, m.unit, currency)}</td>
                          <td className="r">{fmtSignedPct(l.rawChangePct)}</td>
                          <td className="r">{fmtSignedPct(l.controlChangePct)}</td>
                          <td className="r font-semibold">{fmtSignedPts(l.controlAdjustedPts)}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="text-xs text-ink-3">
                          Results not entered yet
                          {m.testBefore !== null && <> · baseline <span className="num">{fmtMetric(m.testBefore, m.unit, currency)}</span></>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1.5">
            {secondary.map((m) => {
              const lines = liftLines(m, { hasControl, currency });
              if (!lines) return null;
              return (
                <details key={m.id} className="rounded border border-line">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-ink-3">— all figures with formulas</span>
                    <Tag kind="EXPERIMENT_RESULT" className="ml-auto" />
                  </summary>
                  <div className="border-t border-line p-2"><CalcBlock lines={lines} /></div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
