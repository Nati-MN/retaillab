"use client";

import { CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AXIS_TICK, ChartFrame, ChartTooltip } from "./ChartFrame";
import { formatAxis, formatValue, type ValueFormat } from "./format";

export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  /** Optional bubble size value. */
  size?: number;
  color?: string;
}

export interface ScatterPlotProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFormat: ValueFormat;
  yFormat: ValueFormat;
  sizeLabel?: string;
  sizeFormat?: ValueFormat;
  currency?: string;
  height?: number;
  summary: string;
  /** Quadrant dividers (e.g. medians). */
  xRef?: number;
  yRef?: number;
  /** Labels for the four quadrants: [topLeft, topRight, bottomLeft, bottomRight]. */
  quadrants?: [string, string, string, string];
}

/** Scatter / quadrant matrix. Every point is directly labelled, so colour is never the only identifier. */
export function ScatterPlot({ points, xLabel, yLabel, xFormat, yFormat, sizeLabel, sizeFormat = "money", currency = "EUR", height = 320, summary, xRef, yRef, quadrants }: ScatterPlotProps) {
  const table = {
    columns: ["", xLabel, yLabel, ...(sizeLabel ? [sizeLabel] : [])],
    rows: points.map((p) => [p.label, formatValue(p.x, xFormat, currency), formatValue(p.y, yFormat, currency), ...(sizeLabel ? [formatValue(p.size ?? null, sizeFormat, currency)] : [])]),
  };
  return (
    <ChartFrame summary={summary} table={table} height={height}>
      <div className="relative h-full">
        {quadrants && (
          <div aria-hidden className="label pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2 pb-9 pl-16 pr-3 pt-2 text-[10px]">
            <span>{quadrants[0]}</span>
            <span className="text-right">{quadrants[1]}</span>
            <span className="self-end">{quadrants[2]}</span>
            <span className="self-end text-right">{quadrants[3]}</span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 24, bottom: 18, left: 4 }}>
            <CartesianGrid stroke="var(--grid)" />
            <XAxis type="number" dataKey="x" name={xLabel} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--grid)" }} domain={["auto", "auto"]} tickFormatter={(v: number) => formatAxis(v, xFormat, currency)} label={{ value: xLabel, position: "insideBottom", offset: -10, fontSize: 11, fill: "rgb(var(--ink-2))" }} />
            <YAxis type="number" dataKey="y" name={yLabel} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => formatAxis(v, yFormat, currency)} label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "rgb(var(--ink-2))", style: { textAnchor: "middle" } }} />
            <ZAxis type="number" dataKey="size" range={sizeLabel ? [60, 420] : [70, 70]} />
            {xRef !== undefined && <ReferenceLine x={xRef} stroke="rgb(var(--ink-3))" strokeDasharray="3 3" />}
            {yRef !== undefined && <ReferenceLine y={yRef} stroke="rgb(var(--ink-3))" strokeDasharray="3 3" />}
            <Tooltip
              cursor={false}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as ScatterPoint;
                return (
                  <ChartTooltip
                    title={p.label}
                    rows={[
                      { label: xLabel, value: formatValue(p.x, xFormat, currency) },
                      { label: yLabel, value: formatValue(p.y, yFormat, currency) },
                      ...(sizeLabel && p.size !== undefined ? [{ label: sizeLabel, value: formatValue(p.size, sizeFormat, currency) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Scatter data={points} isAnimationActive={false} fill="var(--s1)" fillOpacity={0.75} stroke="rgb(var(--surface))" strokeWidth={2} shape="circle">
              {points.map((p, i) => <Cell key={i} fill={p.color ?? "var(--s1)"} />)}
              <LabelList dataKey="label" position="top" offset={8} style={{ fontSize: 11, fill: "rgb(var(--ink-2))" }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
