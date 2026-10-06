import { calculateGrowthRate, isNum, type Num } from "./kpi";

export interface ExperimentLiftInput {
  testBefore: Num;
  testAfter: Num;
  controlBefore?: Num;
  controlAfter?: Num;
}

export interface ExperimentLift {
  /** testAfter − testBefore */
  rawChangeAbs: number;
  /** (testAfter − testBefore) / testBefore × 100 */
  rawChangePct: number | null;
  /** Control store change over the same period (%). Null without a control. */
  controlChangePct: number | null;
  /** Test change − control change, in percentage points. */
  controlAdjustedPts: number | null;
  /** What the test store would show had it moved like the control: testBefore × (1 + control%). */
  expectedWithoutChange: number | null;
  /** testAfter − expectedWithoutChange */
  absoluteDifference: number | null;
  /** absoluteDifference / expectedWithoutChange × 100 */
  relativeDifferencePct: number | null;
}

/**
 * Before/after comparison with an optional control store
 * (a simple difference-in-differences on percentage change).
 *
 * This is descriptive arithmetic. It is NOT a significance test and does not
 * establish causation: one test store and one control store cannot separate the
 * effect of the change from store-specific noise.
 */
export function calculateExperimentLift(i: ExperimentLiftInput): ExperimentLift | null {
  if (!isNum(i.testBefore) || !isNum(i.testAfter)) return null;
  const rawChangeAbs = i.testAfter - i.testBefore;
  const rawChangePct = calculateGrowthRate(i.testAfter, i.testBefore);
  const controlChangePct = calculateGrowthRate(i.controlAfter, i.controlBefore);
  let controlAdjustedPts: number | null = null;
  let expectedWithoutChange: number | null = null;
  let absoluteDifference: number | null = null;
  let relativeDifferencePct: number | null = null;
  if (controlChangePct !== null) {
    if (rawChangePct !== null) controlAdjustedPts = rawChangePct - controlChangePct;
    expectedWithoutChange = i.testBefore * (1 + controlChangePct / 100);
    absoluteDifference = i.testAfter - expectedWithoutChange;
    relativeDifferencePct = calculateGrowthRate(i.testAfter, expectedWithoutChange);
  }
  return {
    rawChangeAbs,
    rawChangePct,
    controlChangePct,
    controlAdjustedPts,
    expectedWithoutChange,
    absoluteDifference,
    relativeDifferencePct,
  };
}

export const EXPERIMENT_LIMITATIONS = [
  "A single test store and a single control store cannot rule out store-specific events (weather, local works, staffing).",
  "No statistical significance test is applied; the difference may be within normal month-to-month variation.",
  "The control store is assumed to follow the same trend as the test store would have without the change. This is an assumption, not a measured fact.",
  "Seasonality can distort before/after comparisons when the two periods fall in different seasons.",
] as const;
