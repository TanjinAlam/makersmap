import { readEnv } from "@/db";

// Two providers behind one interface:
//  - twitterapi.io (preferred when TWITTERAPI_IO_KEY is set): pay-per-request, 20 posts a page,
//    cursor pagination, `since_time:` for incremental sweeps.
//  - X API v2 (X_BEARER_TOKEN): 100 posts a page, `since_id` for incremental sweeps.
// Both are normalised to the same XTweet / XUser shapes the importer consumes.

export type XUser = {
  id: string;
  username: string;
  name: string;
  description?: string;
  location?: string;
  url?: string;
  profile_image_url?: string;
  verified?: boolean;
  created_at?: string;
  public_metrics?: { followers_count?: number; following_count?: number; tweet_count?: number };
  entities?: { url?: { urls?: { expanded_url?: string }[] } };
};

export type XTweet = {
  id: string;
  text: string;
  /** Links in the post, expanded past t.co. */
  links?: string[];
  author_id?: string;
  created_at?: string;
  lang?: string;
  public_metrics?: { like_count?: number; reply_count?: number };
};

export type SearchPage = {
  tweets: XTweet[];
  users: Map<string, XUser>;
  nextToken?: string;
  newestId?: string;
  /** Unix seconds of the newest post on the page (twitterapi.io sweeps continue from here). */
  newestTime?: number;
  rateLimit: { remaining?: number; resetAt?: number };
};

export type SearchOptions = { nextToken?: string; sinceId?: string; sinceTime?: number; maxResults?: number };

export class XApiError extends Error {
  constructor(message: string, readonly status: number, readonly resetAt?: number) {
    super(message);
  }
}

export type Provider = "twitterapi" | "x" | "none";

export function provider(): Provider {
  if (readEnv("TWITTERAPI_IO_KEY")) return "twitterapi";
  if (readEnv("X_BEARER_TOKEN")) return "x";
  return "none";
}

/** X returns a 48px `_normal` image; the same path with `_400x400` is the full-size one. */
export function fullSizeAvatar(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/_normal(\.[a-z]+)$/i, "_400x400$1");
}

export function postUrl(username: string, postId: string): string {
  return `https://x.com/${username}/status/${postId}`;
}

/* ----------------------------- twitterapi.io ----------------------------- */

const TAPI = "https://api.twitterapi.io";

type TapiUser = {
  id: string; userName: string; name: string; profilePicture?: string; description?: string; location?: string;
  url?: string; followers?: number; following?: number; isBlueVerified?: boolean; createdAt?: string;
};
type TapiTweet = {
  id: string; url?: string; text: string; createdAt?: string; lang?: string; isReply?: boolean;
  likeCount?: number; replyCount?: number; author?: TapiUser; retweeted_tweet?: unknown | null;
  entities?: { urls?: { expanded_url?: string }[] };
};

async function tapi<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = readEnv("TWITTERAPI_IO_KEY");
  if (!key) throw new XApiError("TWITTERAPI_IO_KEY is not set.", 0);
  const url = new URL(`${TAPI}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { "X-API-Key": key.trim() }, signal: AbortSignal.timeout(45_000) });
  const body = await response.json().catch(() => ({})) as T & { status?: string; message?: string; msg?: string; error?: string };
  if (!response.ok) {
    const message = body.message || body.msg || body.error || `twitterapi.io returned ${response.status}`;
    throw new XApiError(message, response.status, response.status === 429 ? Date.now() + 60_000 : undefined);
  }
  if (body.status === "error") throw new XApiError(body.message || body.msg || "twitterapi.io error", 400);
  return body;
}

function tapiUserToX(u: TapiUser): XUser {
  return {
    id: u.id,
    username: u.userName,
    name: u.name,
    description: u.description,
    location: u.location,
    profile_image_url: u.profilePicture,
    verified: u.isBlueVerified,
    created_at: u.createdAt,
    public_metrics: { followers_count: u.followers, following_count: u.following },
  };
}

// twitterapi.io returns post text with HTML entities ("&amp;", "&lt;"); the X API does not.
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Twitter-style "Tue Dec 10 07:00:30 +0000 2024" or ISO; returns ISO or undefined. */
function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function tapiSearch(query: string, options: SearchOptions): Promise<SearchPage> {
  // A fresh sweep continues from the newest post seen last time; a mid-sweep page keeps the cursor's query.
  const q = options.sinceTime && !options.nextToken ? `${query} since_time:${options.sinceTime}` : query;
  const body = await tapi<{ tweets?: TapiTweet[]; has_next_page?: boolean; next_cursor?: string }>("/twitter/tweet/advanced_search", {
    query: q,
    queryType: "Latest",
    cursor: options.nextToken || "",
  });
  const users = new Map<string, XUser>();
  const tweets: XTweet[] = [];
  let newestTime = 0;
  let newestId: string | undefined;
  for (const t of body.tweets ?? []) {
    if (t.isReply || t.retweeted_tweet) continue;
    if (!t.author?.id) continue;
    users.set(t.author.id, tapiUserToX(t.author));
    const created = toIso(t.createdAt);
    const links = (t.entities?.urls || []).map((u) => u.expanded_url || "").filter((u) => /^https?:\/\//i.test(u));
    tweets.push({ id: t.id, text: decodeEntities(t.text), links, author_id: t.author.id, created_at: created, lang: t.lang, public_metrics: { like_count: t.likeCount, reply_count: t.replyCount } });
    if (created) newestTime = Math.max(newestTime, Math.floor(new Date(created).getTime() / 1000));
    if (!newestId || BigInt(t.id) > BigInt(newestId)) newestId = t.id;
  }
  return {
    tweets,
    users,
    nextToken: body.has_next_page && body.next_cursor ? body.next_cursor : undefined,
    newestId,
    newestTime: newestTime || undefined,
    rateLimit: {},
  };
}

async function tapiTweetsStillExist(ids: string[]): Promise<Set<string>> {
  const alive = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const body = await tapi<{ tweets?: { id: string }[] }>("/twitter/tweets", { tweet_ids: chunk.join(",") });
    for (const t of body.tweets ?? []) alive.add(t.id);
  }
  return alive;
}

async function tapiLookupUser(username: string): Promise<XUser | null> {
  const body = await tapi<{ data?: TapiUser }>("/twitter/user/info", { userName: username });
  return body.data ? tapiUserToX(body.data) : null;
}

/* -------------------------------- X API v2 -------------------------------- */

const USER_FIELDS = "name,username,description,location,url,profile_image_url,verified,created_at,public_metrics,entities";
const TWEET_FIELDS = "created_at,author_id,lang,public_metrics";

// The token is used exactly as stored. X bearer tokens contain literal "%"
// sequences; decoding them produces a different, invalid token.
function xToken(): string {
  const raw = readEnv("X_BEARER_TOKEN");
  if (!raw) throw new XApiError("X_BEARER_TOKEN is not set.", 0);
  return raw.trim();
}

async function xCall<T>(path: string, params: Record<string, string>): Promise<{ body: T; rateLimit: SearchPage["rateLimit"] }> {
  const url = new URL(`https://api.x.com/2/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${xToken()}` }, signal: AbortSignal.timeout(45_000) });
  const rateLimit = {
    remaining: Number(response.headers.get("x-rate-limit-remaining") ?? NaN) || undefined,
    resetAt: Number(response.headers.get("x-rate-limit-reset") ?? NaN) * 1000 || undefined,
  };
  const body = await response.json().catch(() => ({})) as T & { title?: string; detail?: string; errors?: { message?: string }[] };
  if (!response.ok) {
    const message = body.detail || body.title || body.errors?.[0]?.message || `X API returned ${response.status}`;
    throw new XApiError(message, response.status, rateLimit.resetAt);
  }
  return { body, rateLimit };
}

async function xSearch(query: string, options: SearchOptions): Promise<SearchPage> {
  const params: Record<string, string> = {
    query,
    max_results: String(Math.min(100, Math.max(10, options.maxResults ?? 100))),
    "tweet.fields": TWEET_FIELDS,
    expansions: "author_id",
    "user.fields": USER_FIELDS,
  };
  if (options.nextToken) params.next_token = options.nextToken;
  if (options.sinceId) params.since_id = options.sinceId;
  const { body, rateLimit } = await xCall<{ data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { next_token?: string; newest_id?: string } }>("tweets/search/recent", params);
  return {
    tweets: body.data ?? [],
    users: new Map((body.includes?.users ?? []).map((user) => [user.id, user])),
    nextToken: body.meta?.next_token,
    newestId: body.meta?.newest_id,
    rateLimit,
  };
}

async function xTweetsStillExist(ids: string[]): Promise<Set<string>> {
  const alive = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { body } = await xCall<{ data?: { id: string }[] }>("tweets", { ids: chunk.join(","), "tweet.fields": "id" });
    for (const tweet of body.data ?? []) alive.add(tweet.id);
  }
  return alive;
}

async function xLookupUser(userId: string): Promise<XUser | null> {
  const { body } = await xCall<{ data?: XUser }>(`users/${userId}`, { "user.fields": USER_FIELDS });
  return body.data ?? null;
}

/* ------------------------------ public surface ------------------------------ */

/** One page of recent posts matching the query. Pass `nextToken` to continue a sweep. */
export async function searchRecent(query: string, options: SearchOptions = {}): Promise<SearchPage> {
  const which = provider();
  if (which === "twitterapi") return tapiSearch(query, options);
  if (which === "x") return xSearch(query, options);
  throw new XApiError("No X data provider configured. Set TWITTERAPI_IO_KEY or X_BEARER_TOKEN.", 0);
}

/** Which of these post ids still exist. Deleted or protected posts drop out. */
export async function tweetsStillExist(ids: string[]): Promise<Set<string>> {
  return provider() === "twitterapi" ? tapiTweetsStillExist(ids) : xTweetsStillExist(ids);
}

/** Fresh profile data, used to refresh a rotated avatar URL. */
export async function lookupUser(ref: { userId: string; username?: string }): Promise<XUser | null> {
  if (provider() === "twitterapi") return ref.username ? tapiLookupUser(ref.username) : null;
  return xLookupUser(ref.userId);
}

/** Query syntax differs slightly per provider; this turns the shared intent into the right string. */
export function buildQuery(base: string): string {
  if (provider() === "twitterapi") {
    // X web-search operators. twitterapi.io rejects since:/until: date forms but accepts filter: and lang:.
    return `${base} -filter:retweets -filter:replies lang:en`;
  }
  return `${base} -is:retweet -is:reply -is:quote lang:en`;
}
