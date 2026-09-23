import { z } from "zod";
import { isMongoConfigured, withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import { normalizeMaker, type Maker } from "@/app/profile";
import { MAKERS_COLLECTION, toMaker } from "@/db/makers";
import { readSession } from "@/lib/session";

type MakerRecord = Maker & { _id?: unknown };

// Claims a listed pin. The signed-in X account must be the same account the
// pin was listed from; a claim link's token alone is never enough, because
// tokens travel in public replies.
export async function POST(request: Request) {
  if (!isMongoConfigured()) return Response.json({ error: "MongoDB is not configured." }, { status: 503 });
  const session = await readSession(request);
  if (!session) return Response.json({ error: "Sign in with X first." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { handle?: string; email?: unknown };
  const handle = normalizeHandle(body.handle || session.username);
  const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ $or: [{ "x.userId": session.xUserId }, { handle }] }));
  if (!record) return Response.json({ error: "No listed pin for that handle. Add yourself from the atlas instead." }, { status: 404 });
  if (record.claimed && record.claimedBy && record.claimedBy !== session.xUserId) {
    return Response.json({ error: "This pin was already claimed by a different X account." }, { status: 409 });
  }
  const sameAccount = record.x?.userId === session.xUserId || normalizeHandle(record.x?.username || record.handle || "") === normalizeHandle(session.username);
  if (!sameAccount) return Response.json({ error: `You're signed in as @${session.username}, but this pin belongs to @${record.x?.username || record.handle}.` }, { status: 403 });

  const typed = z.string().trim().email().max(120).safeParse(body.email);
  const claimed = normalizeMaker({
    ...toMaker(record),
    email: session.email || (typed.success ? typed.data : undefined) || record.email,
    name: record.name || session.name,
    claimed: true,
    claimedBy: session.xUserId,
    source: "self",
    hidden: false,
    x: record.x ? { ...record.x, avatarUrl: session.avatarUrl || record.x.avatarUrl } : undefined,
  });
  await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: record.id }, { $set: { ...claimed, claimToken: undefined } }));
  return Response.json({ maker: claimed });
}
