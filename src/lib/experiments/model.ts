import { calculateExperimentLift, EXPERIMENT_LIMITATIONS, isNum, type ExperimentLift } from "@/lib/calc";
import { fmtMoney, fmtNumber, fmtPct, fmtSignedMoney, fmtSignedPct, fmtSignedPts, MISSING } from "@/lib/format";

/** Pure experiment helpers: DTO shapes, status rules, formatting and case-specific limitations. */

export const EXPERIMENT_STATUSES = ["PLANNED", "RUNNING", "COMPLETED", "STOPPED"] as const;
export type ExperimentStatusKey = (typeof EXPERIMENT_STATUSES)[number];

export const STATUS_LABELS: Record<ExperimentStatusKey, string> = {
  PLANNED: "Planned",
  RUNNING: "Running",
  COMPLETED: "Completed",
  STOPPED: "Stopped",
};

export const EXPERIMENT_DECISIONS = ["ADOPT", "REPEAT", "MODIFY", "REJECT", "INCONCLUSIVE"] as const;
export type ExperimentDecisionKey = (typeof EXPERIMENT_DECISIONS)[number];

/** "Adopt" is a management decision, not proof — the wording never says "proven" or "validated". */
export const DECISION_LABELS: Record<ExperimentDecisionKey, string> = {
  ADOPT: "Adopt",
  REPEAT: "Repeat",
  MODIFY: "Modify and re-test",
  REJECT: "Reject",
  INCONCLUSIVE: "Inconclusive",
};

export const DECISION_HINTS: Record<ExperimentDecisionKey, string> = {
  ADOPT: "Roll the change out. The linked strategy is marked “Adopted after experiment” — a decision, not proof of cause.",
  REPEAT: "Run the same test again (another store or period) before deciding.",
  MODIFY: "Change the design or the measurement and test again.",
  REJECT: "Do not pursue. The linked strategy is marked “Rejected after experiment”.",
  INCONCLUSIVE: "The measurement does not support a decision either way.",
};

export const METRIC_UNITS = ["EUR", "count", "pct"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];
export const UNIT_LABELS: Record<MetricUnit, string> = { EUR: "Money", count: "Count", pct: "Percent" };

export function isMetricUnit(v: unknown): v is MetricUnit {
  return typeof v === "string" && (METRIC_UNITS as readonly string[]).includes(v);
}

export interface ExperimentMetricDTO {
  id: string;
  name: string;
  unit: string;
  isPrimary: boolean;
  testBefore: number | null;
  testAfter: number | null;
  controlBefore: number | null;
  controlAfter: number | null;
}

export interface ExperimentDTO {
  id: string;
  title: string;
  hypothesis: string;
  status: ExperimentStatusKey;
  startDate: string | null;
  endDate: string | null;
  cost: number | null;
  notes: string | null;
  decision: ExperimentDecisionKey | null;
  decisionNote: string | null;
  isDemo: boolean;
  testStore: { id: string; name: string };
  controlStore: { id: string; name: string } | null;
  strategy: { id: string; title: string; status: string } | null;
  metrics: ExperimentMetricDTO[];
}

/** Allowed status changes. Reopening (COMPLETED/STOPPED → RUNNING) withdraws the recorded decision. */
export const STATUS_TRANSITIONS: Record<ExperimentStatusKey, readonly ExperimentStatusKey[]> = {
  PLANNED: ["RUNNING", "STOPPED"],
  RUNNING: ["COMPLETED", "STOPPED", "PLANNED"],
  COMPLETED: ["RUNNING"],
  STOPPED: ["RUNNING", "PLANNED"],
};

export function canTransition(from: ExperimentStatusKey, to: ExperimentStatusKey): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function transitionLabel(from: ExperimentStatusKey, to: ExperimentStatusKey): string {
  if (to === "RUNNING") return from === "PLANNED" ? "Start experiment" : "Reopen";
  if (to === "COMPLETED") return "Mark completed";
  if (to === "STOPPED") return from === "PLANNED" ? "Cancel (stop)" : "Stop early";
  return "Back to planned";
}

/** Strategy status that follows from a decision; null = leave the strategy unchanged. */
export function strategyStatusForDecision(d: ExperimentDecisionKey): "VALIDATED" | "REJECTED" | null {
  if (d === "ADOPT") return "VALIDATED";
  if (d === "REJECT") return "REJECTED";
  return null;
}

export function primaryMetric<T extends { isPrimary: boolean }>(metrics: readonly T[]): T | null {
  return metrics.find((m) => m.isPrimary) ?? metrics[0] ?? null;
}

/** Primary metric first, the rest in their stored order. */
export function orderMetrics<T extends { isPrimary: boolean }>(metrics: readonly T[]): T[] {
  const p = primaryMetric(metrics);
  return p ? [p, ...metrics.filter((m) => m !== p)] : [];
}

export function metricLift(m: Pick<ExperimentMetricDTO, "testBefore" | "testAfter" | "controlBefore" | "controlAfter">, hasControl = true): ExperimentLift | null {
  return calculateExperimentLift({
    testBefore: m.testBefore,
    testAfter: m.testAfter,
    controlBefore: hasControl ? m.controlBefore : null,
    controlAfter: hasControl ? m.controlAfter : null,
  });
}

// ── Formatting by unit ───────────────────────────────────────────────────────

function decimalsFor(v: number): number {
  return Number.isInteger(v) || Math.abs(v) >= 1000 ? 0 : 2;
}

/** "€ 12,400", "20,650", "34.6%" */
export function fmtMetric(v: number | null | undefined, unit: string, currency = "EUR"): string {
  if (!isNum(v)) return MISSING;
  if (unit === "EUR") return fmtMoney(v, currency, decimalsFor(v));
  if (unit === "pct") return fmtPct(v, 1);
  return fmtNumber(v, decimalsFor(v));
}

/** Signed absolute change in the metric's own unit; percent metrics change in points. */
export function fmtMetricDelta(v: number | null | undefined, unit: string, currency = "EUR"): string {
  if (!isNum(v)) return MISSING;
  if (unit === "EUR") return fmtSignedMoney(v, currency, decimalsFor(Math.round(v * 100) / 100));
  if (unit === "pct") return fmtSignedPts(v, 1);
  const d = decimalsFor(Math.round(v * 100) / 100);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${fmtNumber(Math.abs(v), d)}`;
}

/** Bare number for formula expressions (no currency symbol). */
function n(v: number): string {
  return fmtNumber(v, Number.isInteger(v) ? 0 : Math.abs(v) >= 1000 ? 1 : 2);
}

export interface LiftLine {
  key: string;
  label: string;
  expr?: string;
  result: string;
  emphasis?: boolean;
  note?: string;
}

/**
 * The spec's result rows for one metric, each with its formula written out
 * with the actual numbers. Rows that need a control store are still listed
 * (result "—") with the reason, so nothing silently disappears.
 */
export function liftLines(
  m: Pick<ExperimentMetricDTO, "unit" | "testBefore" | "testAfter" | "controlBefore" | "controlAfter">,
  opts: { hasControl: boolean; currency?: string },
): LiftLine[] | null {
  const lift = metricLift(m, opts.hasControl);
  if (!lift || !isNum(m.testBefore) || !isNum(m.testAfter)) return null;
  const cur = opts.currency ?? "EUR";
  const u = m.unit;
  const tb = m.testBefore;
  const ta = m.testAfter;
  const noControl = !opts.hasControl
    ? "No control store"
    : !isNum(m.controlBefore) || !isNum(m.controlAfter)
      ? "Control values not entered"
      : "Control baseline is zero";
  const lines: LiftLine[] = [
    { key: "before", label: "Before (test store)", result: fmtMetric(tb, u, cur) },
    { key: "after", label: "After (test store)", result: fmtMetric(ta, u, cur) },
    { key: "rawAbs", label: "Raw change", expr: `${n(ta)} − ${n(tb)}`, result: fmtMetricDelta(lift.rawChangeAbs, u, cur) },
    {
      key: "rawPct", label: "Raw change %", expr: `(${n(ta)} − ${n(tb)}) / ${n(tb)} × 100`,
      result: fmtSignedPct(lift.rawChangePct), note: lift.rawChangePct === null ? "Baseline is zero — no percentage" : undefined,
    },
  ];
  if (lift.controlChangePct === null) {
    lines.push(
      { key: "controlPct", label: "Control store change %", result: MISSING, note: noControl },
      { key: "adjusted", label: "Control-adjusted change", result: MISSING, emphasis: true, note: "Needs a control store change" },
      { key: "expected", label: "Expected without the change", result: MISSING, note: "Needs a control store change" },
      { key: "absDiff", label: "Absolute difference", result: MISSING },
      { key: "relDiff", label: "Relative difference", result: MISSING },
    );
    return lines;
  }
  const cb = m.controlBefore as number;
  const ca = m.controlAfter as number;
  const c = lift.controlChangePct;
  const exp = lift.expectedWithoutChange as number;
  lines.push(
    { key: "controlPct", label: "Control store change %", expr: `(${n(ca)} − ${n(cb)}) / ${n(cb)} × 100`, result: fmtSignedPct(c) },
    {
      key: "adjusted", label: "Control-adjusted change", emphasis: true,
      expr: lift.rawChangePct !== null ? `${fmtSignedPct(lift.rawChangePct)} − (${fmtSignedPct(c)})` : undefined,
      result: fmtSignedPts(lift.controlAdjustedPts), note: "Test change − control change, in percentage points",
    },
    {
      key: "expected", label: "Expected without the change", expr: `${n(tb)} × (1 + ${fmtNumber(c, 1)}%)`,
      result: fmtMetric(u === "pct" ? exp : Math.round(exp * 100) / 100, u, cur), note: "Assumes the test store would have moved like the control",
    },
    {
      key: "absDiff", label: "Absolute difference", expr: `${n(ta)} − ${n(Math.round(exp * 100) / 100)}`,
      result: fmtMetricDelta(lift.absoluteDifference, u, cur),
    },
    {
      key: "relDiff", label: "Relative difference",
      expr: `${n(Math.round((lift.absoluteDifference as number) * 100) / 100)} / ${n(Math.round(exp * 100) / 100)} × 100`,
      result: fmtSignedPct(lift.relativeDifferencePct),
    },
  );
  return lines;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Last day of an n-week test that starts on `startIso` (inclusive of the start day). */
export function endDateAfterWeeks(startIso: string, weeks: number): string | null {
  const t = toUtc(startIso);
  if (Number.isNaN(t)) return null;
  return toIso(t + (weeks * 7 - 1) * DAY);
}

/** Inclusive number of days between two ISO dates; null when either is missing or the order is wrong. */
export function durationDays(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const a = toUtc(startIso);
  const b = toUtc(endIso);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / DAY) + 1;
}

/** Calendar quarters of the seasonal year, named by months so no hemisphere is assumed. */
const SEASONS = ["Dec–Feb", "Mar–May", "Jun–Aug", "Sep–Nov"] as const;
export function seasonOf(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return SEASONS[Math.floor((m % 12) / 3)]!;
}

/**
 * Seasons touched by the baseline window (same length, immediately before the
 * start) and by the test window. The baseline window is an assumption — the
 * app does not record which period "before" was measured in.
 */
export function seasonSpan(startIso: string | null, endIso: string | null): { before: string[]; during: string[]; differs: boolean } | null {
  const days = durationDays(startIso, endIso);
  if (days === null || !startIso || !endIso) return null;
  const start = toUtc(startIso);
  const collect = (from: number, to: number) => {
    const out: string[] = [];
    for (let t = from; t <= to; t += DAY) {
      const s = seasonOf(toIso(t));
      if (!out.includes(s)) out.push(s);
    }
    return out;
  };
  const before = collect(start - days * DAY, start - DAY);
  const during = collect(start, toUtc(endIso));
  const differs = before.length !== during.length || before.some((s) => !during.includes(s));
  return { before, during, differs };
}

export interface Limitation {
  text: string;
  /** "general" always applies; "case" was derived from this experiment's own data. */
  scope: "general" | "case";
}

/** General limitations plus the ones that follow from this experiment's setup and data. */
export function experimentLimitations(e: Pick<ExperimentDTO, "status" | "startDate" | "endDate" | "controlStore" | "metrics">): Limitation[] {
  const out: Limitation[] = [];
  const hasControl = e.controlStore !== null;
  if (!hasControl) {
    out.push({ scope: "case", text: "No control store: the before/after change cannot be separated from the test store's own trend, seasonality or one-off events. Control-adjusted figures cannot be calculated." });
  }
  const span = seasonSpan(e.startDate, e.endDate);
  if (span?.differs) {
    out.push({
      scope: "case",
      text: `The test period (${span.during.join(", ")}) and an equally long baseline before it (${span.before.join(", ")}) fall in different seasons. Part of the before/after change may be seasonal${hasControl ? "; the control store only corrects for this if both stores share the same seasonality" : ""}.`,
    });
  }
  const days = durationDays(e.startDate, e.endDate);
  if (days !== null && days < 28) {
    out.push({ scope: "case", text: `The test window is ${days} days. Fewer than four weeks rarely covers a full monthly shopping cycle.` });
  }
  if (!e.startDate || !e.endDate) {
    out.push({ scope: "case", text: "Start or end date is not recorded, so seasonal overlap cannot be checked." });
  }
  if (e.status === "STOPPED") {
    out.push({ scope: "case", text: "The experiment was stopped early. Values cover a shorter period than planned and may not be comparable with the baseline." });
  }
  const noTest = e.metrics.filter((m) => !isNum(m.testBefore) || !isNum(m.testAfter));
  if (noTest.length > 0) {
    out.push({ scope: "case", text: `Missing test-store values for: ${noTest.map((m) => m.name).join(", ")}. No result is calculated for ${noTest.length === 1 ? "this metric" : "these metrics"}.` });
  }
  if (hasControl) {
    const noCtrl = e.metrics.filter((m) => isNum(m.testBefore) && isNum(m.testAfter) && (!isNum(m.controlBefore) || !isNum(m.controlAfter)));
    if (noCtrl.length > 0) {
      out.push({ scope: "case", text: `Missing control-store values for: ${noCtrl.map((m) => m.name).join(", ")}. Only the raw change is shown there.` });
    }
  }
  for (const text of EXPERIMENT_LIMITATIONS) {
    // Control-specific general limitations do not apply when there is no control store.
    if (!hasControl && /control store/i.test(text) && !/single test store/i.test(text)) continue;
    out.push({ scope: "general", text });
  }
  return out;
}

export const NOT_A_SIGNIFICANCE_TEST =
  "These figures are descriptive arithmetic on the values entered. They are not a statistical significance test and do not establish that the change caused the difference.";

// ── Metric prefill from a strategy ───────────────────────────────────────────

/** Best guess of a unit from a metric name. The user can change it in the form. */
export function guessMetricUnit(name: string): MetricUnit {
  const s = name.toLowerCase();
  if (/%|margin|share|rate|sell-through|ratio/.test(s)) return "pct";
  if (/transactions|customers|redemptions|items|hours|visits|count|footfall/.test(s)) return "count";
  if (/revenue|cost|basket|value|waste|profit|sales|spend|price/.test(s)) return "EUR";
  return "count";
}

// ── Timeline layout ──────────────────────────────────────────────────────────

export interface TimelineBar {
  id: string;
  /** 0–100, position of the bar's left edge and its width on the axis. */
  leftPct: number;
  widthPct: number;
}

export interface TimelineLayout {
  /** First day of the first month and first day of the month after the last one (ISO). */
  from: string;
  to: string;
  months: { key: string; leftPct: number; widthPct: number }[];
  bars: TimelineBar[];
  /** Null when today is outside the axis. */
  todayPct: number | null;
  /** Experiments without both dates cannot be drawn. */
  undated: string[];
}

function monthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function nextMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Positions experiments on a month axis that spans all dated experiments (and today, when it is within 2 months of them). */
export function timelineLayout(
  items: ReadonlyArray<{ id: string; startDate: string | null; endDate: string | null }>,
  todayIso: string,
): TimelineLayout | null {
  const dated = items.filter((i) => durationDays(i.startDate, i.endDate) !== null);
  const undated = items.filter((i) => !dated.includes(i)).map((i) => i.id);
  if (dated.length === 0) return null;
  const today = toUtc(todayIso);
  let min = Math.min(...dated.map((i) => toUtc(i.startDate!)));
  let max = Math.max(...dated.map((i) => toUtc(i.endDate!)));
  const slack = 62 * DAY;
  if (today < min && min - today <= slack) min = today;
  if (today > max && today - max <= slack) max = today;
  const from = monthStart(min);
  const to = nextMonth(max);
  const total = to - from;
  const pct = (ms: number) => ((ms - from) / total) * 100;
  const months: TimelineLayout["months"] = [];
  for (let t = from; t < to; t = nextMonth(t)) {
    months.push({ key: toIso(t).slice(0, 7), leftPct: pct(t), widthPct: pct(nextMonth(t)) - pct(t) });
  }
  return {
    from: toIso(from),
    to: toIso(to),
    months,
    bars: dated.map((i) => {
      const a = toUtc(i.startDate!);
      const b = toUtc(i.endDate!) + DAY;
      return { id: i.id, leftPct: pct(a), widthPct: pct(b) - pct(a) };
    }),
    todayPct: today >= from && today < to ? pct(today + DAY / 2) : null,
    undated,
  };
}
