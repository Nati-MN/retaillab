import { distanceMeters } from "@/lib/geo";
import type { NearbyQuery, Place, PlacesProvider, SignalTypeKey } from "./types";

/**
 * OpenStreetMap places via the Overpass API.
 *
 * STATUS: the response mapping (`mapOverpassElements`) is unit-tested against a
 * fixture. The live HTTP call has not been exercised in the build environment
 * (outbound access to overpass-api.de was not available there). Verify once
 * after enabling with PLACES_PROVIDER=overpass.
 *
 * Usage policy: the public Overpass instance is for light use. Send a
 * descriptive User-Agent (OSM_USER_AGENT), keep the rate limit in
 * src/server/rateLimit.ts, and host your own instance for heavy use.
 * OSM has no ratings or review counts — those fields stay empty.
 * Data © OpenStreetMap contributors, ODbL.
 */

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const COMPETITOR_SHOPS: Record<string, string> = {
  supermarket: "Supermarket",
  convenience: "Convenience Store",
  greengrocer: "Specialty Store",
  bakery: "Specialty Store",
  butcher: "Specialty Store",
  deli: "Specialty Store",
  health_food: "Specialty Store",
};

function classify(tags: Record<string, string>): { kind: "competitor"; category: string } | { kind: "signal"; category: SignalTypeKey } | null {
  if (tags.shop && COMPETITOR_SHOPS[tags.shop]) return { kind: "competitor", category: COMPETITOR_SHOPS[tags.shop]! };
  if (tags.shop === "mall") return { kind: "signal", category: "SHOPPING_CENTER" };
  if (tags.amenity === "school" || tags.amenity === "kindergarten") return { kind: "signal", category: "SCHOOL" };
  if (tags.amenity === "university" || tags.amenity === "college") return { kind: "signal", category: "UNIVERSITY" };
  if (tags.amenity === "parking") return { kind: "signal", category: "PARKING" };
  if (tags.highway === "bus_stop" || tags.railway === "station" || tags.railway === "tram_stop" || tags.railway === "halt" || tags.public_transport === "station") {
    return { kind: "signal", category: "PUBLIC_TRANSPORT" };
  }
  if (tags.office) return { kind: "signal", category: "OFFICE" };
  return null;
}

export function buildOverpassQuery(q: NearbyQuery): string {
  const a = `(around:${Math.round(q.radiusM)},${q.latitude},${q.longitude})`;
  return `[out:json][timeout:25];
(
  nwr${a}[shop~"^(supermarket|convenience|greengrocer|bakery|butcher|deli|health_food|mall)$"];
  nwr${a}[amenity~"^(school|kindergarten|university|college|parking)$"];
  node${a}[highway=bus_stop];
  node${a}[railway~"^(station|tram_stop|halt)$"];
  nwr${a}[public_transport=station];
  nwr${a}[office];
);
out center tags 500;`;
}

/** Pure mapping from Overpass elements to places. Elements without a usable name or class are dropped, not guessed. */
export function mapOverpassElements(elements: OverpassElement[], q: NearbyQuery, accessedAt: Date): Place[] {
  const out: Place[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const cls = classify(tags);
    if (lat === undefined || lon === undefined || !cls) continue;
    const name = tags.name ?? tags.brand ?? tags.operator;
    // Unnamed parking / bus stops are still facts; unnamed shops are too vague to list as competitors.
    if (!name && cls.kind === "competitor") continue;
    const distanceM = Math.round(distanceMeters(q.latitude, q.longitude, lat, lon));
    if (distanceM > q.radiusM) continue;
    const tagSummary = Object.entries(tags)
      .filter(([k]) => ["shop", "amenity", "office", "railway", "highway", "public_transport", "brand", "opening_hours", "capacity"].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    out.push({
      kind: cls.kind,
      name: name ?? `Unnamed ${cls.category.toLowerCase().replace(/_/g, " ")}`,
      category: cls.category,
      latitude: lat,
      longitude: lon,
      distanceM,
      openingHours: tags.opening_hours,
      detail: tags.capacity ? `Capacity ${tags.capacity}` : undefined,
      source: {
        title: `OpenStreetMap ${el.type} ${el.id}${name ? ` — ${name}` : ""}`,
        url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        publisher: "OpenStreetMap contributors",
        accessedAt,
        excerpt: tagSummary || "OpenStreetMap element",
        reliability: "COMMUNITY",
      },
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

export function createOverpassProvider(opts: { endpoint: string; userAgent: string }): PlacesProvider {
  return {
    info: {
      id: "overpass",
      label: "OpenStreetMap (Overpass API)",
      isDemo: false,
      note: "Community-maintained map data. No ratings or review counts. Coverage varies by area.",
    },
    async findNearby(q) {
      const res = await fetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": opts.userAgent },
        body: new URLSearchParams({ data: buildOverpassQuery(q) }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Overpass API responded with ${res.status}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return mapOverpassElements(json.elements ?? [], q, new Date());
    },
  };
}
