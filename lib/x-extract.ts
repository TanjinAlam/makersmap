import { z } from "zod/v4";
import { llmSource, structured } from "./llm";
import { cities, helpWithOptions, interestOptions, lookingForOptions, roleOptions, type HelpWith, type LookingFor, type Role } from "@/app/profile";
import { normalizePlaceName } from "./geocode";
import type { XTweet, XUser } from "./x-api";

export type Extracted = {
  isIntro: boolean;
  /** Where they are now. A city when the post names one, otherwise a country. */
  city: string | null;
  country: string | null;
  /** Where they're originally from, when the post says so ("from Brazil, based in Barcelona"). */
  origin: string | null;
  role: Role;
  lookingFor: LookingFor[];
  canHelpWith: HelpWith[];
  interests: string[];
  project: string | null;
  projectDescription: string | null;
  /** Every product they build, founded, or run themselves, in the order mentioned. Employers don't count. */
  projects: { name: string; description: string; website?: string; stage?: "Exploring" | "Building" | "Launched" | "Growing" }[];
  skills: string[];
  confidence: number;
  source: "claude" | "rules";
};

const Schema = z.object({
  isIntro: z.boolean(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  origin: z.string().nullable(),
  // Kept as plain strings so an off-list value doesn't sink the whole answer; extractPin maps them onto the options.
  role: z.string().nullable(),
  lookingFor: z.array(z.string()).nullable().default([]),
  canHelpWith: z.array(z.string()).nullable().default([]),
  interests: z.array(z.string()).nullable().default([]),
  project: z.string().nullable(),
  projectDescription: z.string().nullable(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().nullable().default(""),
    website: z.string().nullable().default(""),
    stage: z.string().nullable().default(""),
  })).nullable().default([]),
  skills: z.array(z.string()).nullable().default([]),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You read a public post from X and the author's profile, and fill in a pin for a city-level atlas of makers.
These posts follow a popular template: an age, who they are, where they are, what they build, and who they want to meet. Examples:
"I'm 29. Solo founder from Brazil, based in Barcelona. Looking to connect with more marketers & indie hackers!"
"Hi, I'm Jan. 30 • Istanbul. Building software as a solo founder / developer. Would love to meet other people shipping in public."
"I'm 30. iOS founder from Lebanon. Hi :)"
Decide isIntro: true when the author is introducing themselves as a person who builds things, in this template or any similar form: an age opener ("I'm 24.") followed by who they are, where they are, or what they build counts even when they don't literally ask to connect, because the template is itself an invitation. A post whose point is "looking to connect with / would love to meet <kinds of people>" is always an intro, even when the author says little about themselves. Not intros: product launches, build logs ("Day 17 of building in public"), advice threads and lessons lists, follower-count posts, memes, replies to someone else, news, job ads, event promos, and posts recruiting for a company. The test: is the author reaching out as a person to meet people, or publishing content? A post that has no builder identity at all (a sports fan looking for fans, a consultant advertising services) is not an intro.
confidence for a template post with a clear place should be 0.8 or higher; use lower values only when the place or the intro intent is unclear.
city: the city they are based in now, if the post or profile names one. country: the country they are in now. If the post only names a country ("from Lebanon", "in the Alps" -> France), set city to null and country to that country. "from X, based in Y" means origin X, now Y. "from X living in Y" means origin X, now Y. A US state abbreviation after a city ("Houston, TX") means United States. Never guess a city from a country.
origin: where they say they're from, when it differs from where they are now; otherwise null.
role: the closest option; "solo founder" -> "Solo maker"; someone who says designer -> a designer role; "9-5 engineer who builds at night" -> "Developer". lookingFor: at most three, from what they say they want ("connect with marketers" -> Customers or Founder friends depending on intent; "other builders / indie hackers / founders" -> Founder friends; "cofounder" -> Cofounder; "feedback" -> Feedback; "coffee" -> Coffee). canHelpWith: only what they clearly offer. interests: only from the allowed list. projects: every product, app, company, newsletter, or open-source tool they themselves build, founded, or run, from the post and the bio, in the order mentioned, up to four. Only include one when it has an actual name (a brand or product name, never a URL, a t.co link, a handle, or a generic word like "startup", "my app", or "a SaaS"). Each has the name, a one-sentence description under 120 characters in their words, a website when one of the LINKS in the post or the profile website is clearly that project's own site (never a social profile or a store page), and a stage (Exploring, Building, Launched, or Growing) when the text says so. Do not include companies they merely work at, tools they use, communities they belong to, or the author's own name or handle. project and projectDescription: the first of those, or null. skills: concrete tools or skills.
confidence: how sure you are that this is an intro and that the location is right, 0 to 1. Never invent facts.`;

const allowedTags = new Set(interestOptions);

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Words that can trail a place in a run-on sentence, or follow "from"/"in" without being a place.
const TRAILING = new Set(["looking", "building", "hi", "hey", "now", "currently", "making", "working", "and", "but", "say", "love", "would", "i", "i'm", "i’m", "who", "that", "based", "just", "ex", "studying", "founder", "solo", "shipping", "creating", "where", "with", "for", "to", "at", "on", "in", "if", "you", "we", "my", "a", "an", "the", "this", "here", "there", "so", "also", "still", "living", "moved", "from", "via", "or", "of", "since", "after", "before", "until", "while", "because"]);
const NOT_PLACES = new Set(["scratch", "home", "zero", "day", "ground", "nothing", "day one", "work", "one company", "my kids", "there", "here", "everywhere", "anywhere", "nowhere", "public", "day 1", "idea", "experience"]);

function titleCase(value: string): string {
  return value.split(/\s+/).map((w) => (w.length > 2 || /^[A-Z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase())).join(" ");
}

function cleanPlace(raw: string | undefined): string | null {
  if (!raw) return null;
  let words = raw.replace(/[!?.,;:)"'“”]+$/g, "").trim().split(/\s+/);
  while (words.length && TRAILING.has(words[0].toLowerCase())) words.shift();
  // A place never contains these words; everything from the first one on is the next clause.
  const cut = words.findIndex((w) => TRAILING.has(w.toLowerCase()));
  if (cut >= 0) words = words.slice(0, cut);
  const value = normalizePlaceName(words.join(" "));
  if (!value || value.length < 2 || value.length > 40 || !/^[\p{L}][\p{L}\s'’-]*$/u.test(value)) return null;
  if (NOT_PLACES.has(value.toLowerCase())) return null;
  return titleCase(value);
}

// Places are matched within one line: the template puts each fact on its own line.
const WORD = "[\\p{L}][\\p{L}'’-]*";
const PLACE = `(${WORD}(?:[ \\t]+${WORD}){0,2})`;
const COUNTRY_AFTER = `(?:,[ \\t]*(${WORD}(?:[ \\t]+${WORD})?))?`;
const RE_BASED = new RegExp(`\\b(?:based in|based out of|living in|now in|currently in|located in|residing in|moved to|settled in)\\s+(?:the\\s+)?${PLACE}${COUNTRY_AFTER}`, "iu");
const RE_BULLET = new RegExp(`\\b\\d{2}\\s*[•·|]\\s*${PLACE}`, "u");
const RE_ROLE_IN = new RegExp(`\\b(?:designer|developer|founder|maker|engineer|marketer|builder|hacker|dev|freelancer)\\s+in\\s+(?:the\\s+)?${PLACE}${COUNTRY_AFTER}`, "iu");
const RE_FROM = new RegExp(`\\bfrom\\s+(?:the\\s+)?${PLACE}${COUNTRY_AFTER}`, "iu");

// The template fallback used when no Claude key is set. Tuned to the intro
// meme: "I'm <age>. <role> from <country>, based in <city>. Looking to connect with <who>."
function rules(tweet: XTweet, user: XUser | undefined): Extracted {
  // Keep line breaks: in this template each fact sits on its own line, which bounds the place regexes.
  const post = tweet.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const hay = `${post}\n${user?.description || ""}`.toLowerCase();

  const ageOpener = /\b(?:i['’]?m|i am|hi[, ]+i['’]?m)\s+(?:nearly\s+|almost\s+)?\d{2}\b/i.test(post) || /\b\d{2}\s*[•·|]\s*[A-Z]/.test(post);
  const connect = /looking to (connect|meet)|would love to (meet|connect)|let'?s connect|say hi|come say hi|looking forward to connect/i.test(post);
  const identity = /solo founder|indie hacker|founder|maker|builder|building|developer|designer|marketer|engineer|shipping|bootstrapp/i.test(post);
  const promo = /we['’]re looking to connect|we are looking|join us|our team|hiring|follow me back|follow back|dm to|discount|giveaway|come see me|see me at|tickets|attending|not a founder|not a builder/i.test(post);
  const isIntro = !promo && ((ageOpener && (connect || identity)) || (connect && identity && /\b(from|based in|in)\b/i.test(post)));

  // Where they are now, in priority order.
  const basedIn = post.match(RE_BASED);
  const bullet = post.match(RE_BULLET);
  const inCity = post.match(RE_ROLE_IN);
  const fromMatch = post.match(RE_FROM);

  let city: string | null = null;
  let country: string | null = null;
  let origin: string | null = null;

  // "Houston, TX": a two-letter uppercase token after the comma is a US state.
  const usState = (s?: string) => (s && /^[A-Z]{2}$/.test(s.trim()) ? "United States" : null);
  if (basedIn) {
    city = cleanPlace(basedIn[1]);
    country = usState(basedIn[2]) || cleanPlace(basedIn[2]);
    if (fromMatch) origin = cleanPlace(fromMatch[1]);
  } else if (bullet) {
    city = cleanPlace(bullet[1]);
  } else if (inCity) {
    city = cleanPlace(inCity[1]);
    country = usState(inCity[2]) || cleanPlace(inCity[2]);
    if (fromMatch) origin = cleanPlace(fromMatch[1]);
  } else if (fromMatch) {
    // "from Barcelona, Spain" -> city + country. "from Brazil" alone -> country-level.
    const first = cleanPlace(fromMatch[1]);
    const second = cleanPlace(fromMatch[2]);
    if (second) { city = first; country = second; }
    else if (first) {
      const table = cities.find((c) => c.city.toLowerCase() === first.toLowerCase());
      if (table) { city = table.city; country = table.country; } else { country = first; }
    }
  }
  // A city we know that appears anywhere in the post beats a vague country.
  if (!city) {
    const known = [...cities].sort((a, b) => b.city.length - a.city.length).find((c) => new RegExp(`(^|[^\\p{L}])${escapeRe(c.city.toLowerCase())}(?![\\p{L}])`, "u").test(post.toLowerCase()));
    if (known) { city = known.city; country = country || known.country; }
  }
  // Profile location field as a last resort ("Barcelona, Spain").
  if (!city && !country && user?.location) {
    const parts = user.location.split(",").map((s) => cleanPlace(s)).filter((s): s is string => Boolean(s));
    if (parts.length >= 2) { city = parts[0]; country = parts[1]; }
    else if (parts.length === 1) { city = parts[0]; }
  }
  if (city && country && city.toLowerCase() === country.toLowerCase()) city = null;

  const role: Role = /solo founder|solo maker|indie hacker|indie/i.test(post) ? "Solo maker"
    : /motion/i.test(hay) ? "Motion designer" : /graphic design|illustrat/i.test(hay) ? "Graphic designer" : /product designer/i.test(hay) ? "Product designer" : /\bdesign/i.test(post) ? "Designer"
    : /marketer|marketing|growth|\bbd\b|partnerships/i.test(post) ? "Marketer" : /product manager|\bpm\b/i.test(hay) ? "Product manager" : /investor|angel|vc\b/i.test(post) ? "Investor"
    : /\b(developer|engineer|hacker|devops|coder|swe)\b/i.test(post) ? "Developer" : /founder|building|bootstrapp|shipping/i.test(post) ? "Founder" : "Founder";

  const lookingFor: LookingFor[] = [];
  if (/co-?founder|technical partner/i.test(post)) lookingFor.push("Cofounder");
  if (/feedback/i.test(post)) lookingFor.push("Feedback");
  if (/customers|clients|users|leads/i.test(post)) lookingFor.push("Customers");
  if (/(builders|indie hackers|founders|makers|people (shipping|building)|entrepreneurs|devs|developers|designers|marketers|indies)/i.test(post)) lookingFor.push("Founder friends");
  if (/coffee/i.test(post)) lookingFor.push("Coffee");
  const canHelpWith: HelpWith[] = role === "Marketer" ? ["Marketing"] : role === "Developer" ? ["Engineering"] : /design/i.test(role) ? ["Design"] : [];
  const interests = interestOptions.filter((t) => new RegExp(`(^|[^a-z])${escapeRe(t.toLowerCase())}(?![a-z])`).test(hay)).slice(0, 4);
  const projectMatch = post.match(/\b(?:growing|building|launched|shipping|working on|founder of|making|started)\s+(?:an?\s+|my\s+)?([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)?)\b(?!\s+(?:as|in|from|for|with))/);
  const project = projectMatch && !/^(I|We|My|Solo|Building|Currently|Software|Portfolio|Saas|Something|Cool)$/i.test(projectMatch[1]) ? projectMatch[1] : null;

  let confidence = 0.2;
  if (isIntro) confidence = 0.5;
  if (isIntro && (city || country)) confidence = 0.62;
  if (isIntro && city && country) confidence = 0.7;
  if (isIntro && ageOpener && (city || country)) confidence += 0.1;

  return {
    isIntro, city, country, origin, role,
    lookingFor: lookingFor.slice(0, 3), canHelpWith, interests, project, projectDescription: null, projects: project ? [{ name: project, description: "" }] : [], skills: [],
    confidence: Math.min(0.95, confidence), source: "rules",
  };
}

export async function extractPin(tweet: XTweet, user: XUser | undefined): Promise<Extracted> {
  if (llmSource() === "none") return rules(tweet, user);
  const input = [
    `POST (${tweet.created_at || "recent"}):\n${tweet.text}`,
    "",
    `PROFILE`,
    `name: ${user?.name || ""}`,
    `handle: @${user?.username || ""}`,
    `bio: ${user?.description || ""}`,
    `location field: ${user?.location || ""}`,
    `profile website: ${user?.entities?.url?.urls?.[0]?.expanded_url || user?.url || ""}`,
    `LINKS in the post: ${(tweet.links || []).join(" , ") || "none"}`,
    "",
    `ALLOWED roles: ${roleOptions.join(", ")}`,
    `ALLOWED interests: ${interestOptions.join(", ")}`,
  ].join("\n");
  const out = await structured({ system: SYSTEM, user: input, schema: Schema, maxTokens: 900, label: "extract" });
  if (!out) return rules(tweet, user);
  // Small models write "null"/"none" as text, or repeat the country in the city field.
  const blank = (v: string | null) => (!v || /^(null|none|n\/a|unknown|-)$/i.test(v.trim()) ? null : v.trim());
  out.city = blank(out.city); out.country = blank(out.country); out.origin = blank(out.origin); out.project = blank(out.project);
  if (out.city && out.country && out.city.toLowerCase() === out.country.toLowerCase()) out.city = null;
  if (out.origin && out.country && out.origin.toLowerCase() === out.country.toLowerCase()) out.origin = null;
  // Some models put the only place named into "origin" ("from India" with nothing else). That is where they are.
  if (!out.city && !out.country && out.origin) { out.country = out.origin; out.origin = null; }
  const pick = <T extends string>(value: string, options: readonly T[]): T | undefined => {
    const v = (value || "").trim().toLowerCase();
    if (v.length < 2) return undefined;
    return options.find((o) => o.toLowerCase() === v) ?? options.find((o) => v.includes(o.toLowerCase()) || o.toLowerCase().includes(v));
  };
  const roleText = out.role || "";
  const role = pick(roleText, roleOptions) ?? (/design/i.test(roleText) ? "Designer" : /dev|engineer|program/i.test(roleText) ? "Developer" : /market|growth/i.test(roleText) ? "Marketer" : "Founder");
  const stages = new Set(["Exploring", "Building", "Launched", "Growing"]);
  // A project needs a real name: not a link, not a generic word for "a company".
  const GENERIC = /^(a |an |my |our |the |new |side |secret |stealth )?(startup|start-up|company|business|project|side project|app|apps|product|tool|saas|agency|studio|newsletter|podcast|community|brand|website|platform|venture|idea|something|mvp|ai startup|ai app|ai tool|ai agent|ai agents|saas app|web app|mobile app|ios app)s?\.?$/i;
  const looksLikeName = (name: string) => name.length >= 2 && !/^(https?:\/\/|www\.|t\.co\/)/i.test(name) && !/\bt\.co\b/i.test(name) && !GENERIC.test(name.trim()) && !/^@/.test(name);
  const projects = (out.projects || [])
    .map((p) => ({ name: String(p.name || "").trim().slice(0, 80), description: String(p.description || "").trim().slice(0, 240), website: /^https?:\/\//i.test(String(p.website || "")) ? String(p.website).trim() : undefined, stage: stages.has(String(p.stage)) ? (p.stage as "Exploring" | "Building" | "Launched" | "Growing") : undefined }))
    .filter((p) => p.name && !/^(null|none|n\/a)$/i.test(p.name) && looksLikeName(p.name))
    .filter((p, i, arr) => arr.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i)
    .slice(0, 4);
  if (!projects.length && out.project && looksLikeName(out.project)) projects.push({ name: out.project, description: out.projectDescription || "", website: undefined, stage: undefined });
  return {
    ...out,
    projects,
    project: projects[0]?.name ?? out.project,
    projectDescription: projects[0]?.description || out.projectDescription,
    role,
    lookingFor: (out.lookingFor || []).map((v) => pick(v, lookingForOptions)).filter((v): v is LookingFor => Boolean(v)).slice(0, 3),
    canHelpWith: (out.canHelpWith || []).map((v) => pick(v, helpWithOptions)).filter((v): v is HelpWith => Boolean(v)),
    interests: (out.interests || []).filter((t) => allowedTags.has(t)).slice(0, 4),
    skills: (out.skills || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8),
    source: "claude",
  };
}
