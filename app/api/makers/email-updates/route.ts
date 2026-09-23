import { z } from "zod";
import { withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import type { Maker } from "@/app/profile";
import { MAKERS_COLLECTION } from "@/db/makers";
import { readSession } from "@/lib/session";

type MakerRecord = Maker & { _id?: unknown };
const input = z.object({ handle: z.string().trim().min(1).max(40), enabled: z.boolean(), email: z.string().trim().email().max(120).optional() });

// The owner's weekly-email setting. Signed in with X, or the claimed owner by handle.
export async function POST(request: Request) {
  const session = await readSession(request);
  if (!session) return Response.json({ error: "Sign in with X to change this." }, { status: 401 });
  try {
    const { handle, enabled, email } = input.parse(await request.json());
    const slug = normalizeHandle(handle);
    const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ handle: slug }));
    if (!record) return Response.json({ error: "No such pin." }, { status: 404 });
    const owner = record.claimedBy === session.xUserId || record.x?.userId === session.xUserId || normalizeHandle(record.x?.username || "") === normalizeHandle(session.username);
    if (!owner) return Response.json({ error: "Only the owner can change this." }, { status: 403 });
    const set: Record<string, unknown> = { emailUpdates: enabled };
    if (email) set.email = email.toLowerCase();
    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: record.id }, { $set: set }));
    return Response.json({ enabled, hasEmail: Boolean(email || record.email) });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
