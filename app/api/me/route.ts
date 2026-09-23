import { withDb } from "@/db";
import { MAKERS_COLLECTION, toMaker } from "@/db/makers";
import { normalizeHandle } from "@/app/handle";
import { publicMaker, type Maker } from "@/app/profile";
import { readSession } from "@/lib/session";

type MakerRecord = Maker & { _id?: unknown };

// The signed-in person's own pin, with their private email included, so the
// browser can keep it as "my pin" for editing. Nobody else's record is reachable here.
export async function GET(request: Request) {
  const session = await readSession(request);
  if (!session) return Response.json({ maker: null }, { status: 401 });
  const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ $or: [{ "x.userId": session.xUserId }, { handle: normalizeHandle(session.username) }] }));
  if (!record) return Response.json({ maker: null, session: { username: session.username, name: session.name, avatarUrl: session.avatarUrl, email: session.email } });
  const maker = toMaker(record);
  return Response.json({ maker: { ...publicMaker(maker), email: maker.email, emailUpdates: maker.emailUpdates }, session: { username: session.username, name: session.name } }, { headers: { "Cache-Control": "private, no-store" } });
}
