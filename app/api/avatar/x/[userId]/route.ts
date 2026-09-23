import { isMongoConfigured, readEnv, withDb } from "@/db";
import { MAKERS_COLLECTION } from "@/db/makers";
import type { Maker } from "@/app/profile";
import { fullSizeAvatar, lookupUser } from "@/lib/x-api";

// Serves a listed maker's X profile photo from our own origin. Hidden pins get
// nothing, and when X has rotated the image we refresh the URL once.
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^\d{1,25}$/.test(userId) || !isMongoConfigured()) return new Response(null, { status: 404 });

  const record = await withDb((db) => db.collection<Maker>(MAKERS_COLLECTION).findOne({ "x.userId": userId }));
  if (!record || record.hidden || !record.x) return new Response(null, { status: 404 });

  let url = record.x.avatarUrl;
  let upstream = url ? await fetch(url).catch(() => null) : null;
  if ((!upstream || !upstream.ok) && (readEnv("TWITTERAPI_IO_KEY") || readEnv("X_BEARER_TOKEN"))) {
    const fresh = await lookupUser({ userId, username: record.x.username }).catch(() => null);
    const refreshed = fullSizeAvatar(fresh?.profile_image_url);
    if (refreshed && refreshed !== url) {
      url = refreshed;
      await withDb((db) => db.collection<Maker>(MAKERS_COLLECTION).updateOne({ id: record.id }, { $set: { "x.avatarUrl": refreshed } }));
      upstream = await fetch(refreshed).catch(() => null);
    }
  }
  if (!upstream || !upstream.ok) return new Response(null, { status: 404 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
