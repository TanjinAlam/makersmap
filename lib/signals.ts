import { withDb } from "@/db";

// Lightweight interest signals: a profile view, a save, a message click. Kept
// per day per handle so a weekly digest can say "12 people looked at your pin".
// No viewer identity is stored, only a coarse count.
export type SignalKind = "view" | "save" | "message";
type SignalDoc = { _id: string; handle: string; kind: SignalKind; day: string; count: number };

const day = () => new Date().toISOString().slice(0, 10);

export async function recordSignal(handle: string, kind: SignalKind): Promise<void> {
  const key = `${handle}:${kind}:${day()}`;
  await withDb((db) => db.collection<SignalDoc>("signals").updateOne({ _id: key }, { $set: { handle, kind, day: day() }, $inc: { count: 1 } }, { upsert: true }));
}

export async function signalsSince(handle: string, days: number): Promise<Record<SignalKind, number>> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const docs = await withDb((db) => db.collection<SignalDoc>("signals").find({ handle, day: { $gte: since } }).toArray());
  const out: Record<SignalKind, number> = { view: 0, save: 0, message: 0 };
  for (const d of docs) out[d.kind] += d.count;
  return out;
}
