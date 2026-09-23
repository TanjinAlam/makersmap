import { withDb } from "./index";

// Small key/value store for operator settings and tokens (one document per key).
type SettingDoc<T> = { _id: string; value: T; updatedAt: string };

export async function getSetting<T>(key: string): Promise<T | null> {
  const doc = await withDb((db) => db.collection<SettingDoc<T>>("settings").findOne({ _id: key }));
  return doc ? doc.value : null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await withDb((db) => db.collection<SettingDoc<T>>("settings").updateOne({ _id: key }, { $set: { value, updatedAt: new Date().toISOString() } }, { upsert: true }));
}
