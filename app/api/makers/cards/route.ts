import { isMongoConfigured, withDb } from "@/db";
import { MAKERS_COLLECTION, toMaker } from "@/db/makers";
import type { Maker } from "@/app/profile";
import { cardView, publicCache } from "@/lib/tiers";

type MakerRecord = Maker & { _id?: unknown };

// Card details for the people currently on screen: at most 60 ids per call.
export async function GET(request: Request) {
  if (!isMongoConfigured()) return Response.json({ makers: [] }, { status: 503 });
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(",").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
  if (!ids.length) return Response.json({ makers: [] });
  const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ id: { $in: ids }, hidden: { $ne: true } }).toArray());
  return Response.json({ makers: docs.map((d) => cardView(toMaker(d))) }, { headers: publicCache });
}
