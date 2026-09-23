import { publicMaker, type Maker } from "@/app/profile";

// Three sizes of a maker for the public API. The atlas gets dots, cards get
// details for the people on screen, and place lists get rows a page at a time.
// Nothing public ever carries claim tokens, emails, or review state
// (publicMaker strips those first).

/** Enough to draw a pin, a chip, and a list row. */
export function dotView(m: Maker) {
  const p = publicMaker(m);
  return {
    id: p.id, name: p.name, handle: p.handle, city: p.city, country: p.country, flag: p.flag, lat: p.lat, lon: p.lon,
    avatar: p.avatar, color: p.color, initials: p.initials, role: p.role, tags: p.tags.slice(0, 3),
    lookingFor: p.lookingFor, canHelpWith: p.canHelpWith, openToMeeting: p.openToMeeting, coffee: p.coffee, coffeeWeek: p.coffeeWeek,
    timezone: p.timezone, project: p.project, projectCount: p.projects.length, claimed: p.claimed, source: p.source, joinedAt: p.joinedAt,
    x: p.x ? { username: p.x.username, placeLevel: p.x.placeLevel, postedAt: p.x.postedAt } : undefined,
  };
}

/** What a card or panel shows: the dot plus description, projects, links, skills, bio. */
export function cardView(m: Maker) {
  const p = publicMaker(m);
  const { x, ...rest } = p;
  return { ...rest, x: x ? { username: x.username, userId: x.userId, postId: x.postId, postUrl: x.postUrl, postedAt: x.postedAt, placeLevel: x.placeLevel, origin: x.origin } : undefined };
}

/** A row in a country or city list. */
export function rowView(m: Maker) {
  const p = publicMaker(m);
  return {
    id: p.id, name: p.name, handle: p.handle, city: p.city, country: p.country, flag: p.flag, role: p.role, project: p.project,
    avatar: p.avatar, color: p.color, initials: p.initials, lookingFor: p.lookingFor, openToMeeting: p.openToMeeting, coffee: p.coffee, coffeeWeek: p.coffeeWeek,
    xHandle: p.x?.username || undefined, placeLevel: p.x?.placeLevel,
  };
}
export type MakerRow = ReturnType<typeof rowView>;

export const publicCache = { "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" };
