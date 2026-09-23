import { z } from "zod/v4";
import { withDb } from "@/db";
import { llmSource, structured } from "./llm";

// Reads a project's website and writes the summary that goes on its page.
// A project without a link we can visit never becomes a project.

export type SiteInfo = { url: string; title: string; siteName?: string; description: string; image?: string; icon?: string; text: string };
type Cached = { _id: string; info: SiteInfo | null; at: number };
const TTL = 30 * 24 * 60 * 60 * 1000;
const UA = "Mozilla/5.0 (compatible; MakersMap/1.0; +https://makersmap.com)";

const BLOCKED_HOSTS = /(^|\.)(x\.com|twitter\.com|t\.co|linkedin\.com|instagram\.com|facebook\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net|bsky\.app|medium\.com|substack\.com|github\.com|producthunt\.com|linktr\.ee|bio\.link|calendly\.com|discord\.gg|discord\.com|t\.me|wa\.me|apps\.apple\.com|play\.google\.com)$/i;

/** True when the link is a product's own site rather than a social profile or a store page. */
export function isProductSite(url: string): boolean {
  try { return isPublicHost(url) && !BLOCKED_HOSTS.test(new URL(url).hostname); } catch { return false; }
}

// The server only ever fetches public web hosts: no loopback, private ranges, link-local, or bare IPs.
export function isPublicHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith("[")) return false; // literal IPs
    return true;
  } catch { return false; }
}

/** "Loopkit – UI animations for React" -> "Loopkit". */
function cleanTitle(title: string): string {
  return title.split(/\s+[|\-–—:·]\s+/)[0].trim().slice(0, 60);
}

/** A site that several different makers link as "their" project is a community or a tool, not anyone's product. */
export async function sharedSite(url: string, ownerId?: number): Promise<boolean> {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return false; }
  if (!host) return false;
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const others = await withDb((db) => db.collection("makers").countDocuments({ id: { $ne: ownerId ?? -1 }, "projects.website": { $regex: `^https?://(www\\.)?${escaped}(/|$)`, $options: "i" } })).catch(() => 0);
  return others >= 3;
}

/** Follows redirects (t.co and friends) and returns the final URL, or null if it can't be reached. */
export async function expandUrl(url: string): Promise<string | null> {
  if (!isPublicHost(url)) return null;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    const final = response.url || url;
    if (!isPublicHost(final)) return null;
    if (response.ok || (response.status >= 300 && response.status < 400) || response.status === 405 || response.status === 403 || response.status === 429 || response.status >= 500) return final;
    return null;
  } catch {
    try {
      const response = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      return response.ok ? response.url || url : null;
    } catch { return null; }
  }
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i");
  return decode((html.match(re) || html.match(re2))?.[1] || "");
}
function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").trim();
}
function absolute(base: string, href: string): string | undefined {
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

/** Fetches a page and pulls out what a reader needs: title, description, preview image, icon, and the visible text. */
export async function readSite(url: string): Promise<SiteInfo | null> {
  const key = url.replace(/\/$/, "");
  const cached = await withDb((db) => db.collection<Cached>("sitecache").findOne({ _id: key })).catch(() => null);
  if (cached && Date.now() - cached.at < (cached.info ? TTL : 6 * 60 * 60 * 1000)) return cached.info;
  if (!isPublicHost(url)) return null;
  let info: SiteInfo | null = null;
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(12000) });
    const type = response.headers.get("content-type") || "";
    if (response.ok && /html|xml|text/i.test(type)) {
      const html = (await response.text()).slice(0, 600_000);
      const final = response.url || url;
      const title = decode((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || meta(html, "og:title") || "").slice(0, 160));
      const description = (meta(html, "description") || meta(html, "og:description") || meta(html, "twitter:description")).slice(0, 400);
      const image = meta(html, "og:image") || meta(html, "twitter:image");
      const iconHref = html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)?.[1] || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:apple-touch-icon|icon|shortcut icon)["']/i)?.[1];
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
      const siteName = (meta(html, "og:site_name") || meta(html, "application-name")).slice(0, 80) || undefined;
      info = { url: final, title, siteName, description, image: image ? absolute(final, image) : undefined, icon: iconHref ? absolute(final, iconHref) : absolute(final, "/favicon.ico"), text: decode(text) };
    }
  } catch { info = null; }
  await withDb((db) => db.collection<Cached>("sitecache").updateOne({ _id: key }, { $set: { info, at: Date.now() } }, { upsert: true })).catch(() => undefined);
  return info;
}

const SummarySchema = z.object({ name: z.string(), pitch: z.string(), summary: z.string(), isProduct: z.boolean() });
const SYSTEM = `You describe a maker's project for a community atlas, from the project's own website.
"name": the product's actual name exactly as the site itself uses it (from its title, logo text, or site name), with the site's capitalisation. Never a handle, a URL, or the maker's name. If the site clearly names the product differently from the label given, use the site's name.
"pitch": one line, under 70 characters, that anyone would understand with no context: what it is, for whom. Plain words, no jargon, no adjectives like "revolutionary".
"summary": one or two plain sentences, under 200 characters, saying what the product does and for whom, in neutral words a stranger would trust. No marketing adjectives, no exclamation marks, no emojis. If the site text is thin, use what is there and stay honest; never invent features.
"isProduct": true for anything a person could plausibly call their project: a product, an app, a service business, an agency or studio, a consultancy, a newsletter, a community, a course, a portfolio of their own work, an open-source tool. False only when the page is not a project at all: a parked domain, a generic error page, a login wall with nothing on it, someone else's social profile, an app store listing, a link-in-bio page.`;

/** A summary written from the site itself. Null when the site isn't readable or isn't a product. */
export async function summarizeProject(name: string, site: SiteInfo): Promise<{ name: string; summary: string; tagline: string } | null> {
  const fallbackName = cleanTitle(site.siteName || site.title) || name;
  if (llmSource() === "none") {
    return site.description ? { name: fallbackName, summary: site.description.slice(0, 200), tagline: "" } : null;
  }
  const out = await structured({
    system: SYSTEM,
    user: `LABEL FROM THE POST: ${name}\nURL: ${site.url}\nSITE NAME: ${site.siteName || ""}\nTITLE: ${site.title}\nMETA DESCRIPTION: ${site.description}\nPAGE TEXT: ${site.text.slice(0, 3000)}`,
    schema: SummarySchema,
    maxTokens: 300,
    label: "site-summary",
  });
  if (!out) return site.description ? { name: fallbackName, summary: site.description.slice(0, 200), tagline: "" } : null;
  // Single-page apps often render nothing for a crawler. A real title or meta description is enough to keep the project.
  if (!out.isProduct || !out.summary.trim()) {
    const thin = site.text.length < 120;
    if (thin && (site.description || site.title)) return { name: fallbackName, summary: (site.description || site.title).slice(0, 200), tagline: "" };
    return null;
  }
  const cleanName = out.name.trim().replace(/^https?:\/\/\S+$/i, "").slice(0, 80);
  return { name: cleanName && !/^@/.test(cleanName) ? cleanName : fallbackName, summary: out.summary.trim().replace(/!+/g, ".").slice(0, 220), tagline: out.pitch.trim().replace(/[.!]+$/, "").slice(0, 70) };
}

/**
 * The full step for one project: check the link, read the site, write the
 * summary, pick the logo. Null means "not a project we can show".
 */
export async function enrichProject(name: string, website: string, ownerId?: number): Promise<{ name: string; website: string; description: string; tagline: string; logo?: string; image?: string } | null> {
  // Expand first: most links arrive as t.co and only the destination tells us anything.
  const final = await expandUrl(website);
  if (!final || !isProductSite(final)) return null;
  if (await sharedSite(final, ownerId)) return null;
  const site = await readSite(final);
  if (!site) return null;
  const written = await summarizeProject(name, site);
  if (!written) return null;
  return { name: written.name, website: site.url, description: written.summary, tagline: written.tagline, logo: site.icon, image: site.image };
}

/** The same site listed twice under different labels is one project. */
export function dedupeBySite<T extends { website?: string; name: string }>(projects: T[]): T[] {
  const seen = new Set<string>();
  return projects.filter((p) => {
    let key = p.name.toLowerCase();
    try { if (p.website) key = new URL(p.website).hostname.replace(/^www\./, "").toLowerCase(); } catch {}
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Links go stale. Re-visit each project site about weekly; after two failed
// visits in a row the project comes off the page (the record keeps it, so a
// site that comes back is restored on the next good visit).
type LinkCheck = { checkedAt?: string; failures?: number };
export async function verifyProjectLinks(limit = 300): Promise<{ checked: number; ok: number; failing: number; removed: number }> {
  const report = { checked: 0, ok: 0, failing: 0, removed: 0 };
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  type P = { website?: string; linkCheck?: LinkCheck } & Record<string, unknown>;
  // Owners of claimed pins manage their own projects; only listed pins are pruned automatically.
  const makers = await withDb((db) => db.collection<{ id: number; projects?: P[]; hiddenProjects?: P[] }>("makers")
    .find({ claimed: { $ne: true }, $or: [
      { "projects.website": { $regex: "^https?://" }, "projects.linkCheck.checkedAt": { $exists: false } },
      { "projects.website": { $regex: "^https?://" }, "projects.linkCheck.checkedAt": { $lt: weekAgo } },
      { "hiddenProjects.0": { $exists: true } },
    ] })
    .limit(limit).toArray());
  for (const m of makers) {
    const keep: P[] = [];
    const dropped: P[] = [];
    // A site that was down last time and answers now brings its project back.
    const stillHidden: P[] = [];
    for (const p of m.hiddenProjects || []) {
      if (p.website && (await expandUrl(p.website))) keep.push({ ...p, linkCheck: { checkedAt: new Date().toISOString(), failures: 0 } });
      else stillHidden.push(p);
    }
    for (const p of m.projects || []) {
      if (!p.website || (p.linkCheck?.checkedAt && p.linkCheck.checkedAt > weekAgo)) { keep.push(p); continue; }
      report.checked += 1;
      const alive = await expandUrl(p.website);
      if (alive) { report.ok += 1; keep.push({ ...p, linkCheck: { checkedAt: new Date().toISOString(), failures: 0 } }); continue; }
      const failures = (p.linkCheck?.failures || 0) + 1;
      if (failures >= 2) { report.removed += 1; dropped.push({ ...p, linkCheck: { checkedAt: new Date().toISOString(), failures } }); }
      else { report.failing += 1; keep.push({ ...p, linkCheck: { checkedAt: new Date().toISOString(), failures } }); }
    }
    const set: Record<string, unknown> = { projects: keep, project: (keep[0]?.name as string) || "", description: (keep[0]?.description as string) || "", hiddenProjects: [...stillHidden, ...dropped] };
    await withDb((db) => db.collection("makers").updateOne({ id: m.id }, { $set: set }));
  }
  return report;
}
