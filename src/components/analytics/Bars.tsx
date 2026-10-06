"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartFrame, ChartTooltip, Legend, formatAxis, formatValue, type BarsChartProps } from "@/components/charts";

/**
 * Bar chart for the analytics area. Same props as `BarsChart` from
 * `@/components/charts`, with two differences:
 *  - the axes are direct children of <BarChart> (Recharts 2 does not discover
 *    axes wrapped in a fragment, which leaves the chart without axes and
 *    breaks the horizontal layout);
 *  - `signed` draws a zero line for series that go below zero (e.g. seasonal
 *    index as % above/below an average month).
 */
export function Bars({
  data, series, stacked, format, currency = "EUR", height = 240, summary, horizontal, showValues, reference, signed, categoryWidth = 132,
}: BarsChartProps & { signed?: boolean; categoryWidth?: number }) {
  const ss = series ?? [{ key: "value", label: "Value", color: "var(--s1)" }];
  const single = !series;
  const table = {
    columns: ["", ...(single ? ["Value"] : ss.map((s) => s.label))],
    rows: data.map((d) => [d.label, ...ss.map((s) => formatValue(typeof d[s.key] === "number" ? (d[s.key] as number) : null, format, currency))]),
  };
  const tickFormatter = (v: number) => formatAxis(v, format, currency);
  return (
    <ChartFrame summary={summary} table={table} height={height} legend={single ? undefined : <Legend items={ss} />}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: showValues && !horizontal ? 18 : 6, right: horizontal ? (showValues ? 64 : 16) : 8, bottom: 0, left: 0 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal
            ? <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
            : <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--grid)" }} interval={0} />}
          {horizontal
            ? <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={categoryWidth} interval={0} />
            : <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={tickFormatter} />}
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
          {signed && (horizontal
            ? <ReferenceLine x={0} stroke="rgb(var(--ink-3))" />
            : <ReferenceLine y={0} stroke="rgb(var(--ink-3))" />)}
          {reference && (horizontal
            ? <ReferenceLine x={reference.value} stroke="rgb(var(--ink-2))" strokeDasharray="3 3" label={{ value: reference.label, position: "top", fontSize: 10, fill: "rgb(var(--ink-2))" }} />
            : <ReferenceLine y={reference.value} stroke="rgb(var(--ink-2))" strokeDasharray="3 3" label={{ value: reference.label, position: "insideTopRight", fontSize: 10, fill: "rgb(var(--ink-2))" }} />)}
          {ss.map((s, si) => (
            <Bar
              key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined}
              radius={stacked ? (si === ss.length - 1 ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0) : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              maxBarSize={36} isAnimationActive={false} stroke="rgb(var(--surface))" strokeWidth={stacked ? 1.5 : 0}
            >
              {single && data.map((d, i) => <Cell key={i} fill={d.color ?? s.color} />)}
              {single && showValues && (
                <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={(v: number) => formatValue(v, format, currency)} style={{ fontSize: 10, fill: "rgb(var(--ink-2))", fontVariantNumeric: "tabular-nums" }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
