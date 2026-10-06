import { demoPlacesProvider } from "./demo";
import { createOverpassProvider } from "./overpass";
import type { AIProvider, DemographicsProvider, MapsProvider, PlacesProvider, ProviderInfo, SearchProvider } from "./types";

/**
 * Single place where concrete providers are chosen. Server-side only: reads
 * secrets/config from process.env and must never be imported by a client component.
 */

export function getPlacesProvider(org: { isDemo: boolean }): PlacesProvider | null {
  if (process.env.PLACES_PROVIDER === "overpass") {
    return createOverpassProvider({
      endpoint: process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter",
      userAgent: process.env.OSM_USER_AGENT ?? "RetailLab/0.1",
    });
  }
  // The demo provider only knows the fictional demo stores; real organizations get "not connected".
  return org.isDemo ? demoPlacesProvider : null;
}

/** No demographics source is connected in this build. Implement DemographicsProvider (e.g. Statistics Austria) and return it here. */
export function getDemographicsProvider(): DemographicsProvider | null {
  return null;
}

/** No web search API is connected in this build. Implement SearchProvider and return it here. */
export function getSearchProvider(): SearchProvider | null {
  return null;
}

/** No LLM is connected in this build; the analyst and strategy engine run on deterministic rules. */
export function getAIProvider(): AIProvider | null {
  return null;
}

export function getMapsProvider(): MapsProvider {
  return {
    info: { id: "osm-raster", label: "OpenStreetMap raster tiles", isDemo: false },
    tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  };
}

export interface IntegrationStatus {
  capability: string;
  connected: boolean;
  provider: ProviderInfo | null;
  howToConnect: string;
}

export function getIntegrationStatus(org: { isDemo: boolean }): IntegrationStatus[] {
  const places = getPlacesProvider(org);
  return [
    { capability: "Places & competitors", connected: !!places, provider: places?.info ?? null, howToConnect: "Set PLACES_PROVIDER=overpass for OpenStreetMap, or implement PlacesProvider for another source." },
    { capability: "Demographics", connected: false, provider: null, howToConnect: "Implement DemographicsProvider (e.g. Statistics Austria open data) in src/lib/providers." },
    { capability: "Web search", connected: false, provider: null, howToConnect: "Implement SearchProvider with a licensed search API in src/lib/providers." },
    { capability: "Language model", connected: false, provider: null, howToConnect: "Implement AIProvider in src/lib/providers. Until then the analyst uses deterministic rules." },
    { capability: "Map tiles", connected: true, provider: getMapsProvider().info, howToConnect: "Override with NEXT_PUBLIC_MAP_TILE_URL." },
  ];
}
