"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartFrame, ChartTooltip, Legend } from "./ChartFrame";
import { formatAxis, formatValue, type ValueFormat } from "./format";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarsChartProps {
  /** One row per category. Single-series: use `value` (+ optional `color`). Multi-series: one field per series key. */
  data: Array<{ label: string; color?: string } & Record<string, string | number | null | undefined>>;
  /** Omit for a single series reading `value`. */
  series?: BarSeries[];
  /** Stack the series instead of grouping them. */
  stacked?: boolean;
  format: ValueFormat;
  currency?: string;
  height?: number;
  summary: string;
  /** Horizontal bars (better for long category names / rankings). */
  horizontal?: boolean;
  /** Print the value at the end of each bar (single series only). */
  showValues?: boolean;
  /** Optional reference line, e.g. a median. */
  reference?: { value: number; label: string };
}

/** Bar chart for comparing magnitudes across categories. Bars always start at zero. */
export function BarsChart({ data, series, stacked, format, currency = "EUR", height = 240, summary, horizontal, showValues, reference }: BarsChartProps) {
  const ss: BarSeries[] = series ?? [{ key: "value", label: "Value", color: "var(--s1)" }];
  const single = !series;
  const table = {
    columns: ["", ...(single ? ["Value"] : ss.map((s) => s.label))],
    rows: data.map((d) => [d.label, ...ss.map((s) => formatValue(typeof d[s.key] === "number" ? (d[s.key] as number) : null, format, currency))]),
  };
  const valueAxis = { tick: AXIS_TICK, tickLine: false, axisLine: false, tickFormatter: (v: number) => formatAxis(v, format, currency) } as const;
  const catAxis = { dataKey: "label", tick: AXIS_TICK, tickLine: false, axisLine: { stroke: "var(--grid)" } } as const;
  const radius: [number, number, number, number] = horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0];
  return (
    <ChartFrame summary={summary} table={table} height={height} legend={single ? undefined : <Legend items={ss} />}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 6, right: showValues && horizontal ? 64 : 8, bottom: 0, left: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? <XAxis type="number" {...valueAxis} /> : <XAxis {...catAxis} interval={0} />}
          {horizontal ? <YAxis type="category" {...catAxis} width={132} axisLine={false} /> : <YAxis {...valueAxis} width={56} />}
          <Tooltip
            cursor={{ fill: "rgb(var(--line) / 0.5)" }}
            isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as Record<string, unknown>;
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={ss.filter((s) => typeof row[s.key] === "number").map((s) => ({
                    label: single ? "Value" : s.label,
                    color: single ? ((row.color as string) ?? s.color) : s.color,
                    value: formatValue(row[s.key] as number, format, currency),
                  }))}
                />
              );
            }}
          />
          {reference && (
            horizontal
              ? <ReferenceLine x={reference.value} stroke="rgb(var(--ink-2))" strokeDasharray="3 3" label={{ value: reference.label, position: "top", fontSize: 10, fill: "rgb(var(--ink-2))" }} />
              : <ReferenceLine y={reference.value} stroke="rgb(var(--ink-2))" strokeDasharray="3 3" label={{ value: reference.label, position: "insideTopRight", fontSize: 10, fill: "rgb(var(--ink-2))" }} />
          )}
          {ss.map((s, si) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked && si < ss.length - 1 ? 0 : radius} maxBarSize={36} isAnimationActive={false} stroke="rgb(var(--surface))" strokeWidth={stacked ? 1 : 0}>
              {single && data.map((d, i) => <Cell key={i} fill={d.color ?? s.color} />)}
              {single && showValues && (
                <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={(v: number) => formatValue(v, format, currency)} style={{ fontSize: 11, fill: "rgb(var(--ink-2))", fontVariantNumeric: "tabular-nums" }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
