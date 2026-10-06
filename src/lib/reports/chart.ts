/** Geometry for the report's static (print-safe) trend chart. Pure. */

/** Smallest "nice" axis maximum (1, 2, 2.5, 5 × 10ⁿ) that is ≥ v. */
export function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (v <= step * pow * (1 + 1e-9)) return step * pow;
  }
  return 10 * pow;
}

export interface LineGeometry {
  max: number;
  ticks: number[];
  x: (i: number) => number;
  y: (v: number) => number;
  /** SVG path per series; gaps (null) break the line. */
  paths: string[];
}

export function lineGeometry(
  series: ReadonlyArray<ReadonlyArray<number | null>>,
  points: number,
  box: { width: number; height: number; left: number; right: number; top: number; bottom: number },
): LineGeometry {
  const all = series.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const max = niceCeil(all.length ? Math.max(...all) : 1);
  const w = box.width - box.left - box.right;
  const h = box.height - box.top - box.bottom;
  const x = (i: number) => box.left + (points <= 1 ? w / 2 : (i / (points - 1)) * w);
  const y = (v: number) => box.top + h - (v / max) * h;
  const paths = series.map((vals) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  return { max, ticks: [0, 0.25, 0.5, 0.75, 1].map((t) => t * max), x, y, paths };
}
