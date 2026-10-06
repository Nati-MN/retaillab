/** Great-circle distance in metres (haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Point `meters` away from (lat, lon) at `bearingDeg` — good enough for short distances. */
export function offsetPoint(lat: number, lon: number, meters: number, bearingDeg: number): { lat: number; lon: number } {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(b)) / 111_320;
  const dLon = (meters * Math.sin(b)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

export const RADII_M = [500, 1000, 3000, 5000] as const;
