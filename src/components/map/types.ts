import type { GrowthClass } from "@/lib/analytics/mapMarkers";
import type { SourceDTO } from "@/server/queries";

export interface MapStore {
  id: string;
  name: string;
  city: string;
  isDemo: boolean;
  latitude: number | null;
  longitude: number | null;
  color: string;
  /** Marker diameter in px (area ∝ latest monthly revenue). */
  diameter: number;
  growthClass: GrowthClass;
  /** All values already formatted on the server; null = cannot be calculated. */
  revenue: string | null;
  growth: string | null;
  customersPerDay: string | null;
  averageBasket: string | null;
  revenuePerSqm: string | null;
  compareHref: string;
}

export type MapLayerKey =
  | "COMPETITOR" | "PUBLIC_TRANSPORT" | "PARKING" | "SCHOOL" | "UNIVERSITY" | "OFFICE"
  | "SHOPPING_CENTER" | "RESIDENTIAL" | "POINT_OF_INTEREST" | "DEVELOPMENT";

export const MAP_LAYERS: readonly { key: MapLayerKey; label: string; code: string }[] = [
  { key: "COMPETITOR", label: "Competitors", code: "C" },
  { key: "PUBLIC_TRANSPORT", label: "Public transport", code: "T" },
  { key: "PARKING", label: "Parking", code: "P" },
  { key: "SCHOOL", label: "Schools", code: "S" },
  { key: "UNIVERSITY", label: "Universities", code: "U" },
  { key: "OFFICE", label: "Offices", code: "O" },
  { key: "SHOPPING_CENTER", label: "Shopping centers", code: "M" },
  { key: "RESIDENTIAL", label: "Residential areas", code: "R" },
  { key: "POINT_OF_INTEREST", label: "Points of interest", code: "I" },
  { key: "DEVELOPMENT", label: "Developments", code: "D" },
];

export interface MapPlace {
  id: string;
  layer: MapLayerKey;
  storeId: string;
  name: string;
  /** Competitor category or a human label of the signal type. */
  category: string;
  detail: string | null;
  openingHours: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: string | null;
  isDemo: boolean;
  source: SourceDTO;
}
