import { describe, expect, it } from "vitest";
import { buildFindings, enforceSourcedFacts, parseRadius, researchStatus } from "@/lib/research/findings";
import type { Place, SourceRef } from "@/lib/providers/types";

const src = (url: string): SourceRef => ({ title: "t", url, publisher: "p", accessedAt: new Date("2026-10-01"), excerpt: "e", reliability: "COMMUNITY" });
const place = (kind: Place["kind"], category: string, name: string, distanceM: number, url = "https://example.org/places"): Place =>
  ({ kind, category, name, distanceM, latitude: 48, longitude: 16, source: src(url) });

const PLACES: Place[] = [
  place("competitor", "Supermarket", "Markt A", 420),
  place("competitor", "Discount Store", "Disko", 760),
  place("competitor", "Convenience Store", "Ecke", 260),
  place("competitor", "Supermarket", "Far Markt", 1850),
  place("signal", "OFFICE", "Office 1", 380),
  place("signal", "OFFICE", "Office 2", 640),
  place("signal", "PUBLIC_TRANSPORT", "Stop", 90),
  place("signal", "DEVELOPMENT", "180 flats under construction", 350, "https://example.org/municipal"),
];
const base = { radiusM: 1000, places: PLACES, population: null, connected: { demographics: false, search: false }, providerLabel: "Test provider" };

describe("buildFindings", () => {
  const findings = buildFindings(base);
  const of = (k: string) => findings.filter((f) => f.kind === k);

  it("counts only places inside the radius and names the nearest", () => {
    expect(of("FACT")[0]!.text).toBe("3 competing grocery outlets within 1.0\u00a0km; the nearest is Ecke (Convenience Store) at 260\u00a0m.");
    expect(of("FACT").some((f) => f.text === "2 office-related places within 1.0\u00a0km; the nearest is Office 1 at 380\u00a0m.")).toBe(true);
    expect(of("FACT").some((f) => f.text === "1 public transport stop within 1.0\u00a0km; the nearest is Stop at 90\u00a0m.")).toBe(true);
  });
  it("gives every fact a source and cites the source the fact came from", () => {
    expect(of("FACT").length).toBeGreaterThan(0);
    for (const f of of("FACT")) expect(f.sourceUrl).toBeTruthy();
    expect(of("FACT").find((f) => f.text.startsWith("Local development notice"))!.sourceUrl).toBe("https://example.org/municipal");
  });
  it("words opportunities and risks as possibilities that reference a source", () => {
    const soft = [...of("OPPORTUNITY"), ...of("RISK")];
    expect(of("OPPORTUNITY").length).toBeGreaterThan(0);
    expect(of("RISK").length).toBeGreaterThan(0);
    for (const f of soft) {
      expect(f.sourceUrl).toBeTruthy();
      expect(f.text).toMatch(/may|could|not (been )?(known|measured|available)/i);
      expect(f.text).not.toMatch(/\bwill\b|increase revenue|guarantee/i);
    }
  });
  it("lists what is unknown, including population when no demographics provider is connected", () => {
    const texts = of("UNKNOWN").map((f) => f.text);
    expect(texts).toContain("Resident population within the radius — No reliable source found. No demographics provider is connected.");
    expect(texts.some((t) => t.startsWith("Daytime working population"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Competitor revenue"))).toBe(true);
    for (const f of of("UNKNOWN")) expect(f.sourceUrl).toBeNull();
  });
  it("turns a population figure into a sourced fact and drops that unknown", () => {
    const f = buildFindings({ ...base, connected: { demographics: true, search: false }, population: { population: 12345, areaLabel: "District X", referenceYear: 2025, source: src("https://example.org/stat") } });
    expect(f.find((x) => x.text.startsWith("Resident population of District X: 12,345"))!.sourceUrl).toBe("https://example.org/stat");
    expect(f.some((x) => x.kind === "UNKNOWN" && x.text.startsWith("Resident population"))).toBe(false);
  });
  it("invents nothing when the provider returns nothing", () => {
    const f = buildFindings({ ...base, places: [] });
    expect(f.filter((x) => x.kind !== "UNKNOWN")).toEqual([]);
    expect(f[0]!.text).toContain("returned no places within 1.0\u00a0km");
  });
  it("reports an absence of competitors as a sourced statement about the provider result", () => {
    const f = buildFindings({ ...base, places: [place("signal", "SCHOOL", "School", 100)] });
    expect(f[0]).toEqual({ kind: "FACT", text: "Test provider returned no competing grocery outlets within 1.0\u00a0km.", sourceUrl: "https://example.org/places" });
  });
});

describe("research rules", () => {
  it("drops facts without a source", () => {
    expect(enforceSourcedFacts([
      { kind: "FACT" as const, text: "a", sourceUrl: null },
      { kind: "FACT" as const, text: "b", sourceUrl: "https://x" },
      { kind: "FACT" as const, text: "c", sourceId: "id" },
      { kind: "UNKNOWN" as const, text: "d", sourceUrl: null },
    ]).map((f) => f.text)).toEqual(["b", "c", "d"]);
  });
  it("is PARTIAL unless every provider category is connected", () => {
    expect(researchStatus({ demographics: false, search: false })).toBe("PARTIAL");
    expect(researchStatus({ demographics: true, search: false })).toBe("PARTIAL");
    expect(researchStatus({ demographics: true, search: true })).toBe("COMPLETED");
  });
  it("accepts only the offered radii", () => {
    expect(parseRadius("3000")).toBe(3000);
    expect(parseRadius("1234")).toBe(1000);
    expect(parseRadius(undefined, 500)).toBe(500);
  });
});
