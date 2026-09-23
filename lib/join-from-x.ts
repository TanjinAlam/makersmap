import { withDb } from "@/db";
import { normalizeHandle } from "@/app/handle";
import { normalizeMaker, normalizeProject, type Maker } from "@/app/profile";
import { MAKERS_COLLECTION, nextMakerId, toMaker } from "@/db/makers";
import { extractPin } from "./x-extract";
import { geocodeCity, geocodeCountry, normalizePlaceName } from "./geocode";
import type { Me } from "./x-oauth";
import { dedupeBySite, enrichProject, expandUrl } from "./site-reader";
import { mapWithConcurrency } from "./llm";

type MakerRecord = Maker & { _id?: unknown };
export type JoinOutcome = { status: "claimed" | "existing" | "created" | "needs-place" | "conflict"; handle: string };

// Signing in with X is the whole onboarding: if we already listed this person,
// the pin becomes theirs; if not, we build one from their X profile so the only
// questions left are the ones only they can answer.
export async function joinFromX(me: Me): Promise<JoinOutcome> {
  const handle = normalizeHandle(me.username);
  const existing = await withDb(async (db) => (await db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ "x.userId": me.id })) || db.collection<MakerRecord>(MAKERS_COLLECTION).findOne({ handle }));

  if (existing) {
    if (existing.claimed && existing.claimedBy && existing.claimedBy !== me.id) return { status: "conflict", handle: existing.handle || handle };
    if (existing.claimed) return { status: "existing", handle: existing.handle || handle };
    const claimed = normalizeMaker({
      ...toMaker(existing),
      name: existing.name || me.name,
      claimed: true,
      claimedBy: me.id,
      source: "self",
      hidden: false,
      email: me.email || existing.email,
      x: existing.x ? { ...existing.x, avatarUrl: me.avatarUrl || existing.x.avatarUrl } : undefined,
    });
    await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: existing.id }, { $set: { ...claimed, claimToken: undefined } }));
    return { status: "claimed", handle: claimed.handle || handle };
  }

  // New person: read the bio the way we read intro posts, then place them.
  const user = { id: me.id, username: me.username, name: me.name, description: me.description, location: me.location, url: me.url, profile_image_url: me.avatarUrl };
  const extracted = await extractPin({ id: `bio-${me.id}`, text: me.description || "", author_id: me.id, created_at: new Date().toISOString() }, user);
  const fromField = me.location ? normalizePlaceName(me.location.split(/[,|·/]/)[0].trim()) : "";
  const place = extracted.city
    ? await geocodeCity(extracted.city, extracted.country ?? undefined)
    : fromField
      ? await geocodeCity(fromField)
      : extracted.country
        ? await geocodeCountry(extracted.country)
        : null;
  if (!place) return { status: "needs-place", handle };

  const now = new Date().toISOString();
  if (me.url && /^https?:\/\/t\.co\//i.test(me.url)) me.url = (await expandUrl(me.url).catch(() => null)) || undefined;
  const candidates = extracted.projects.map((p, i) => ({ ...p, website: p.website || (i === 0 ? me.url || "" : "") })).filter((p) => /^https?:\/\//i.test(p.website || ""));
  const projectsRaw = (await mapWithConcurrency(candidates, 3, async (p) => {
    const site = await enrichProject(p.name, p.website as string).catch(() => null);
    return site ? normalizeProject({ name: site.name, description: site.description, tagline: site.tagline, website: site.website, logo: site.logo, image: site.image, stage: p.stage || "Building" }) : null;
  })).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const projects = dedupeBySite(projectsRaw);
  const maker = normalizeMaker({
    id: await nextMakerId(),
    name: me.name?.trim() || `@${me.username}`,
    handle,
    city: place.city, country: place.country, flag: place.flag, lat: place.lat, lon: place.lon, timezone: place.tz,
    role: extracted.role,
    tags: extracted.interests,
    projects,
    project: extracted.project || "",
    description: extracted.projectDescription || "",
    website: me.url || "",
    bio: (me.description || "").trim(),
    lookingFor: extracted.lookingFor,
    canHelpWith: extracted.canHelpWith,
    skills: extracted.skills,
    links: [{ kind: "X" as const, url: `https://x.com/${me.username}` }],
    avatar: `/api/avatar/x/${me.id}`,
    openToMeeting: extracted.lookingFor.includes("Coffee") ? ["Coffee" as const, "Remote chats" as const] : extracted.lookingFor.length ? ["Remote chats" as const] : [],
    coffee: extracted.lookingFor.includes("Coffee"),
    joinedAt: now.slice(0, 10),
    claimed: true,
    claimedBy: me.id,
    source: "self",
    email: me.email,
    x: { userId: me.id, username: me.username, name: me.name, avatarUrl: me.avatarUrl, bio: me.description, location: me.location, postId: "", postUrl: "", postText: "", postedAt: "", importedAt: now, placeLevel: place.level, extractor: extracted.source === "claude" ? "ai" : "rules" },
  });
  await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).insertOne({ ...maker }));
  return { status: "created", handle };
}
