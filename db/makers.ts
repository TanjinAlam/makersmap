import type { Db } from "mongodb";
import { normalizeMaker, type Maker } from "@/app/profile";
import { escapeRegex, handleError, normalizeHandle } from "@/app/handle";
import { withDb } from "./index";

export const MAKERS_COLLECTION = "makers";

type MakerRecord = Maker & { _id?: unknown };

function collection(db: Db) {
  return db.collection<MakerRecord>(MAKERS_COLLECTION);
}

export function toMaker(doc: MakerRecord): Maker {
  const { _id: _unused, ...maker } = doc;
  return normalizeMaker(maker);
}

// Ids come from an atomic counter, so concurrent imports never hand out the
// same number. The counter starts at the current maximum the first time.
async function nextIdIn(db: Db): Promise<number> {
  const counters = db.collection<{ _id: string; seq: number }>("counters");
  const existing = await counters.findOne({ _id: "makers" });
  if (!existing) {
    const latest = await collection(db).find().sort({ id: -1 }).limit(1).next();
    await counters.updateOne({ _id: "makers" }, { $setOnInsert: { seq: latest?.id ?? 0 } }, { upsert: true });
  }
  const result = await counters.findOneAndUpdate({ _id: "makers" }, { $inc: { seq: 1 } }, { returnDocument: "after" });
  return result?.seq ?? ((await collection(db).find().sort({ id: -1 }).limit(1).next())?.id ?? 0) + 1;
}

/** Visible makers matching a filter, with an optional projection. Use this instead of loading everything. */
export async function listPublicWhere(filter: Record<string, unknown>, projection?: Record<string, 0 | 1>): Promise<Maker[]> {
  return withDb(async (db) => {
    const cursor = collection(db).find({ hidden: { $ne: true }, ...filter }).sort({ id: 1 });
    const docs = await (projection ? cursor.project<MakerRecord>(projection) : cursor).toArray();
    return docs.map((d) => toMaker(d as MakerRecord));
  });
}

export async function countPublicWhere(filter: Record<string, unknown>): Promise<number> {
  return withDb((db) => collection(db).countDocuments({ hidden: { $ne: true }, ...filter }));
}

export async function listMakers(): Promise<Maker[]> {
  return withDb(async (db) => {
    const docs = await collection(db).find().sort({ id: 1 }).toArray();
    return docs.map(toMaker);
  });
}

export async function getMakerById(id: number): Promise<Maker | null> {
  return withDb(async (db) => {
    const doc = await collection(db).findOne({ id });
    return doc ? toMaker(doc) : null;
  });
}

export async function createMaker(input: Maker): Promise<Maker> {
  return withDb(async (db) => {
    const existing = await collection(db).findOne({ id: input.id });
    if (existing) {
      throw new Error(`A maker with id ${input.id} already exists.`);
    }
    await collection(db).insertOne({ ...input });
    return input;
  });
}

export async function findMakerByHandle(handle: string): Promise<Maker | null> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return null;

  return withDb(async (db) => {
    const doc = await collection(db).findOne({
      handle: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
    });
    return doc ? toMaker(doc) : null;
  });
}

// The edit form never sends the X listing or claim bookkeeping, so an edit
// must carry them over from the stored record instead of wiping them.
function keepListing(existing: MakerRecord, incoming: Maker): Partial<Maker> {
  return {
    x: incoming.x ?? existing.x,
    claimedBy: incoming.claimedBy ?? existing.claimedBy,
    invitedBy: incoming.invitedBy ?? existing.invitedBy,
    joinedAt: incoming.joinedAt ?? existing.joinedAt,
    email: incoming.email ?? existing.email,
    emailUpdates: incoming.emailUpdates ?? existing.emailUpdates,
    editKey: existing.editKey ?? incoming.editKey,
  };
}

export async function upsertClaimedMaker(input: Maker, previousId?: number): Promise<Maker> {
  const handle = normalizeHandle(input.handle);
  const formatError = handleError(handle);
  if (formatError) throw new Error(formatError);

  const claimed = normalizeMaker({
    ...input,
    handle,
    claimed: true,
    source: "self",
  });

  return withDb(async (db) => {
    const makers = collection(db);
    const existingByHandle = await makers.findOne({
      handle: { $regex: `^${escapeRegex(handle)}$`, $options: "i" },
    });
    const existingById =
      previousId && previousId !== 100 ? await makers.findOne({ id: previousId }) : null;

    if (existingByHandle && existingById && existingByHandle.id !== existingById.id) {
      throw new Error(`@${handle} is already taken.`);
    }

    if (existingByHandle && !existingById) {
      if (previousId === existingByHandle.id || (!existingByHandle.claimed && existingByHandle.source === "self")) {
        const next = normalizeMaker({ ...claimed, ...keepListing(existingByHandle, claimed), id: existingByHandle.id, claimed: true, source: "self" });
        await makers.updateOne({ id: existingByHandle.id }, { $set: { ...next } });
        return next;
      }
      throw new Error(`@${handle} is already taken.`);
    }

    if (existingById) {
      const next = normalizeMaker({ ...claimed, ...keepListing(existingById, claimed), id: existingById.id, claimed: true, source: "self" });
      await makers.updateOne({ id: existingById.id }, { $set: { ...next } });
      return next;
    }

    const next = normalizeMaker({ ...claimed, id: await nextIdIn(db), claimed: true, source: "self" });
    await makers.insertOne({ ...next });
    return next;
  });
}

export async function upsertListedMaker(input: Maker): Promise<{ maker: Maker; created: boolean }> {
  const handle = normalizeHandle(input.handle);
  if (!handle) throw new Error("A listed maker needs an X handle.");
  input.handle = handle;

  return withDb(async (db) => {
    const existing = await collection(db).findOne({ handle });
    if (existing) {
      return { maker: toMaker(existing), created: false };
    }
    try {
      await collection(db).insertOne({ ...input });
    } catch (error) {
      // Two pins for the same person can be built in parallel; the unique index on handle
      // lets only one insert win, so the loser reads the row that got there first.
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await collection(db).findOne({ handle });
      if (raced) return { maker: toMaker(raced), created: false };
      throw error;
    }
    return { maker: input, created: true };
  });
}

export async function nextMakerId(): Promise<number> {
  return withDb(nextIdIn);
}

export async function seedMakers(seed: Maker[]): Promise<{ inserted: number; skipped: boolean }> {
  return withDb(async (db) => {
    const count = await collection(db).countDocuments();
    if (count > 0) {
      return { inserted: 0, skipped: true };
    }
    if (seed.length > 0) {
      await collection(db).insertMany(seed.map((maker) => ({ ...maker })));
    }
    return { inserted: seed.length, skipped: false };
  });
}
