import { isMongoConfigured } from "@/db";
import { listPublicInPlace } from "@/app/makers-lookup";
import { hasCity } from "@/app/profile";
import { publicCache, rowView } from "@/lib/tiers";

// One page of people in a country or city, for lists that load as you scroll.
export async function GET(request: Request) {
  if (!isMongoConfigured()) return Response.json({ rows: [], total: 0 }, { status: 503 });
  const url = new URL(request.url);
  const country = url.searchParams.get("country");
  const city = url.searchParams.get("city");
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 60));
  if (!country && !city) return Response.json({ error: "country or city is required" }, { status: 400 });
  const all = country ? await listPublicInPlace("country", country) : (await listPublicInPlace("city", city as string)).filter(hasCity);
  const sorted = all.sort((a, b) => Number(hasCity(b)) - Number(hasCity(a)) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return Response.json({ rows: sorted.slice(offset, offset + limit).map(rowView), total: sorted.length }, { headers: publicCache });
}
