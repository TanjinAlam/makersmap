import { z } from "zod";
import { isMongoConfigured, withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import { MAKERS_COLLECTION } from "@/db/makers";
import type { Maker } from "@/app/profile";
import { readSession } from "@/lib/session";

const input = z.object({ handle: z.string().trim().min(3).max(32), reason: z.string().trim().max(300).optional() });

// "This is me, take it down." The caller must be signed in with the X account
// the pin was listed from; that's the only proof that stops mass delisting.
export async function POST(request: Request) {
  if (!isMongoConfigured()) return Response.json({ error: "MongoDB is not configured." }, { status: 503 });
  const session = await readSession(request);
  if (!session) return Response.json({ error: "Sign in with X to remove your pin." }, { status: 401 });
  try {
    const { handle, reason } = input.parse(await request.json());
    const slug = normalizeHandle(handle) || normalizeHandle(session.username);
    const result = await withDb(async (db) => {
      const makers = db.collection<Maker>(MAKERS_COLLECTION);
      const record = await makers.findOne({ handle: slug, source: "x-intro", claimed: { $ne: true } });
      if (!record) return null;
      const owner = record.x?.userId === session.xUserId || normalizeHandle(record.x?.username || record.handle || "") === normalizeHandle(session.username);
      if (!owner) return "forbidden";
      // Removal is honoured immediately but reviewable: it lands in the queue as "removed" so a mass
      // takedown from one caller can be spotted and undone in the admin console.
      await makers.updateOne({ id: record.id }, { $set: { hidden: true, review: "removed", removedAt: new Date().toISOString() } });
      await db.collection("removal_requests").insertOne({ handle: slug, makerId: record.id, reason: reason || "", at: new Date().toISOString() });
      return record.id;
    });
    if (result === null) return Response.json({ error: "No listed pin with that handle." }, { status: 404 });
    if (result === "forbidden") return Response.json({ error: `You're signed in as @${session.username}; only that account's pin can be removed here.` }, { status: 403 });
    return Response.json({ removed: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the pin." }, { status: 500 });
  }
}
