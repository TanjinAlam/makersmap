import osmtogeojson from "osmtogeojson";
import { chooseCity, containsPoint, type Boundary, type BoundaryCandidate } from "@/lib/map-boundaries";

const cache: Boundary[] = [];
let busy = false;
let lastRequest = 0;

async function queryOverpass(query: string) {
  const response = await fetch(process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MakersMap/0.1 (interactive city boundary selection)" },
    body: new URLSearchParams({ data: `[out:json][timeout:15];${query}` }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Boundary service unavailable");
  const data = await response.json() as { elements: BoundaryCandidate[]; remark?: string };
  if (data.remark) throw new Error("Boundary lookup incomplete");
  return data;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat")), lng = Number(params.get("lng"));
  if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.1 || Math.abs(lng) > 180) {
    return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  const existing = cache.find((boundary) => containsPoint(boundary, lng, lat));
  if (existing) return Response.json({ boundary: existing });
  if (busy || Date.now() - lastRequest < 1500) return Response.json({ error: "Please wait a moment and try again." }, { status: 429 });
  busy = true;
  lastRequest = Date.now();
  try {
    const candidates = await queryOverpass(`is_in(${lat},${lng});area._[boundary=administrative];rel(pivot);out tags;`);
    const city = chooseCity(candidates.elements as BoundaryCandidate[]);
    if (!city) return Response.json({ error: "No city or municipal boundary is mapped here." }, { status: 404 });
    const data = await queryOverpass(`rel(${city.id});out geom;`);
    const feature = osmtogeojson(data).features.find((item) => item.id === `relation/${city.id}` && (item.geometry.type === "Polygon" || item.geometry.type === "MultiPolygon"));
    if (!feature || feature.properties?.tainted) return Response.json({ error: "The complete boundary is unavailable here." }, { status: 404 });
    const boundary = { ...feature, properties: { name: city.tags?.["name:en"] || city.tags?.name || "Municipality", kind: "city / municipality" } } as Boundary;
    if (!containsPoint(boundary, lng, lat)) return Response.json({ error: "No city boundary contains this point." }, { status: 404 });
    cache.push(boundary);
    if (cache.length > 100) cache.shift();
    return Response.json({ boundary }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "City boundaries couldn’t load. Please try again." }, { status: 502 });
  } finally {
    busy = false;
  }
}
