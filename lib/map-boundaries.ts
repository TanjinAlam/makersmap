import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

export type Boundary = Feature<Polygon | MultiPolygon, { name: string; code?: string; kind?: string }>;

function insideRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [x2, y2] = ring[j];
    if ((y > point[1]) !== (y2 > point[1]) && point[0] < (x2 - x) * (point[1] - y) / (y2 - y) + x) inside = !inside;
  }
  return inside;
}

export function containsPoint(feature: Boundary, lng: number, lat: number): boolean {
  const point = [((lng + 180) % 360 + 360) % 360 - 180, lat];
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some(([outer, ...holes]) => insideRing(point, outer) && !holes.some((ring) => insideRing(point, ring)));
}

export type BoundaryCandidate = { id: number; tags?: Record<string, string> };

export function chooseCity(candidates: BoundaryCandidate[]): BoundaryCandidate | undefined {
  const score = ({ tags = {} }: BoundaryCandidate) => {
    if (/^(city|town|municipality)$/.test(tags.place || tags.border_type || "")) return 0;
    // Prefer the municipal boundary over counties, states, and city districts.
    return ({ "8": 1, "7": 2, "6": 3 } as Record<string, number>)[tags.admin_level] ?? 99;
  };
  return candidates.filter((candidate) => score(candidate) < 99).sort((a, b) => score(a) - score(b))[0];
}
