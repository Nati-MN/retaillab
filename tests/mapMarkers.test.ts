import { describe, expect, it } from "vitest";
import { classifyGrowth, markerDiameter } from "@/lib/analytics/mapMarkers";

describe("map markers", () => {
  it("classifies growth with ±3% thresholds", () => {
    expect(classifyGrowth(3)).toBe("growing");
    expect(classifyGrowth(2.99)).toBe("stable");
    expect(classifyGrowth(-2.99)).toBe("stable");
    expect(classifyGrowth(-3)).toBe("declining");
    expect(classifyGrowth(null)).toBe("unknown");
  });
  it("scales marker area with revenue and never goes below the minimum", () => {
    expect(markerDiameter(400, 400)).toBe(44);
    expect(markerDiameter(100, 400)).toBe(22);
    expect(markerDiameter(1, 400)).toBe(18);
    expect(markerDiameter(null, 400)).toBe(18);
  });
});
