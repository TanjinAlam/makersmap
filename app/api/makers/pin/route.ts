import { z } from "zod";
import { isMongoConfigured, withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import type { Maker } from "@/app/profile";
import { MAKERS_COLLECTION } from "@/db/makers";
import { readSession } from "@/lib/session";

type MakerRecord = Maker & { _id?: unknown };
const input = z.object({ handle: z.string().trim().min(1).max(40), pinned: z.boolean() });

// Pins or unpins the intro post on a profile. Only the X account the pin was
// listed from (or that claimed it) may change this; nobody else can hide
// someone's post, and the post itself is never deleted from the record.
export async function POST(request: Request) {
  if (!isMongoConfigured()) return Response.json({ error: "MongoDB is not configured." }, { status: 503 });
  const session = await readSession(request);
  if (!session) return Response.json({ error: "Sign in with X to change your pinned post." }, { status: 401 });
  try {
    const { handle, pinned } = input.parse(await request.json());
    const slug = normalizeHandle(handle);
    const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ handle: slug }));
    if (!record?.x?.postText) return Response.json({ error: "No intro post on this profile." }, { status: 404 });
    const owner = record.claimedBy === session.xUserId || record.x.userId === session.xUserId || normalizeHandle(record.x.username) === normalizeHandle(session.username);
    if (!owner) return Response.json({ error: "Only the owner can change the pinned post." }, { status: 403 });
    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: record.id }, { $set: { "x.pinned": pinned } }));
    return Response.json({ pinned });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
