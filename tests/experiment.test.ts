import { describe, expect, it } from "vitest";
import { calculateExperimentLift } from "@/lib/calc";

describe("experiment comparison (spec §18)", () => {
  // Control moved +2.1%: 10,000 → 10,210
  const r = calculateExperimentLift({ testBefore: 12_400, testAfter: 13_950, controlBefore: 10_000, controlAfter: 10_210 })!;
  it("raw change", () => {
    expect(r.rawChangeAbs).toBe(1_550);
    expect(r.rawChangePct).toBeCloseTo(12.5, 8);
  });
  it("control change", () => expect(r.controlChangePct).toBeCloseTo(2.1, 8));
  it("control-adjusted change = 12.5 − 2.1 = 10.4 pts", () => expect(r.controlAdjustedPts).toBeCloseTo(10.4, 8));
  it("expected without change = 12,400 × 1.021", () => expect(r.expectedWithoutChange).toBeCloseTo(12_660.4, 6));
  it("absolute and relative difference vs expectation", () => {
    expect(r.absoluteDifference).toBeCloseTo(1_289.6, 6);
    expect(r.relativeDifferencePct).toBeCloseTo(10.186, 2);
  });
  it("without a control only raw change is reported", () => {
    const n = calculateExperimentLift({ testBefore: 100, testAfter: 90 })!;
    expect(n.rawChangePct).toBeCloseTo(-10, 8);
    expect(n.controlChangePct).toBeNull();
    expect(n.controlAdjustedPts).toBeNull();
    expect(n.absoluteDifference).toBeNull();
  });
  it("a falling test store can still beat a falling control", () => {
    const n = calculateExperimentLift({ testBefore: 100, testAfter: 95, controlBefore: 100, controlAfter: 90 })!;
    expect(n.rawChangePct).toBeCloseTo(-5, 8);
    expect(n.controlAdjustedPts).toBeCloseTo(5, 8);
    expect(n.absoluteDifference).toBeCloseTo(5, 8);
  });
  it("missing results → null", () => {
    expect(calculateExperimentLift({ testBefore: 100, testAfter: null })).toBeNull();
  });
  it("zero baseline gives abs change but no percentage", () => {
    const n = calculateExperimentLift({ testBefore: 0, testAfter: 50 })!;
    expect(n.rawChangeAbs).toBe(50);
    expect(n.rawChangePct).toBeNull();
  });
});
