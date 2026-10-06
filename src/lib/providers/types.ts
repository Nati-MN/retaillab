/**
 * Provider interfaces. The rest of the app depends only on these — never on a
 * concrete vendor. Add a provider by implementing an interface and registering
 * it in ./registry.ts.
 *
 * Rules every provider must follow:
 * - Every returned fact carries a SourceRef (title, URL, publisher, access date).
 * - If nothing reliable is found, return an empty result / null. Never invent.
 * - `info.isDemo = true` means the data is fictional; the UI labels it as such.
 * - Providers receive only what they need (coordinates, radius, a public
 *   query string). They never receive financial data.
 */

export interface ProviderInfo {
  id: string;
  label: string;
  isDemo: boolean;
  /** Short note shown in Settings → Integrations. */
  note?: string;
}

export type Reliability = "OFFICIAL" | "COMMUNITY" | "COMMERCIAL" | "UNKNOWN" | "DEMO";

export interface SourceRef {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: Date | null;
  accessedAt: Date;
  excerpt: string;
  reliability: Reliability;
}

export type SignalTypeKey =
  | "PUBLIC_TRANSPORT" | "PARKING" | "SCHOOL" | "UNIVERSITY" | "OFFICE" | "RESIDENTIAL"
  | "SHOPPING_CENTER" | "POINT_OF_INTEREST" | "POPULATION" | "DEVELOPMENT" | "ROAD_ACCESS";

export interface NearbyQuery {
  latitude: number;
  longitude: number;
  radiusM: number;
  /** Opaque reference the demo provider uses to pick its fictional dataset. Real providers ignore it. */
  demoRef?: string;
}

export interface Place {
  kind: "competitor" | "signal";
  name: string;
  /** Competitor category ("Supermarket", "Discount Store", …) or a SignalTypeKey. */
  category: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  detail?: string;
  openingHours?: string;
  rating?: number;
  reviewCount?: number;
  source: SourceRef;
}

export interface PlacesProvider {
  info: ProviderInfo;
  findNearby(q: NearbyQuery): Promise<Place[]>;
}

export interface PopulationFigure {
  population: number;
  areaLabel: string;
  referenceYear: number;
  source: SourceRef;
}

export interface DemographicsProvider {
  info: ProviderInfo;
  /** Returns null when no reliable figure exists for the area. */
  getPopulation(q: NearbyQuery): Promise<PopulationFigure | null>;
}

export interface SearchHit {
  title: string;
  url: string;
  publisher: string;
  snippet: string;
  publishedAt?: Date | null;
}

export interface SearchProvider {
  info: ProviderInfo;
  search(query: string, opts?: { limit?: number; country?: string }): Promise<SearchHit[]>;
}

export interface MapsProvider {
  info: ProviderInfo;
  /** Raster tile URL template with {z}/{x}/{y}. */
  tileUrl: string;
  attribution: string;
  maxZoom: number;
}

// ── AI ───────────────────────────────────────────────────────────────────────

export interface AIToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface AIToolCall {
  name: string;
  input: unknown;
}

export interface AIMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface AIPlanResult {
  /** Tools the model wants to run next. Empty = ready to answer. */
  toolCalls: AIToolCall[];
  /** Final wording when no more tools are needed. */
  text?: string;
}

/**
 * An LLM is only ever asked to (a) choose tools and (b) phrase an answer
 * from tool results. Arithmetic is done by tools backed by src/lib/calc.
 */
export interface AIProvider {
  info: ProviderInfo;
  plan(messages: AIMessage[], tools: AIToolSpec[]): Promise<AIPlanResult>;
}

/** Austrian public sources the research layer is designed to integrate. Not connected in this build. */
export const AUSTRIAN_SOURCE_CATALOG = [
  { id: "statistik-austria", name: "Statistics Austria (STATcube / Open Data)", kind: "Demographics", url: "https://www.statistik.at/", provider: "DemographicsProvider" },
  { id: "data-gv-at", name: "data.gv.at — Open Data Österreich", kind: "Municipal & federal open data", url: "https://www.data.gv.at/", provider: "DemographicsProvider / SearchProvider" },
  { id: "osm", name: "OpenStreetMap (Overpass API)", kind: "Places, transport, amenities", url: "https://www.openstreetmap.org/", provider: "PlacesProvider" },
  { id: "transport", name: "Transport operators (ÖBB, Wiener Linien, regional Verkehrsverbünde) — GTFS feeds", kind: "Public transport", url: "https://www.data.gv.at/", provider: "PlacesProvider" },
  { id: "land-portals", name: "State GIS portals (e.g. Wien, Steiermark, Tirol)", kind: "Zoning, development projects", url: "https://www.data.gv.at/", provider: "SearchProvider" },
] as const;
