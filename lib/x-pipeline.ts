import { isMongoConfigured, withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import { normalizeMaker, normalizeProject, type Maker } from "@/app/profile";
import { MAKERS_COLLECTION, nextMakerId, toMaker } from "@/db/makers";
import { extractPin } from "./x-extract";
import { llmSource, mapWithConcurrency } from "./llm";
import { dedupeBySite, enrichProject, expandUrl } from "./site-reader";
import { geocodeCity, geocodeCountry, normalizePlaceName } from "./geocode";
import { buildQuery, fullSizeAvatar, postUrl, provider, searchRecent, tweetsStillExist, XApiError, type SearchPage, type XTweet, type XUser } from "./x-api";

// The default intro-post query, without provider-specific filters (those are
// added by buildQuery). Tune it in the admin console; the last query used is
// stored with the import state.
// Tuned to the intro template ("I'm 29. Solo founder from Brazil, based in
// Barcelona. Looking to connect with more marketers & indie hackers!").
// The sweep runs each of these patterns in turn (state.queryIndex), so the
// same intro post is found whichever phrasing its author picked. Duplicates
// across patterns are skipped by post id.
export const QUERIES: { label: string; query: string }[] = [
  { label: "looking to connect", query: '("looking to connect with" OR "looking to connect" OR "would love to meet" OR "would love to connect" OR "say hi if" OR "come say hi" OR "let\'s connect") ("I\'m" OR "I’m" OR "solo founder" OR "indie" OR "based in" OR "founder from" OR "designer in" OR "developer from")' },
  { label: "solo founder from", query: '("solo founder from" OR "solo founder based in" OR "indie hacker from" OR "indie hacker based in" OR "founder based in" OR "developer based in" OR "designer based in" OR "maker based in" OR "builder based in")' },
  { label: "connect with more", query: '("connect with more" OR "meet more" OR "meet other" OR "connect with other") ("founders" OR "indie hackers" OR "builders" OR "makers" OR "marketers" OR "designers" OR "developers" OR "people shipping")' },
  { label: "shipping in public", query: '("shipping in public" OR "building in public" OR "bootstrapping") ("based in" OR "from") ("connect" OR "meet" OR "say hi" OR "hi")' },
  { label: "open to connect", query: '("open to connect" OR "let\'s connect" OR "lets connect" OR "happy to connect" OR "want to connect") ("founder" OR "founders" OR "builder" OR "builders" OR "indie hacker" OR "indie hackers" OR "maker" OR "makers" OR "building")' },
  { label: "looking for a cofounder", query: '("looking for a cofounder" OR "looking for a co-founder" OR "looking for cofounder" OR "looking for a technical cofounder" OR "need a cofounder" OR "cofounder wanted")' },
  { label: "who's building in", query: '("who\'s building in" OR "who is building in" OR "any founders in" OR "any builders in" OR "any makers in" OR "founders in my city" OR "builders near me")' },
  { label: "meet founders", query: '("meet other founders" OR "meet founders" OR "meet other builders" OR "meet other makers" OR "meet indie hackers" OR "coffee with founders" OR "founder friends")' },
];

export const DEFAULT_QUERY = '("looking to connect with" OR "would love to meet" OR "would love to connect" OR "say hi if" OR "come say hi") ("I\'m" OR "I’m" OR "solo founder" OR "indie" OR "based in" OR "founder from" OR "designer in" OR "developer from")';

export type ImportState = {
  _id: "x-import";
  query: string;
  nextToken?: string;
  /** Newest post id seen; passed as since_id when starting a fresh sweep (X API). */
  sinceId?: string;
  /** Newest post time seen, unix seconds; used as since_time on a fresh sweep (twitterapi.io). */
  sinceTime?: number;
  lastRunAt?: string;
  /** Which QUERIES pattern the sweep is on. Undefined means the single custom `query`. */
  queryIndex?: number;
  /** Set when every pattern has been swept for the current window. */
  sweepDone?: boolean;
  totals: { fetched: number; listed: number; skipped: number };
  rateLimitResetAt?: number;
};

export type ImportResult = {
  fetched: number;
  listed: number;
  updated: number;
  skipped: { notIntro: number; noCity: number; lowConfidence: number; alreadyClaimed: number; duplicate: number };
  done: boolean;
  nextToken?: string;
  rateLimitResetAt?: number;
  error?: string;
  /** The pattern this page ran, e.g. "2/5 solo founder from". */
  pattern?: string;
  extractor?: "rules" | "ai";
  samples: { handle: string; city: string; role: string; confidence: number }[];
};

type MakerRecord = Maker & { _id?: unknown };

const MIN_CONFIDENCE = 0.5;

export async function getImportState(): Promise<ImportState> {
  const fallback: ImportState = { _id: "x-import", query: DEFAULT_QUERY, totals: { fetched: 0, listed: 0, skipped: 0 } };
  if (!isMongoConfigured()) return fallback;
  const state = await withDb((db) => db.collection<ImportState>("import_state").findOne({ _id: "x-import" }));
  return state ?? fallback;
}

async function saveImportState(state: ImportState): Promise<void> {
  await withDb((db) => db.collection<ImportState>("import_state").updateOne({ _id: "x-import" }, { $set: state }, { upsert: true }));
}

export function claimToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Build a listed pin from one post, its author, the extraction, and the geocode.
async function buildPin(tweet: XTweet, user: XUser, extracted: Awaited<ReturnType<typeof extractPin>>, existingId: number | undefined, queryIndex?: number): Promise<Maker | null> {
  // A named city gets a city pin; a country alone gets a country-level pin at
  // its centre. When the post names nothing, the profile's location field is
  // tried. When that fails too, the pin is kept without a place: listed and
  // searchable, off the map until the person adds a city.
  const fromField = user.location ? normalizePlaceName(user.location.split(/[,|·/]/)[0].trim()) : "";
  const place = extracted.city
    ? await geocodeCity(extracted.city, extracted.country ?? undefined)
    : extracted.country
      ? await geocodeCountry(extracted.country)
      : fromField && fromField.length >= 3
        ? await geocodeCity(fromField).catch(() => null)
        : null;
  // X hands us profile links through its shortener; store where they actually go.
  const rawSite = user.entities?.url?.urls?.[0]?.expanded_url || user.url || "";
  const website = /^https?:\/\/t\.co\//i.test(rawSite) ? (await expandUrl(rawSite).catch(() => null)) || "" : rawSite;
  // A project has to have a site we can visit. The description is written from
  // that site, not from the post, so it says what the thing actually is.
  const candidates = extracted.projects.map((p, i) => ({ ...p, website: p.website || (i === 0 ? website : "") })).filter((p) => /^https?:\/\//i.test(p.website || ""));
  const enriched = await mapWithConcurrency(candidates, 3, async (p) => {
    const site = await enrichProject(p.name, p.website as string).catch(() => null);
    return site ? normalizeProject({ name: site.name, description: site.description, tagline: site.tagline, website: site.website, logo: site.logo, image: site.image, stage: p.stage || "Building" }) : null;
  });
  const projects = dedupeBySite(enriched.filter((p): p is NonNullable<typeof p> => Boolean(p)));
  return normalizeMaker({
    id: existingId ?? (await nextMakerId()),
    name: user.name?.trim() || `@${user.username}`,
    handle: normalizeHandle(user.username),
    city: place?.city || "",
    country: place?.country || "",
    flag: place?.flag || "",
    lat: place?.lat ?? 0,
    lon: place?.lon ?? 0,
    timezone: place?.tz,
    role: extracted.role,
    tags: extracted.interests,
    projects,
    project: projects[0]?.name || "",
    description: projects[0]?.description || "",
    website,
    bio: (user.description || "").trim(),
    lookingFor: extracted.lookingFor,
    canHelpWith: extracted.canHelpWith,
    skills: extracted.skills,
    links: [{ kind: "X", url: `https://x.com/${user.username}` }, ...(website ? [{ kind: "Website" as const, url: website }] : [])],
    avatar: `/api/avatar/x/${user.id}`,
    latestUpdate: { text: tweet.text.slice(0, 400), url: postUrl(user.username, tweet.id) },
    // Everyone here posted to connect. Coffee when they said so; otherwise open to a chat.
    openToMeeting: extracted.lookingFor.includes("Coffee") ? ["Coffee", "Remote chats"] : extracted.lookingFor.length ? ["Remote chats"] : [],
    coffee: extracted.lookingFor.includes("Coffee"),
    joinedAt: new Date().toISOString().slice(0, 10),
    claimed: false,
    source: "x-intro",
    claimToken: claimToken(),
    x: {
      userId: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: fullSizeAvatar(user.profile_image_url),
      bio: user.description,
      location: user.location,
      followers: user.public_metrics?.followers_count,
      postId: tweet.id,
      postUrl: postUrl(user.username, tweet.id),
      postText: tweet.text,
      postedAt: tweet.created_at || new Date().toISOString(),
      importedAt: new Date().toISOString(),
      confidence: extracted.confidence,
      placeLevel: place ? place.level : "none",
      origin: extracted.origin ?? undefined,
      extractor: extracted.source === "claude" ? "ai" : "rules",
      queryIndex,
    },
  });
}

/**
 * Runs one page of the import (up to 100 posts) and persists where it got to,
 * so a request never runs long and a sweep can be resumed or scheduled.
 */
// Fictional intro posts that exercise the whole pipeline (extraction, geocoding,
// pin creation, dedupe) without the X API. Ids are prefixed so they can be
// removed with `removeSamplePins()`.
const SAMPLE_PAGE: { tweets: XTweet[]; users: Map<string, XUser> } = {
  tweets: [
    { id: "sample-1", text: "I'm 29. Solo founder from Brazil, based in Barcelona. Building a tiny CRM for freelancers. Looking to connect with more marketers & indie hackers!", author_id: "sample-u1", created_at: new Date().toISOString() },
    { id: "sample-2", text: "Motion designer in Lisbon, freelancing for startups after 6 years in agencies. Working on Loopkit, a library of UI animations. Would love feedback and coffee with other makers here.", author_id: "sample-u2", created_at: new Date().toISOString() },
    { id: "sample-3", text: "Just shipped v2 of our analytics dashboard. Check it out!", author_id: "sample-u3", created_at: new Date().toISOString() },
    { id: "sample-4", text: "Indie hacker based in Porto Alegre building an app for local bakeries. Looking for a technical cofounder.", author_id: "sample-u4", created_at: new Date().toISOString() },
  ],
  users: new Map([
    ["sample-u1", { id: "sample-u1", username: "sample_mariana", name: "Mariana Sample", description: "Founder of Clientkit. Marketing nerd. Barcelona via São Paulo.", location: "Barcelona, Spain", url: "https://clientkit.example" }],
    ["sample-u2", { id: "sample-u2", username: "sample_tomas", name: "Tomás Sample", description: "Motion designer. After Effects, Rive, Blender.", location: "Lisboa" }],
    ["sample-u3", { id: "sample-u3", username: "sample_corp", name: "Sample Corp", description: "Analytics for teams.", location: "" }],
    ["sample-u4", { id: "sample-u4", username: "sample_joao", name: "João Sample", description: "Building for bakeries.", location: "Porto Alegre, Brazil" }],
  ]),
};

/** Removes every unclaimed pin that came from X and resets the sweep. Claimed profiles are never touched. */
export async function purgeListedPins(): Promise<number> {
  const result = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).deleteMany({ source: "x-intro", claimed: { $ne: true } }));
  await withDb((db) => db.collection<ImportState>("import_state").deleteOne({ _id: "x-import" }));
  return result.deletedCount;
}

export async function removeSamplePins(): Promise<number> {
  const result = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).deleteMany({ "x.userId": /^sample-/ }));
  return result.deletedCount;
}

/** Forget the sweep position so the next run searches from `days` ago. */
export async function resetSweep(days: number): Promise<void> {
  const state = await getImportState();
  state.nextToken = undefined;
  state.sinceId = undefined;
  state.sinceTime = Math.floor(Date.now() / 1000) - Math.max(1, days) * 24 * 60 * 60;
  state.rateLimitResetAt = undefined;
  state.queryIndex = 0;
  state.sweepDone = false;
  await saveImportState(state);
}

/** The query the sweep is currently on: one of the built-in patterns, or a custom one set in the admin console. */
export function currentQuery(state: ImportState): { query: string; pattern?: string } {
  if (state.queryIndex === undefined) return { query: state.query };
  const index = Math.min(state.queryIndex, QUERIES.length - 1);
  return { query: QUERIES[index].query, pattern: `${index + 1}/${QUERIES.length} ${QUERIES[index].label}` };
}

export async function runImportPage(options: { query?: string; restart?: boolean; maxPosts?: number; sample?: boolean } = {}): Promise<ImportResult> {
  const result: ImportResult = { fetched: 0, listed: 0, updated: 0, skipped: { notIntro: 0, noCity: 0, lowConfidence: 0, alreadyClaimed: 0, duplicate: 0 }, done: false, samples: [] };
  if (!isMongoConfigured()) return { ...result, done: true, error: "MongoDB is not configured." };

  if (options.sample) {
    // Same code path as a real page, but nothing is fetched and the sweep state is untouched.
    const page = SAMPLE_PAGE;
    result.fetched = page.tweets.length;
    for (const tweet of page.tweets) {
      const user = page.users.get(tweet.author_id || "");
      if (!user) { result.skipped.notIntro += 1; continue; }
      const existing = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ "x.userId": user.id }));
      const extracted = await extractPin(tweet, user);
      if (!extracted.isIntro) { result.skipped.notIntro += 1; continue; }
      const pin = await buildPin(tweet, user, extracted, existing?.id);
      if (!pin) { result.skipped.noCity += 1; continue; }
      if (extracted.confidence < MIN_CONFIDENCE) { pin.hidden = true; pin.review = "pending"; result.skipped.lowConfidence += 1; }
      await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: pin.id }, { $set: { ...pin } }, { upsert: true }));
      if (existing) result.updated += 1; else result.listed += 1;
      result.samples.push({ handle: pin.handle || "", city: pin.city, role: pin.role, confidence: extracted.confidence });
    }
    return { ...result, done: true };
  }

  const state = await getImportState();
  if (options.query && options.query !== state.query) { state.query = options.query; state.nextToken = undefined; state.queryIndex = undefined; state.sweepDone = false; }
  if (options.restart) { state.nextToken = undefined; state.sweepDone = false; if (state.queryIndex !== undefined) state.queryIndex = 0; }
  if (state.queryIndex === undefined && !options.query && state.query === DEFAULT_QUERY) state.queryIndex = 0; // first run: use the pattern list
  if (state.rateLimitResetAt && state.rateLimitResetAt > Date.now()) {
    return { ...result, rateLimitResetAt: state.rateLimitResetAt, error: `X rate limit; try again after ${new Date(state.rateLimitResetAt).toLocaleTimeString("en-US")}` };
  }
  if (state.sweepDone && !options.restart) return { ...result, done: true, pattern: "sweep complete" };

  const { query: baseQuery, pattern } = currentQuery(state);
  result.pattern = pattern;
  result.extractor = llmSource() === "none" ? "rules" : "ai";

  let page: SearchPage;
  try {
    // A fresh sweep (no nextToken) only asks for posts newer than the last one seen.
    // twitterapi.io pages are 20 posts, so keep fetching until this run has ~maxPosts.
    const want = options.maxPosts ?? 100;
    const query = buildQuery(baseQuery);
    // Each pattern sweeps the whole window from sinceTime; sinceTime only advances once all patterns are done.
    page = await searchRecent(query, { nextToken: state.nextToken, sinceId: state.nextToken ? undefined : state.sinceId, sinceTime: state.nextToken ? undefined : state.sinceTime, maxResults: want });
    while (provider() === "twitterapi" && page.nextToken && page.tweets.length < want) {
      const more = await searchRecent(query, { nextToken: page.nextToken, maxResults: want });
      for (const [id, user] of more.users) page.users.set(id, user);
      page = {
        tweets: [...page.tweets, ...more.tweets],
        users: page.users,
        nextToken: more.nextToken,
        newestId: [page.newestId, more.newestId].filter(Boolean).sort((a, b) => (BigInt(b as string) > BigInt(a as string) ? 1 : -1))[0],
        newestTime: Math.max(page.newestTime ?? 0, more.newestTime ?? 0) || undefined,
        rateLimit: more.rateLimit,
      };
    }
  } catch (error) {
    if (error instanceof XApiError) {
      if (error.status === 429) { state.rateLimitResetAt = error.resetAt ?? Date.now() + 15 * 60 * 1000; await saveImportState(state); }
      return { ...result, done: true, error: error.message, rateLimitResetAt: state.rateLimitResetAt };
    }
    throw error;
  }
  state.rateLimitResetAt = undefined;
  result.fetched = page.tweets.length;

  // One author per page, then one DB lookup each; the model reads several posts at once.
  const seenAuthors = new Set<string>();
  const candidates: { tweet: XTweet; user: XUser; existing: MakerRecord | null }[] = [];
  for (const tweet of page.tweets) {
    const user = tweet.author_id ? page.users.get(tweet.author_id) : undefined;
    if (!user) { result.skipped.notIntro += 1; continue; }
    if (seenAuthors.has(user.id)) { result.skipped.duplicate += 1; continue; }
    seenAuthors.add(user.id);
    const existing = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ $or: [{ "x.userId": user.id }, { handle: normalizeHandle(user.username) }] }));
    if (existing?.claimed) { result.skipped.alreadyClaimed += 1; continue; }
    // Already imported from this exact post. Re-read it only if rules did the reading and a model is now available.
    if (existing?.x?.postId === tweet.id && !(result.extractor === "ai" && existing.x.extractor !== "ai")) { result.skipped.duplicate += 1; continue; }
    candidates.push({ tweet, user, existing });
  }

  // Cheap pre-screen: a post with no builder or meet-up word at all is never an intro, so don't pay a model read for it.
  const worthReading = (text: string) => /\b(founder|co-?founder|maker|builder|building|build|indie|developer|dev|engineer|designer|marketer|marketing|freelanc|shipping|shipped|startup|bootstrapp|hacker|connect|meet|based in|living in|say hi|coffee|working on|launch)/i.test(text);
  const readable = candidates.filter((c) => worthReading(c.tweet.text) || worthReading(c.user.description || ""));
  result.skipped.notIntro += candidates.length - readable.length;
  const readings = await mapWithConcurrency(readable, result.extractor === "ai" ? 12 : 1, async (c) => ({ ...c, extracted: await extractPin(c.tweet, c.user) }));

  // Building a pin reads project sites, which is slow; do several at once.
  const built = await mapWithConcurrency(readings, 4, async (r) => {
    if (!r.extracted.isIntro) return { ...r, pin: null as Maker | null, intro: false };
    const pin = await buildPin(r.tweet, r.user, r.extracted, r.existing?.id, state.queryIndex).catch(() => null);
    return { ...r, pin, intro: true };
  });

  for (const { tweet, user: _user, existing, extracted, pin, intro } of built) {
    if (!intro) {
      result.skipped.notIntro += 1;
      // The model disagrees with an earlier rules listing: take it off the map and let a human decide.
      if (existing?.x?.postId === tweet.id && !existing.hidden) {
        await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: existing.id }, { $set: { hidden: true, review: "pending", "x.extractor": "ai" } }));
      }
      continue;
    }
    if (!pin) { result.skipped.noCity += 1; continue; }
    if (existing?.joinedAt) pin.joinedAt = existing.joinedAt; // first seen, not last re-read
    if (existing?.review === "approved") pin.review = "approved";
    else if (extracted.confidence < MIN_CONFIDENCE) {
      // Not sure enough to show on the map: park it hidden for a human to approve in the admin console.
      pin.hidden = true;
      pin.review = "pending";
      result.skipped.lowConfidence += 1;
    }
    if (existing?.hidden && existing.review !== "pending" && existing.review !== "approved") pin.hidden = true; // someone asked to be removed; keep honouring that
    if (existing?.review === "rejected" || existing?.review === "removed") { pin.hidden = true; pin.review = existing.review; }
    if (existing?.claimToken) pin.claimToken = existing.claimToken; // keep links already sent valid
    if (existing?.invitedBy) pin.invitedBy = existing.invitedBy;

    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: pin.id }, { $set: { ...pin } }, { upsert: true }));
    if (existing) result.updated += 1; else result.listed += 1;
    if (result.samples.length < 8) result.samples.push({ handle: pin.handle || "", city: pin.city, role: pin.role, confidence: extracted.confidence });
  }

  state.totals.fetched += result.fetched;
  state.totals.listed += result.listed;
  state.totals.skipped += Object.values(result.skipped).reduce((a, b) => a + b, 0);
  state.nextToken = page.nextToken;
  state.lastRunAt = new Date().toISOString();

  if (!page.nextToken) {
    // This pattern is exhausted for the window. Move to the next one, or close the window.
    if (state.queryIndex !== undefined && state.queryIndex < QUERIES.length - 1) {
      state.queryIndex += 1;
    } else {
      state.sweepDone = true;
      if (state.queryIndex !== undefined) state.queryIndex = 0;
      // Next sweep starts from now; incremental runs only see newer posts.
      const now = Math.floor(Date.now() / 1000);
      if (page.newestId && (!state.sinceId || BigInt(page.newestId) > BigInt(state.sinceId))) state.sinceId = page.newestId;
      state.sinceTime = Math.max(state.sinceTime ?? 0, page.newestTime ?? 0, now - 24 * 60 * 60);
    }
  }
  await saveImportState(state);

  result.done = !page.nextToken && Boolean(state.sweepDone);
  result.nextToken = page.nextToken;
  return result;
}

/** X requires removing content the author deleted. Hide pins whose intro post is gone. */
export async function recheckDeletedPosts(): Promise<{ checked: number; hidden: number }> {
  const listed = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ source: "x-intro", claimed: { $ne: true }, hidden: { $ne: true } }).toArray());
  const ids = listed.map((m) => m.x?.postId).filter((id): id is string => Boolean(id));
  if (!ids.length) return { checked: 0, hidden: 0 };
  const alive = await tweetsStillExist(ids);
  const gone = listed.filter((m) => m.x?.postId && !alive.has(m.x.postId));
  if (gone.length) {
    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateMany({ id: { $in: gone.map((m) => m.id) } }, { $set: { hidden: true } }));
  }
  return { checked: ids.length, hidden: gone.length };
}

export async function pendingReview(): Promise<Maker[]> {
  const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ review: "pending" }).sort({ id: -1 }).toArray());
  return docs.map(toMaker);
}

export async function decideReview(id: number, decision: "approved" | "rejected"): Promise<boolean> {
  const result = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne(
    { id, review: "pending" },
    { $set: { review: decision, hidden: decision === "rejected" } },
  ));
  return result.matchedCount > 0;
}

export async function listedPins(): Promise<Maker[]> {
  const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ source: "x-intro" }).sort({ id: -1 }).toArray());
  return docs.map(toMaker);
}
