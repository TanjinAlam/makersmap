import { hasCity, isOpenInPerson, roleGroupOf, type Maker } from "./profile";

// Ranks the "Meet someone interesting" shelf. No login needed: it uses what the
// browser knows (your own pin, who you saved, who you've already opened) plus
// how complete and fresh each profile is, then rotates daily and spreads
// countries out so the strip never reads as one place.

export type ShelfContext = {
  own?: Maker | null;
  savedIds?: number[];
  savedMakers?: Maker[];
  /** Handles the viewer opened recently; they drop down the strip so new faces come up. */
  seenHandles?: string[];
  /** Any stable string; the same seed gives the same order for the whole visit. */
  seed?: string;
};

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 0..1, stable per (seed, maker), so the daily shuffle doesn't jump around mid-visit. */
function jitter(seed: string, maker: Maker): number {
  return (hashString(`${seed}:${maker.id}:${maker.handle || ""}`) % 10007) / 10007;
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86400000;
}

/** How much this profile gives a stranger to go on. */
export function profileSignal(m: Maker): number {
  let s = 0;
  if (m.avatar) s += 2;
  if (m.project) s += 2;
  if (m.description) s += 1;
  if (m.bio && m.bio.length > 40) s += 1;
  if (m.lookingFor.length) s += 1.5;
  if (m.canHelpWith.length) s += 1;
  if (m.skills.length) s += 0.5;
  if (m.tags.length) s += 0.5;
  if (isOpenInPerson(m)) s += 1;
  if (hasCity(m)) s += 1.5; // a city is something you can act on; a country is not
  if (m.claimed) s += 2;    // they came back and filled it in themselves
  const age = daysSince(m.x?.postedAt || m.joinedAt);
  if (age !== null) s += age < 3 ? 2 : age < 7 ? 1.5 : age < 14 ? 1 : age < 30 ? 0.5 : 0;
  return s;
}

/** How much this person has to do with the viewer, from what the browser knows. */
export function affinity(m: Maker, ctx: ShelfContext): number {
  let s = 0;
  const own = ctx.own;
  if (own && own.id !== m.id) {
    if (own.city && m.city === own.city && hasCity(m)) s += 3;
    else if (own.country && m.country === own.country) s += 1.5;
    // They want what you offer, or you want what they offer.
    const theyNeedMe = m.lookingFor.some((need) => (need === "Feedback" && own.canHelpWith.includes("Product")) || (need === "Cofounder" && own.lookingFor.includes("Cofounder")) || (need === "Coffee" && isOpenInPerson(own)));
    const iNeedThem = own.lookingFor.some((need) => (need === "Feedback" && m.canHelpWith.length > 0) || (need === "Customers" && m.canHelpWith.includes("Marketing")) || (need === "Cofounder" && m.lookingFor.includes("Cofounder")));
    if (theyNeedMe) s += 1.5;
    if (iNeedThem) s += 1.5;
    const shared = m.tags.filter((t) => own.tags.includes(t)).length;
    s += Math.min(2, shared * 0.75);
    if (own.timezone && m.timezone && own.timezone === m.timezone) s += 0.5;
  }
  // Saved people tell us what the viewer likes: their cities, tags, and roles.
  const savedMakers = ctx.savedMakers || [];
  if (savedMakers.length) {
    const cities = new Set(savedMakers.map((x) => x.city));
    const tags = new Set(savedMakers.flatMap((x) => x.tags));
    const groups = new Set(savedMakers.map((x) => roleGroupOf(x.role)));
    if (cities.has(m.city) && hasCity(m)) s += 1;
    if (m.tags.some((t) => tags.has(t))) s += 0.75;
    if (groups.has(roleGroupOf(m.role))) s += 0.5;
  }
  return s;
}

/**
 * Orders people for the shelf: signal + affinity + a daily shuffle, then
 * spread out by country so no single place dominates the first screen.
 */
export function rankShelf(people: Maker[], ctx: ShelfContext = {}): Maker[] {
  const seed = ctx.seed || new Date().toISOString().slice(0, 10);
  const seen = new Set(ctx.seenHandles || []);
  const savedIds = new Set(ctx.savedIds || []);
  const scored = people.map((m) => {
    let score = profileSignal(m) + affinity(m, ctx) + jitter(seed, m) * 3;
    if (m.handle && seen.has(m.handle)) score -= 4;   // already opened this visit or recently
    if (savedIds.has(m.id)) score -= 2;                // already in "Saved"; make room for new faces
    if (ctx.own && m.id === ctx.own.id) score = -100;  // never recommend the viewer to themselves
    return { m, score };
  }).sort((a, b) => b.score - a.score);

  // Country round-robin over the top tier: take the best from each country in
  // turn, so the first row shows the world rather than the biggest country.
  const byCountry = new Map<string, Maker[]>();
  for (const { m } of scored) {
    const key = m.country || "?";
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key)!.push(m);
  }
  const queues = [...byCountry.values()];
  const out: Maker[] = [];
  let ring = 0;
  while (out.length < people.length) {
    let progressed = false;
    for (let i = 0; i < queues.length; i++) {
      const q = queues[(ring + i) % queues.length];
      const next = q.shift();
      if (next) { out.push(next); progressed = true; }
      // Let a country contribute up to two in a row in its turn once the top tier is spent.
    }
    ring++;
    if (!progressed) break;
  }
  return out;
}

export const SEEN_KEY = "makersmap-seen";
export function readSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(-60) : [];
  } catch { return []; }
}
export function markSeen(handle: string) {
  try {
    const next = [...readSeen().filter((h) => h !== handle), handle].slice(-60);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {}
}
