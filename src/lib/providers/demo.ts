import { DEMO_PLACES, DEMO_STORES } from "@/lib/demo/dataset";
import { offsetPoint } from "@/lib/geo";
import type { NearbyQuery, Place, PlacesProvider, SourceRef } from "./types";

/**
 * Demo places provider. Serves the FICTIONAL surroundings of the AlpenMarkt
 * demo stores and nothing else: for any location that is not a demo store it
 * returns an empty list, so real stores never receive invented places.
 */
export const demoPlacesProvider: PlacesProvider = {
  info: {
    id: "demo",
    label: "Demo places (fictional)",
    isDemo: true,
    note: "Invented competitors and points of interest for the AlpenMarkt demo stores. Returns nothing for real stores.",
  },
  async findNearby(q: NearbyQuery): Promise<Place[]> {
    const store = DEMO_STORES.find((s) => s.code === q.demoRef);
    if (!store) return [];
    const accessedAt = new Date();
    return DEMO_PLACES.filter((p) => p.storeCode === store.code && p.meters <= q.radiusM).map((p) => {
      const pt = offsetPoint(store.lat, store.lon, p.meters, p.bearing);
      const municipal = p.category === "DEVELOPMENT";
      const source: SourceRef = {
        title: municipal ? `Demo municipal bulletin — ${store.city}` : `Demo places dataset — surroundings of ${store.name}`,
        url: `https://demo.retaillab.invalid/${municipal ? "municipal" : "places"}/${store.code.toLowerCase()}`,
        publisher: "RetailLab demo provider (fictional data)",
        accessedAt,
        excerpt: municipal
          ? "Invented local development notices generated for demonstration. Not a real publication."
          : "Invented points of interest and competitors generated for demonstration. Not real places.",
        reliability: "DEMO",
      };
      return {
        kind: p.kind, name: p.name, category: p.category, latitude: pt.lat, longitude: pt.lon, distanceM: p.meters,
        detail: p.detail, openingHours: p.openingHours, rating: p.rating, reviewCount: p.reviewCount, source,
      };
    });
  },
};
