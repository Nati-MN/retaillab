import { describe, expect, it } from "vitest";
import { buildOverpassQuery, mapOverpassElements, type OverpassElement } from "@/lib/providers/overpass";
import { demoPlacesProvider } from "@/lib/providers/demo";

const q = { latitude: 48.2, longitude: 16.37, radiusM: 1000 };
const at = new Date("2026-10-01T00:00:00Z");

describe("overpass mapping", () => {
  const elements: OverpassElement[] = [
    { type: "node", id: 1, lat: 48.201, lon: 16.371, tags: { shop: "supermarket", name: "Test Markt", opening_hours: "Mo-Sa 07:00-20:00" } },
    { type: "way", id: 2, center: { lat: 48.203, lon: 16.372 }, tags: { amenity: "school", name: "Test Schule" } },
    { type: "node", id: 3, lat: 48.2005, lon: 16.3705, tags: { highway: "bus_stop" } },
    { type: "node", id: 4, lat: 48.2006, lon: 16.3706, tags: { shop: "convenience" } }, // unnamed competitor → dropped
    { type: "node", id: 5, lat: 48.5, lon: 16.9, tags: { shop: "supermarket", name: "Far away" } }, // outside radius
    { type: "node", id: 6, lat: 48.2007, lon: 16.3707, tags: { tourism: "hotel", name: "Unclassified" } },
    { type: "relation", id: 7, tags: { shop: "supermarket", name: "No coordinates" } },
  ];
  const places = mapOverpassElements(elements, q, at);

  it("keeps only classifiable, located, in-radius elements", () => {
    expect(places.map((p) => p.name)).toEqual(["Unnamed public transport", "Test Markt", "Test Schule"]);
  });
  it("classifies competitors and signals", () => {
    const m = places.find((p) => p.name === "Test Markt")!;
    expect(m.kind).toBe("competitor");
    expect(m.category).toBe("Supermarket");
    expect(m.openingHours).toBe("Mo-Sa 07:00-20:00");
    expect(m.rating).toBeUndefined();
    expect(places.find((p) => p.name === "Test Schule")!.category).toBe("SCHOOL");
  });
  it("every place carries a source with URL and access date", () => {
    for (const p of places) {
      expect(p.source.url).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
      expect(p.source.accessedAt).toBe(at);
      expect(p.source.reliability).toBe("COMMUNITY");
    }
  });
  it("distance is computed, sorted ascending", () => {
    expect(places[0]!.distanceM).toBeLessThan(places[1]!.distanceM);
    expect(places[1]!.distanceM).toBeGreaterThan(100);
    expect(places[1]!.distanceM).toBeLessThan(150);
  });
  it("query contains radius and coordinates", () => {
    expect(buildOverpassQuery(q)).toContain("(around:1000,48.2,16.37)");
  });
});

describe("demo places provider", () => {
  it("returns nothing for a location that is not a demo store", async () => {
    expect(await demoPlacesProvider.findNearby({ ...q, radiusM: 5000 })).toEqual([]);
    expect(await demoPlacesProvider.findNearby({ ...q, demoRef: "NOPE" })).toEqual([]);
  });
  it("labels every demo place with a DEMO source", async () => {
    const places = await demoPlacesProvider.findNearby({ ...q, demoRef: "W01" });
    expect(places.length).toBeGreaterThan(3);
    expect(places.every((p) => p.source.reliability === "DEMO" && p.source.url.includes(".invalid"))).toBe(true);
    expect(places.every((p) => p.distanceM <= 1000)).toBe(true);
  });
});
