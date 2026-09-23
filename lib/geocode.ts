import tzLookup from "tz-lookup";
import { cities, type City } from "@/app/profile";
import { isMongoConfigured, withDb } from "@/db";

export type PlaceLevel = "city" | "country";
export type Place = { city: string; country: string; countryCode?: string; flag: string; lat: number; lon: number; tz: string; level: PlaceLevel };

export const flagOf = (countryCode: string) =>
  countryCode.length === 2 ? String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";

// Short forms people actually type in intro posts.
const aliases: Record<string, string> = {
  sf: "San Francisco", "san fran": "San Francisco", nyc: "New York", "new york city": "New York", la: "Los Angeles",
  us: "United States", usa: "United States", "u.s.": "United States", "u.s.a.": "United States", america: "United States",
  uk: "United Kingdom", "u.k.": "United Kingdom", england: "United Kingdom", uae: "United Arab Emirates",
  bangalore: "Bengaluru", bombay: "Mumbai", "the netherlands": "Netherlands", holland: "Netherlands",
};

export function normalizePlaceName(raw: string): string {
  const cleaned = raw.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu, "").replace(/\s+/g, " ").replace(/^(the )/i, "").trim();
  const key = cleaned.toLowerCase();
  return aliases[key] || aliases[`the ${key}`] || cleaned;
}

function fromTable(city: string, country?: string): Place | undefined {
  const hit = cities.find((c: City) => c.city.toLowerCase() === city.toLowerCase() && (!country || c.country.toLowerCase() === country.toLowerCase()))
    ?? cities.find((c: City) => c.city.toLowerCase() === city.toLowerCase());
  return hit ? { city: hit.city, country: hit.country, flag: hit.flag, lat: hit.lat, lon: hit.lon, tz: hit.tz, level: "city" } : undefined;
}

type GeoRecord = { key: string; place: Place | null; at: string };

// OpenStreetMap's Nominatim: one request a second, a real User-Agent, and cache
// every answer so a place is never looked up twice. Returns a country-level
// place when the text is a country (or Nominatim can't do better than one).
async function nominatim(query: string): Promise<Place | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: { "User-Agent": "MakersMap/0.1 (city-level pins for a maker atlas)", "Accept-Language": "en" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const rows = await response.json() as { lat: string; lon: string; addresstype?: string; type?: string; address?: Record<string, string> }[];
  const row = rows[0];
  if (!row) return null;
  const address = row.address ?? {};
  const country = address.country || "";
  const countryCode = (address.country_code || "").toUpperCase();
  const lat = Number(row.lat), lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !country) return null;
  const kind = row.addresstype || row.type || "";
  const cityName = address.city || address.town || address.village || address.municipality || "";
  const level: PlaceLevel = kind === "country" || (!cityName && !address.state) ? "country" : "city";
  let tz = "UTC";
  try { tz = tzLookup(lat, lon); } catch {}
  return {
    city: level === "country" ? country : (cityName || address.state || query.split(",")[0].trim()),
    country, countryCode, flag: flagOf(countryCode), lat, lon, tz, level,
  };
}

let lastNominatimAt = 0;

async function cachedLookup(query: string): Promise<Place | null> {
  const key = query.trim().toLowerCase();
  if (isMongoConfigured()) {
    try {
      const cached = await withDb((db) => db.collection<GeoRecord>("geocache").findOne({ key }));
      // A miss is retried after a day; a timeout shouldn't blacklist a city for good.
      if (cached && (cached.place || Date.now() - new Date(cached.at).getTime() < 24 * 60 * 60 * 1000)) return cached.place;
    } catch {}
  }
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  let place: Place | null = null;
  try { place = await nominatim(query); } catch { place = null; }
  if (isMongoConfigured()) {
    try {
      await withDb((db) => db.collection<GeoRecord>("geocache").updateOne({ key }, { $set: { key, place, at: new Date().toISOString() } }, { upsert: true }));
    } catch {}
  }
  return place;
}

/** City (with optional country hint) -> place. */
export async function geocodeCity(city: string, country?: string): Promise<Place | null> {
  const name = normalizePlaceName(city);
  const local = fromTable(name, country);
  if (local) return local;
  return cachedLookup(country ? `${name}, ${normalizePlaceName(country)}` : name);
}

/** A bare country name -> country-level place (centroid). */
export async function geocodeCountry(country: string): Promise<Place | null> {
  const name = normalizePlaceName(country);
  const place = await cachedLookup(name);
  if (!place) return null;
  // Whatever Nominatim matched, a country-only intro gets a country-level pin.
  return { ...place, city: place.country, level: "country" };
}
