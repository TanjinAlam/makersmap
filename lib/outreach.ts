import { z } from "zod/v4";
import { withDb } from "@/db";
import { MAKERS_COLLECTION, toMaker } from "@/db/makers";
import { getSetting, setSetting } from "@/db/settings";
import { citySlug, hasCity, type Maker } from "@/app/profile";
import { topMatches } from "./matching";
import { llmSource, structured } from "./llm";
import { profileSignal } from "@/app/shelf";
import { tweetsStillExist } from "./x-api";
import { XPostError, operatorStatus, postReply } from "./x-post";

export type OutreachStatus = "queued" | "sent" | "skipped" | "claimed" | "removed";

export type OutreachItem = {
  id: number;
  handle: string;
  name: string;
  city: string;
  country: string;
  role: string;
  postUrl: string;
  postText: string;
  postedAt: string;
  importedAt: string;
  confidence?: number;
  status: OutreachStatus;
  sentAt?: string;
  claimUrl: string;
  profileUrl: string;
  cityUrl: string;
  sameCity: number;
  topMatches: string[];
  reply: string;
};

type MakerRecord = Maker & { _id?: unknown; outreach?: { status: OutreachStatus; at: string; replyId?: string; text?: string; error?: string } };

// Operator settings for automated replies. Off by default: nothing is posted
// until the operator connects an account and turns it on.
export type OutreachSettings = { auto: boolean; dailyCap: number; maxAgeDays: number };
export async function outreachSettings(): Promise<OutreachSettings> {
  return { auto: false, dailyCap: 30, maxAgeDays: 21, ...((await getSetting<Partial<OutreachSettings>>("outreach")) || {}) };
}
export async function saveOutreachSettings(patch: Partial<OutreachSettings>): Promise<OutreachSettings> {
  const next = { ...(await outreachSettings()), ...patch };
  next.dailyCap = Math.max(0, Math.min(200, Math.round(next.dailyCap)));
  next.maxAgeDays = Math.max(1, Math.min(90, Math.round(next.maxAgeDays)));
  await setSetting("outreach", next);
  return next;
}

function statusOf(record: MakerRecord): OutreachStatus {
  if (record.claimed) return "claimed";
  if (record.hidden) return "removed";
  return record.outreach?.status ?? "queued";
}

// The reply is a starting point for a human to personalise, never sent automatically.
function suggestReply(maker: Maker, sameCity: number, matches: Maker[], claimUrl: string): string {
  const first = maker.name.split(" ")[0];
  const names = matches.slice(0, 2).map((m) => m.name.split(" ")[0]).join(" and ");
  const where = sameCity > 0
    ? `there ${sameCity === 1 ? "is" : "are"} ${sameCity} other ${sameCity === 1 ? "maker" : "makers"} in ${maker.city} on the map${names ? `, including ${names}` : ""}`
    : `there are makers in ${maker.country || "your part of the world"} on the map${names ? `, like ${names}` : ""}`;
  return `Hey ${first}, saw your intro. I pinned you on MakersMap, a city map of makers: ${where}. Your pin is yours to claim: ${claimUrl}. Not for you? Reply and it's gone.`;
}

const ReplySchema = z.object({ reply: z.string() });
const REPLY_SYSTEM = `You write one short, warm reply under someone's public intro post on X, from the person who runs MakersMap, a city-level map of makers, founders, designers, and developers.
Goal: tell them they're already on the map, that real people near them are there too, and that their pin is theirs to claim or remove. Sound like a person, not a campaign. Mention one concrete thing from their post. No hashtags, no emojis, no exclamation marks, no salesy words. Under 240 characters. Always include the claim link exactly as given. End with a plain "not for you? reply and it's gone" or similar.`;

async function personalReply(maker: Maker, sameCity: number, matches: Maker[], claimUrl: string, fallback: string): Promise<string> {
  if (llmSource() === "none") return fallback;
  const facts = [
    `first name: ${maker.name.split(" ")[0]}`,
    `their post: ${maker.x?.postText || ""}`,
    `where: ${hasCity(maker) ? `${maker.city}, ${maker.country}` : maker.country}`,
    sameCity > 0 ? `others in ${maker.city} on the map: ${sameCity}${matches.length ? ` (for example ${matches.slice(0, 2).map((m) => m.name.split(" ")[0]).join(" and ")})` : ""}` : `others in ${maker.country} on the map: many`,
    `claim link: ${claimUrl}`,
  ].join("\n");
  const out = await structured({ system: REPLY_SYSTEM, user: facts, schema: ReplySchema, maxTokens: 200, label: "outreach" });
  // Small models ignore "no exclamation marks" now and then; fix it rather than fall back.
  const text = out?.reply?.trim().replace(/!+/g, ".").replace(/\.{2,}/g, ".");
  if (!text || text.length > 270 || !text.includes(claimUrl)) return fallback;
  return text;
}

export async function outreachQueue(site: string, limit = 200): Promise<OutreachItem[]> {
  const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ source: { $in: ["x-intro", "self"] }, "x.postId": { $exists: true } }).sort({ "x.importedAt": -1 }).limit(limit).toArray());
  const all = (await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ hidden: { $ne: true } }).toArray())).map(toMaker);
  return docs.map((record) => {
    const maker = toMaker(record);
    const status = statusOf(record);
    const sameCity = (hasCity(maker) ? all.filter((m) => m.id !== maker.id && citySlug(m.city) === citySlug(maker.city)).length : 0);
    const matches = topMatches(maker, all, 3).map((m) => m.maker);
    const claimUrl = `${site}/claim?handle=${encodeURIComponent(maker.handle || "")}`;
    return {
      id: maker.id,
      handle: maker.handle || "",
      name: maker.name,
      city: maker.city,
      country: maker.country,
      role: maker.role,
      postUrl: maker.x?.postUrl || "",
      postText: maker.x?.postText || "",
      postedAt: maker.x?.postedAt || "",
      importedAt: maker.x?.importedAt || "",
      confidence: maker.x?.confidence,
      status,
      sentAt: record.outreach?.at,
      claimUrl,
      profileUrl: `${site}/m/${maker.handle}`,
      cityUrl: `${site}/city/${citySlug(maker.city)}`,
      sameCity,
      topMatches: matches.map((m) => `${m.name} (@${m.handle})`),
      reply: suggestReply(maker, sameCity, matches, claimUrl),
    };
  });
}

export async function setOutreachStatus(handle: string, status: "sent" | "skipped" | "queued"): Promise<boolean> {
  const result = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ handle }, { $set: { outreach: { status, at: new Date().toISOString() } } }));
  return result.matchedCount > 0;
}

const dayKey = () => new Date().toISOString().slice(0, 10);

/** How many replies went out today (UTC), for the daily cap. */
export async function sentToday(): Promise<number> {
  return withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).countDocuments({ "outreach.status": "sent", "outreach.at": { $gte: `${dayKey()}T00:00:00.000Z` }, "outreach.replyId": { $exists: true } }));
}

export type SendReport = { attempted: number; sent: number; skipped: number; failed: number; capLeft: number; notes: string[] };

/**
 * Sends the next replies from the operator account, best profiles first,
 * within today's cap. Posts that were deleted, pins that were claimed, hidden,
 * or already handled are skipped. One failure stops the run so a broken token
 * or a rate limit doesn't burn through the queue.
 */
export async function sendDueReplies(site: string, max?: number): Promise<SendReport> {
  const settings = await outreachSettings();
  const report: SendReport = { attempted: 0, sent: 0, skipped: 0, failed: 0, capLeft: 0, notes: [] };
  const operator = await operatorStatus();
  if (!operator.connected || !operator.canWrite) { report.notes.push("No X account connected for outreach."); return report; }
  const already = await sentToday();
  // A newly connected account ramps up: 10 a day at first, 5 more each day, until it reaches the cap.
  const daysConnected = operator.connectedAt ? Math.floor((Date.now() - new Date(operator.connectedAt).getTime()) / 86400000) : 30;
  const rampCap = Math.min(settings.dailyCap, 10 + daysConnected * 5);
  const budget = Math.max(0, Math.min(rampCap - already, max ?? rampCap));
  if (rampCap < settings.dailyCap) report.notes.push(`Warm-up: ${rampCap} a day for now (day ${daysConnected + 1} on this account).`);
  report.capLeft = budget;
  if (budget === 0) { report.notes.push(`Daily cap of ${settings.dailyCap} reached.`); return report; }

  const since = new Date(Date.now() - settings.maxAgeDays * 86400000).toISOString();
  const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({
    source: "x-intro", claimed: { $ne: true }, hidden: { $ne: true }, review: { $ne: "pending" },
    "x.postId": { $exists: true }, "x.importedAt": { $gte: since },
    $or: [{ outreach: { $exists: false } }, { "outreach.status": "queued" }],
  }).toArray());
  const all = (await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ hidden: { $ne: true } }).toArray())).map(toMaker);
  const ranked = docs.map(toMaker).sort((a, b) => profileSignal(b) - profileSignal(a)).slice(0, budget * 2);
  if (!ranked.length) { report.notes.push("Nothing queued."); return report; }

  // Drop anyone whose post is gone before spending a reply on them.
  const alive = await tweetsStillExist(ranked.map((m) => m.x!.postId)).catch(() => null);

  for (const maker of ranked) {
    if (report.sent >= budget) break;
    if (alive && !alive.has(maker.x!.postId)) {
      await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: maker.id }, { $set: { hidden: true, outreach: { status: "removed", at: new Date().toISOString() } } }));
      report.skipped += 1;
      continue;
    }
    const sameCity = (hasCity(maker) ? all.filter((m) => m.id !== maker.id && citySlug(m.city) === citySlug(maker.city)).length : 0);
    const matches = topMatches(maker, all, 3).map((m) => m.maker);
    const claimUrl = `${site}/claim?handle=${encodeURIComponent(maker.handle || "")}`;
    const text = await personalReply(maker, sameCity, matches, claimUrl, suggestReply(maker, sameCity, matches, claimUrl));
    report.attempted += 1;
    try {
      const replyId = await postReply(text, maker.x!.postId);
      await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: maker.id }, { $set: { outreach: { status: "sent", at: new Date().toISOString(), replyId, text } } }));
      report.sent += 1;
    } catch (error) {
      report.failed += 1;
      const message = error instanceof Error ? error.message : "failed";
      await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: maker.id }, { $set: { "outreach.error": message, "outreach.status": "queued", "outreach.at": new Date().toISOString() } }));
      report.notes.push(`@${maker.handle}: ${message}`);
      // A rate limit, an expired token, or a missing write scope: stop here rather than fail down the list.
      if (error instanceof XPostError && [401, 403, 429].includes(error.status)) break;
    }
  }
  return report;
}

/** One reply, right now, for a specific pin. Used by the "Send now" button. */
export async function sendOne(site: string, handle: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ handle }));
  if (!record?.x?.postId) return { ok: false, error: "No intro post for that handle." };
  if (record.claimed) return { ok: false, error: "Already claimed." };
  const maker = toMaker(record);
  const all = (await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ hidden: { $ne: true } }).toArray())).map(toMaker);
  const sameCity = (hasCity(maker) ? all.filter((m) => m.id !== maker.id && citySlug(m.city) === citySlug(maker.city)).length : 0);
  const matches = topMatches(maker, all, 3).map((m) => m.maker);
  const claimUrl = `${site}/claim?handle=${encodeURIComponent(maker.handle || "")}`;
  const text = await personalReply(maker, sameCity, matches, claimUrl, suggestReply(maker, sameCity, matches, claimUrl));
  try {
    const replyId = await postReply(text, record.x.postId);
    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: maker.id }, { $set: { outreach: { status: "sent", at: new Date().toISOString(), replyId, text } } }));
    return { ok: true, text };
  } catch (error) {
    return { ok: false, text, error: error instanceof Error ? error.message : "X refused the reply." };
  }
}

/** A preview of the personalised reply, without sending. */
export async function previewReply(site: string, handle: string): Promise<string | null> {
  const record = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ handle }));
  if (!record?.x?.postId) return null;
  const maker = toMaker(record);
  const all = (await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ hidden: { $ne: true } }).toArray())).map(toMaker);
  const sameCity = (hasCity(maker) ? all.filter((m) => m.id !== maker.id && citySlug(m.city) === citySlug(maker.city)).length : 0);
  const matches = topMatches(maker, all, 3).map((m) => m.maker);
  const claimUrl = `${site}/claim?handle=${encodeURIComponent(maker.handle || "")}`;
  return personalReply(maker, sameCity, matches, claimUrl, suggestReply(maker, sameCity, matches, claimUrl));
}
