"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartFrame, ChartTooltip, Legend } from "./ChartFrame";
import { formatAxis, formatValue, type ValueFormat } from "./format";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface TrendChartProps {
  /** Rows keyed by `label` (x axis) plus one numeric field per series key. Null = gap (never drawn as 0). */
  data: Array<{ label: string } & Record<string, string | number | null | [number, number]>>;
  series: TrendSeries[];
  format: ValueFormat;
  currency?: string;
  height?: number;
  summary: string;
  /** Optional shaded interval: field holding [lower, upper] per row. */
  bandKey?: string;
  bandLabel?: string;
  /** Vertical markers at given x labels (e.g. known events). */
  markers?: { label: string; text: string }[];
  /** Start the y axis at zero (default true for magnitudes; set false for ratios with a narrow range). */
  zeroBased?: boolean;
}

/** Line chart for change over time. One y-axis only. */
export function TrendChart({ data, series, format, currency = "EUR", height = 240, summary, bandKey, bandLabel, markers, zeroBased = true }: TrendChartProps) {
  const table = {
    columns: ["Period", ...series.map((s) => s.label)],
    rows: data.map((d) => [d.label, ...series.map((s) => formatValue(typeof d[s.key] === "number" ? (d[s.key] as number) : null, format, currency))]),
  };
  return (
    <ChartFrame summary={summary} table={table} height={height} legend={<Legend items={series} />}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--grid)" }} minTickGap={24} />
          <YAxis
            tick={AXIS_TICK} tickLine={false} axisLine={false} width={56}
            tickFormatter={(v: number) => formatAxis(v, format, currency)}
            domain={zeroBased ? [0, "auto"] : ["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "rgb(var(--ink-3))", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as Record<string, unknown>;
              const rows = series
                .filter((s) => typeof row[s.key] === "number")
                .map((s) => ({ label: s.label, color: s.color, value: formatValue(row[s.key] as number, format, currency) }));
              const band = bandKey ? (row[bandKey] as [number, number] | undefined) : undefined;
              if (band) rows.push({ label: bandLabel ?? "Interval", color: "var(--band)", value: `${formatValue(band[0], format, currency)} – ${formatValue(band[1], format, currency)}` });
              const marker = markers?.find((m) => m.label === label);
              return <ChartTooltip title={marker ? `${label} · ${marker.text}` : String(label)} rows={rows} />;
            }}
          />
          {bandKey && <Area dataKey={bandKey} stroke="none" fill="var(--band)" isAnimationActive={false} connectNulls={false} />}
          {markers?.map((m) => (
            <ReferenceLine key={m.label + m.text} x={m.label} stroke="rgb(var(--ink-3))" strokeDasharray="2 3" />
          ))}
          {series.map((s) => (
            <Line
              key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined} dot={false}
              activeDot={{ r: 4, stroke: "rgb(var(--surface))", strokeWidth: 2 }}
              isAnimationActive={false} connectNulls={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
