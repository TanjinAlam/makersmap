import { normalizeHandle, suggestHandle } from "./handle";
import { safeHttpUrl } from "./http";

// Roles are grouped so the atlas filter stays to a handful of chips while
// makers can describe themselves precisely.
export const roleGroups = {
  Founders: ["Founder", "Cofounder", "Solo maker"],
  Developers: ["Developer", "Data & ML engineer", "Hardware engineer", "No-code builder", "Researcher"],
  Designers: ["Designer", "Product designer", "Motion designer", "Graphic designer", "Illustrator", "Brand designer"],
  Creators: ["Content creator", "Community builder", "Writer", "Video creator", "Podcaster"],
  Business: ["Product manager", "Marketer", "Growth", "Sales", "Operator", "Investor", "Consultant"],
} as const;
export type RoleGroup = keyof typeof roleGroups;
export type Role = (typeof roleGroups)[RoleGroup][number];
export const roleOptions: Role[] = (Object.keys(roleGroups) as RoleGroup[]).flatMap((group) => [...roleGroups[group]]);
export const roleGroupOptions: RoleGroup[] = ["Founders", "Developers", "Designers", "Creators", "Business"];
/** A fresh zeroed count per group, for tallies. */
export const emptyGroups = (): Record<RoleGroup, number> => ({ Founders: 0, Developers: 0, Designers: 0, Creators: 0, Business: 0 });

export function roleGroupOf(role: string): RoleGroup {
  for (const group of roleGroupOptions) {
    if ((roleGroups[group] as readonly string[]).includes(role)) return group;
  }
  return "Founders";
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roleOptions as string[]).includes(value);
}

export type LookingFor = "Cofounder" | "Feedback" | "Customers" | "Founder friends" | "Coffee";
export type HelpWith = "Engineering" | "Design" | "Marketing" | "Fundraising" | "Product" | "Motion & video" | "Branding" | "Sales" | "Operations" | "Hiring";
export type ProjectStage = "Exploring" | "Building" | "Launched" | "Growing";
export type MeetingPref = "Coffee" | "Remote chats" | "Local meetups";
export type RevenueKind = "self-reported" | "verified";
export type ConnectKind =
  | "X" | "LinkedIn" | "GitHub" | "Website" | "Dribbble" | "Behance" | "YouTube" | "Instagram"
  | "TikTok" | "Threads" | "Bluesky" | "Mastodon" | "Product Hunt" | "Indie Hackers" | "Substack" | "Medium"
  | "Twitch" | "Figma" | "Discord" | "Telegram" | "Reddit" | "Facebook" | "Other";
export const connectKinds: ConnectKind[] = [
  "X", "LinkedIn", "GitHub", "Website", "Dribbble", "Behance", "YouTube", "Instagram",
  "TikTok", "Threads", "Bluesky", "Mastodon", "Product Hunt", "Indie Hackers", "Substack", "Medium",
  "Twitch", "Figma", "Discord", "Telegram", "Reddit", "Facebook", "Other",
];
// Hostname patterns used to label a pasted link with the right network.
const linkHosts: [RegExp, ConnectKind][] = [
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)dribbble\.com$/, "Dribbble"],
  [/(^|\.)behance\.net$/, "Behance"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)bsky\.app$|(^|\.)bsky\.social$/, "Bluesky"],
  [/(^|\.)mastodon\.(social|online)$|(^|\.)mstdn\./, "Mastodon"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/(^|\.)indiehackers\.com$/, "Indie Hackers"],
  [/(^|\.)substack\.com$/, "Substack"],
  [/(^|\.)medium\.com$/, "Medium"],
  [/(^|\.)twitch\.tv$/, "Twitch"],
  [/(^|\.)figma\.com$/, "Figma"],
  [/(^|\.)discord\.(gg|com)$/, "Discord"],
  [/(^|\.)t\.me$|(^|\.)telegram\.me$/, "Telegram"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "Facebook"],
];
export const MAX_SKILLS = 8;
export const MAX_LINKS = 10;
export const MAX_SAMPLES = 6;

export type City = {
  city: string;
  country: string;
  flag: string;
  lat: number;
  lon: number;
  /** IANA time zone, used to show local time on a profile. */
  tz: string;
};

export type WorkSample = {
  label: string;
  url: string;
};

export type XListing = {
  userId: string;
  username: string;
  name: string;
  /** Full-size X profile image URL (the _400x400 variant). */
  avatarUrl?: string;
  bio?: string;
  location?: string;
  followers?: number;
  postId: string;
  postUrl: string;
  postText: string;
  postedAt: string;
  importedAt: string;
  /** 0-1, from the extractor. Low-confidence pins are held back from the map. */
  confidence?: number;
  /** "country" when the post only named a country; the pin sits at the country's centre. */
  placeLevel?: "city" | "country" | "none";
  /** Where they said they're from, when different from where they are ("from Brazil, based in Barcelona"). */
  origin?: string;
  /** Which reader filled in the pin. Rules-era pins get re-read once a model is configured. */
  extractor?: "rules" | "ai";
  /** Which of the sweep's query patterns found the post (index into QUERIES). */
  queryIndex?: number;
  /** The intro post stays pinned on the profile until the owner unpins it. */
  pinned?: boolean;
};

export type ConnectLink = {
  kind: ConnectKind;
  url: string;
};

export type RevenueInfo = {
  mrr: number | null;
  range?: string;
  kind: RevenueKind;
  updatedAt?: string;
};

export type LatestUpdate = {
  text: string;
  url?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  website?: string;
  /** One line, in plain words, that anyone gets before reading the summary. */
  tagline?: string;
  /** The site's icon, read from the website. Owners can replace it. */
  logo?: string;
  /** The site's preview image, when it has one. */
  image?: string;
  stage?: ProjectStage;
  color?: string;
  growth?: number;
  revenue?: RevenueInfo;
};

export type Maker = {
  id: number;
  name: string;
  city: string;
  country: string;
  flag: string;
  lat: number;
  lon: number;
  role: Role;
  tags: string[];
  /** Every project this maker is building. The single `project` fields mirror the first one. */
  projects: Project[];
  project: string;
  description: string;
  website: string;
  bio: string;
  lookingFor: LookingFor[];
  canHelpWith: HelpWith[];
  /** Tools and skills, e.g. "After Effects" or "Rust". */
  skills: string[];
  /** Every public link. `connect` mirrors the first one. */
  links: ConnectLink[];
  /** Portfolio pieces, showreels, case studies. */
  workSamples: WorkSample[];
  timezone?: string;
  joinedAt?: string;
  /** ISO date the maker last said "I'm up for coffee this week". Valid for 7 days. */
  coffeeWeek?: string;
  /** Private. Collected at claim or join, never shown on the site or returned by the public API. */
  email?: string;
  /** Weekly "who looked at your pin" email. On by default when there's an email; the owner can turn it off. */
  emailUpdates?: boolean;
  /** Private. Issued once to people who join without X; proves ownership on later edits. */
  editKey?: string;
  /** Indexed lookup keys derived from city and country (see citySlug/countrySlug). */
  cityKey?: string;
  countryKey?: string;
  /** Present when the pin was listed from a public X intro post. */
  x?: XListing;
  /** Hidden pins stay in the database (audit trail) but never render or list. */
  hidden?: boolean;
  /** Secret in the claim link sent to a listed maker. */
  claimToken?: string;
  /** X user id of whoever claimed the pin through sign-in. */
  claimedBy?: string;
  /** Handle of the maker whose invite link brought this person in. */
  invitedBy?: string;
  /** Imported pins the extractor wasn't sure about wait here for a human yes or no. */
  review?: "pending" | "approved" | "rejected" | "removed";
  stage?: ProjectStage;
  connect?: ConnectLink;
  revenue?: RevenueInfo;
  latestUpdate?: LatestUpdate;
  openToMeeting: MeetingPref[];
  coffee: boolean;
  mrr: number | null;
  growth: number;
  color: string;
  avatar: string;
  initials: string;
  update: string;
  need: string;
  offer: string;
  handle?: string;
  claimed?: boolean;
  source?: "demo" | "x-intro" | "self";
};

export const lookingForOptions: LookingFor[] = [
  "Cofounder",
  "Feedback",
  "Customers",
  "Founder friends",
  "Coffee",
];

export const helpWithOptions: HelpWith[] = [
  "Engineering",
  "Design",
  "Motion & video",
  "Branding",
  "Product",
  "Marketing",
  "Sales",
  "Fundraising",
  "Operations",
  "Hiring",
];

export const stageOptions: ProjectStage[] = [
  "Exploring",
  "Building",
  "Launched",
  "Growing",
];

export const meetingOptions: MeetingPref[] = [
  "Coffee",
  "Remote chats",
  "Local meetups",
];

export const interestOptions = [
  "SaaS",
  "AI",
  "Design",
  "Motion",
  "Branding",
  "Video",
  "Devtools",
  "Open source",
  "No-code",
  "Hardware",
  "E-commerce",
  "Fintech",
  "Creator economy",
  "Community",
  "Marketing",
];

export const cities: City[] = [
  { city: "Warsaw", country: "Poland", flag: "🇵🇱", lat: 52.23, lon: 21.01, tz: "Europe/Warsaw" },
  { city: "Berlin", country: "Germany", flag: "🇩🇪", lat: 52.52, lon: 13.4, tz: "Europe/Berlin" },
  { city: "Paris", country: "France", flag: "🇫🇷", lat: 48.86, lon: 2.35, tz: "Europe/Paris" },
  { city: "London", country: "United Kingdom", flag: "🇬🇧", lat: 51.51, lon: -0.12, tz: "Europe/London" },
  { city: "Amsterdam", country: "Netherlands", flag: "🇳🇱", lat: 52.37, lon: 4.9, tz: "Europe/Amsterdam" },
  { city: "Stockholm", country: "Sweden", flag: "🇸🇪", lat: 59.33, lon: 18.06, tz: "Europe/Stockholm" },
  { city: "Lisbon", country: "Portugal", flag: "🇵🇹", lat: 38.72, lon: -9.14, tz: "Europe/Lisbon" },
  { city: "Prague", country: "Czechia", flag: "🇨🇿", lat: 50.08, lon: 14.44, tz: "Europe/Prague" },
  { city: "Copenhagen", country: "Denmark", flag: "🇩🇰", lat: 55.68, lon: 12.57, tz: "Europe/Copenhagen" },
  { city: "Milan", country: "Italy", flag: "🇮🇹", lat: 45.46, lon: 9.19, tz: "Europe/Rome" },
  { city: "Barcelona", country: "Spain", flag: "🇪🇸", lat: 41.39, lon: 2.17, tz: "Europe/Madrid" },
  { city: "Tallinn", country: "Estonia", flag: "🇪🇪", lat: 59.44, lon: 24.75, tz: "Europe/Tallinn" },
  { city: "San Francisco", country: "United States", flag: "🇺🇸", lat: 37.77, lon: -122.42, tz: "America/Los_Angeles" },
  { city: "New York", country: "United States", flag: "🇺🇸", lat: 40.71, lon: -74.01, tz: "America/New_York" },
  { city: "São Paulo", country: "Brazil", flag: "🇧🇷", lat: -23.55, lon: -46.63, tz: "America/Sao_Paulo" },
  { city: "Tokyo", country: "Japan", flag: "🇯🇵", lat: 35.68, lon: 139.69, tz: "Asia/Tokyo" },
  { city: "Sydney", country: "Australia", flag: "🇦🇺", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" },
  { city: "Toronto", country: "Canada", flag: "🇨🇦", lat: 43.65, lon: -79.38, tz: "America/Toronto" },
  { city: "Singapore", country: "Singapore", flag: "🇸🇬", lat: 1.35, lon: 103.82, tz: "Asia/Singapore" },
  { city: "Seoul", country: "South Korea", flag: "🇰🇷", lat: 37.57, lon: 126.98, tz: "Asia/Seoul" },
  { city: "Lagos", country: "Nigeria", flag: "🇳🇬", lat: 6.52, lon: 3.38, tz: "Africa/Lagos" },
  { city: "Nairobi", country: "Kenya", flag: "🇰🇪", lat: -1.29, lon: 36.82, tz: "Africa/Nairobi" },
  { city: "Mexico City", country: "Mexico", flag: "🇲🇽", lat: 19.43, lon: -99.13, tz: "America/Mexico_City" },
  { city: "Dubai", country: "United Arab Emirates", flag: "🇦🇪", lat: 25.2, lon: 55.27, tz: "Asia/Dubai" },
  { city: "Austin", country: "United States", flag: "🇺🇸", lat: 30.27, lon: -97.74, tz: "America/Chicago" },
  { city: "Los Angeles", country: "United States", flag: "🇺🇸", lat: 34.05, lon: -118.24, tz: "America/Los_Angeles" },
  { city: "Chicago", country: "United States", flag: "🇺🇸", lat: 41.88, lon: -87.63, tz: "America/Chicago" },
  { city: "Miami", country: "United States", flag: "🇺🇸", lat: 25.76, lon: -80.19, tz: "America/New_York" },
  { city: "Seattle", country: "United States", flag: "🇺🇸", lat: 47.61, lon: -122.33, tz: "America/Los_Angeles" },
  { city: "Boston", country: "United States", flag: "🇺🇸", lat: 42.36, lon: -71.06, tz: "America/New_York" },
  { city: "Denver", country: "United States", flag: "🇺🇸", lat: 39.74, lon: -104.99, tz: "America/Denver" },
  { city: "Vancouver", country: "Canada", flag: "🇨🇦", lat: 49.28, lon: -123.12, tz: "America/Vancouver" },
  { city: "Montreal", country: "Canada", flag: "🇨🇦", lat: 45.5, lon: -73.57, tz: "America/Toronto" },
  { city: "Madrid", country: "Spain", flag: "🇪🇸", lat: 40.42, lon: -3.7, tz: "Europe/Madrid" },
  { city: "Porto", country: "Portugal", flag: "🇵🇹", lat: 41.15, lon: -8.61, tz: "Europe/Lisbon" },
  { city: "Dublin", country: "Ireland", flag: "🇮🇪", lat: 53.35, lon: -6.26, tz: "Europe/Dublin" },
  { city: "Munich", country: "Germany", flag: "🇩🇪", lat: 48.14, lon: 11.58, tz: "Europe/Berlin" },
  { city: "Vienna", country: "Austria", flag: "🇦🇹", lat: 48.21, lon: 16.37, tz: "Europe/Vienna" },
  { city: "Zurich", country: "Switzerland", flag: "🇨🇭", lat: 47.38, lon: 8.54, tz: "Europe/Zurich" },
  { city: "Bangalore", country: "India", flag: "🇮🇳", lat: 12.97, lon: 77.59, tz: "Asia/Kolkata" },
  { city: "Bengaluru", country: "India", flag: "🇮🇳", lat: 12.97, lon: 77.59, tz: "Asia/Kolkata" },
  { city: "Mumbai", country: "India", flag: "🇮🇳", lat: 19.08, lon: 72.88, tz: "Asia/Kolkata" },
  { city: "Melbourne", country: "Australia", flag: "🇦🇺", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" },
];

export function citySlug(city: string): string {
  return city.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const countrySlug = citySlug;

/** "Barcelona, Spain" for a city pin, or just "India" for a country-level pin. */
/** True when the pin has somewhere to sit on the map. Unplaced pins still appear in lists and search. */
export function isPlaced(maker: Pick<Maker, "city" | "country" | "lat" | "lon">): boolean {
  return Boolean((maker.city || maker.country) && !(maker.lat === 0 && maker.lon === 0));
}

/** Where they are, or "Location unknown" for pins whose post and profile named no place. */
export function placeLabel(maker: Pick<Maker, "city" | "country">): string {
  return whereOf(maker) || "Location unknown";
}

export function whereOf(maker: Pick<Maker, "city" | "country">): string {
  if (maker.city && maker.country && maker.city.toLowerCase() !== maker.country.toLowerCase()) return `${maker.city}, ${maker.country}`;
  return maker.country || maker.city || "";
}

export function cityFromSlug(slug: string): City | undefined {
  return cities.find((c) => citySlug(c.city) === slug);
}

export function isCoffeeThisWeek(maker: Pick<Maker, "coffeeWeek">, now = new Date()): boolean {
  if (!maker.coffeeWeek) return false;
  const since = new Date(maker.coffeeWeek).getTime();
  return Number.isFinite(since) && now.getTime() - since < 7 * 24 * 60 * 60 * 1000;
}

export function cityTimezone(city: string): string | undefined {
  return cities.find((c) => c.city.toLowerCase() === city.toLowerCase())?.tz;
}

export function normalizeLink(value: Partial<ConnectLink> | null | undefined): ConnectLink | null {
  const url = safeHttpUrl(value?.url);
  if (!url) return null;
  const host = url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
  const byHost = linkHosts.find(([pattern]) => pattern.test(host))?.[1];
  const guessed: ConnectKind = byHost
    ?? (value?.kind && connectKinds.includes(value.kind) && value.kind !== "Other" ? value.kind : "Website");
  return { kind: guessed, url };
}

export function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const skill = raw.trim().replace(/\s+/g, " ").slice(0, 32);
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

export type Completeness = { score: number; missing: string[] };

// What a strong profile has, weighted by how much it helps someone decide to say hello.
export function profileCompleteness(maker: Maker): Completeness {
  const checks: [number, boolean, string][] = [
    [15, Boolean(maker.bio.trim()), "a short bio"],
    [20, maker.lookingFor.length > 0, "what you're looking for"],
    [15, maker.canHelpWith.length > 0, "what you can help with"],
    [10, maker.skills.length > 0, "skills and tools"],
    [10, maker.links.length > 0, "a link people can reach you on"],
    [10, Boolean(maker.projects[0]?.description), "a sentence about your project"],
    [5, Boolean(maker.projects[0]?.website), "your project's website"],
    [5, maker.openToMeeting.length > 0, "how you like to meet"],
    [5, Boolean(maker.latestUpdate?.text), "a latest update"],
    [5, Boolean(maker.avatar), "a photo"],
  ];
  const score = checks.reduce((sum, [weight, ok]) => sum + (ok ? weight : 0), 0);
  return { score, missing: checks.filter(([, ok]) => !ok).map(([, , label]) => label) };
}

/** The maker's X username, from the import record, their links, or their connect link. */
export function xHandleOf(maker: Pick<Maker, "x" | "links" | "connect">): string | undefined {
  if (maker.x?.username) return maker.x.username;
  const fromLink = [...(maker.links || []), ...(maker.connect ? [maker.connect] : [])]
    .map((link) => link.url.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i)?.[1])
    .find(Boolean);
  return fromLink || undefined;
}

export function xProfileUrl(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}

/** Opens X's message composer. With a numeric user id it targets the DM directly; otherwise the profile. */
export function xMessageUrl(maker: Pick<Maker, "x" | "links" | "connect">, text: string): string | undefined {
  const handle = xHandleOf(maker);
  if (!handle) return undefined;
  if (maker.x?.userId && /^\d+$/.test(maker.x.userId)) {
    return `https://x.com/messages/compose?recipient_id=${maker.x.userId}&text=${encodeURIComponent(text)}`;
  }
  return xProfileUrl(handle);
}

export function lookingForText(items: LookingFor[]): string {
  return items.join(" · ");
}

export function helpWithText(items: HelpWith[]): string {
  return items.join(" · ");
}

export function isOpenToCoffee(maker: Pick<Maker, "lookingFor" | "openToMeeting" | "coffee">): boolean {
  return maker.coffee || maker.lookingFor.includes("Coffee") || maker.openToMeeting.includes("Coffee");
}

/** Open to hearing from people, online at least. "Looking to connect" counts. */
export function isOpenToConnect(maker: Pick<Maker, "lookingFor" | "openToMeeting" | "coffee">): boolean {
  return (
    maker.openToMeeting.length > 0 ||
    isOpenInPerson(maker) ||
    maker.lookingFor.some((need) => need === "Founder friends" || need === "Coffee" || need === "Cofounder")
  );
}

export function isOpenInPerson(maker: Pick<Maker, "lookingFor" | "openToMeeting" | "coffee">): boolean {
  return (
    isOpenToCoffee(maker) ||
    maker.openToMeeting.includes("Local meetups")
  );
}

export function formatRevenueDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function extractLookingFor(update: string, coffee: boolean): LookingFor[] {
  const text = update.toLowerCase();
  const found: LookingFor[] = [];
  if (/looking for|would love|feedback welcome|accessibility feedback|pain points|try it/.test(text)) {
    found.push("Feedback");
  }
  if (/hang out|friends this weekend|community members|welcome community/.test(text)) {
    found.push("Founder friends");
  }
  if (/customers|tiny teams|inbox/.test(text)) found.push("Customers");
  if (coffee || /coffee/.test(text)) found.push("Coffee");
  return found.slice(0, 3);
}

export function extractHelp(role: Role, tags: string[]): HelpWith[] {
  const group = roleGroupOf(role);
  if (role === "Motion designer") return ["Motion & video", "Design"];
  if (role === "Graphic designer" || role === "Brand designer" || role === "Illustrator") return ["Branding", "Design"];
  if (role === "Product manager") return ["Product"];
  if (role === "Sales") return ["Sales"];
  if (role === "Investor") return ["Fundraising"];
  if (role === "Operator") return ["Operations"];
  if (role === "Marketer" || role === "Growth" || role === "Content creator") return ["Marketing"];
  if (group === "Designers" || tags.includes("Design") || tags.includes("Product design")) return ["Design"];
  if (group === "Developers" || tags.includes("Devtools") || tags.includes("Open source")) return ["Engineering"];
  if (tags.includes("Marketing")) return ["Marketing"];
  return [];
}

export function extractStage(update: string, mrr: number | null): ProjectStage | undefined {
  const text = update.toLowerCase();
  if (/first look|prototype|building slowly/.test(text) && mrr === null) return "Exploring";
  if (mrr === null) return /shipped|released|launched/.test(text) ? "Launched" : "Building";
  if (mrr >= 8000) return "Growing";
  return "Launched";
}

export function projectId(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "project";
}

// Ids are URL segments, so two projects with the same name get -2, -3, and so on.
export function dedupeProjectIds(projects: Project[]): Project[] {
  const seen = new Map<string, number>();
  return projects.map((project) => {
    const base = project.id || projectId(project.name);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? { ...project, id: base } : { ...project, id: `${base}-${count}` };
  });
}

export function normalizeProject(value: Partial<Project> & Pick<Project, "name">): Project {
  const mrr = value.revenue?.mrr ?? null;
  return {
    id: value.id || projectId(value.name),
    name: value.name.trim(),
    description: (value.description || "").trim(),
    tagline: (value.tagline || "").trim().slice(0, 120) || undefined,
    website: safeHttpUrl(value.website),
    logo: safeHttpUrl(value.logo) || undefined,
    image: safeHttpUrl(value.image) || undefined,
    stage: value.stage,
    color: value.color,
    growth: typeof value.growth === "number" && value.growth !== 0 ? value.growth : undefined,
    revenue: value.revenue && (mrr !== null || value.revenue.range)
      ? { mrr, range: value.revenue.range, kind: value.revenue.kind === "verified" ? "verified" : "self-reported", updatedAt: value.revenue.updatedAt }
      : undefined,
  };
}

// Sum of every project's MRR, or null when nobody reports revenue.
export function makerMrr(maker: Pick<Maker, "projects">): number | null {
  const values = maker.projects.map((p) => p.revenue?.mrr).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

export function normalizeMaker(value: Partial<Maker> & Pick<Maker, "id" | "name" | "city" | "lat" | "lon">): Maker {
  const lookingFor = Array.isArray(value.lookingFor) ? value.lookingFor.slice(0, 3) : [];
  const canHelpWith = Array.isArray(value.canHelpWith) ? value.canHelpWith : [];
  const openToMeeting = Array.isArray(value.openToMeeting) ? value.openToMeeting : [];
  const tags = Array.isArray(value.tags) ? value.tags : [];
  const coffee = Boolean(value.coffee) || lookingFor.includes("Coffee") || openToMeeting.includes("Coffee");

  // Projects are the source of truth. Records written before the list existed
  // only have the single-project fields, so build the list from those; the
  // single fields then mirror the first project so older screens keep working.
  const listed = Array.isArray(value.projects) ? value.projects.filter((p) => p && typeof p.name === "string" && p.name.trim()) : [];
  const projects: Project[] = dedupeProjectIds(listed.length
    ? listed.map((p) => normalizeProject(p))
    : value.project
      ? [normalizeProject({
          name: value.project,
          description: value.description,
          website: value.website,
          stage: value.stage,
          color: value.color,
          growth: value.growth,
          revenue: value.revenue ?? (typeof value.mrr === "number" ? { mrr: value.mrr, kind: "self-reported" } : undefined),
        })]
      : []);
  const primary = projects[0];
  const links = (Array.isArray(value.links) && value.links.length ? value.links : value.connect ? [value.connect] : [])
    .map(normalizeLink)
    .filter((link): link is ConnectLink => Boolean(link))
    .filter((link, index, all) => all.findIndex((other) => other.url === link.url) === index)
    .slice(0, MAX_LINKS);
  const workSamples = (Array.isArray(value.workSamples) ? value.workSamples : [])
    .map((sample) => ({ label: (sample?.label || "").trim().slice(0, 60), url: safeHttpUrl(sample?.url) }))
    .filter((sample) => sample.url)
    .map((sample) => ({ ...sample, label: sample.label || sample.url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] }))
    .slice(0, MAX_SAMPLES);

  return {
    id: value.id,
    name: value.name,
    city: value.city,
    country: value.country || "",
    flag: value.flag || "",
    lat: value.lat,
    lon: value.lon,
    role: isRole(value.role) ? value.role : "Founder",
    tags,
    projects,
    project: primary?.name || "",
    description: primary?.description || value.description || "",
    website: primary?.website || "",
    bio: value.bio || "",
    lookingFor,
    canHelpWith,
    skills: normalizeSkills(value.skills),
    links,
    workSamples,
    timezone: value.timezone || cityTimezone(value.city),
    joinedAt: value.joinedAt,
    coffeeWeek: value.coffeeWeek,
    email: typeof value.email === "string" && value.email.includes("@") ? value.email.trim().toLowerCase().slice(0, 120) : undefined,
    emailUpdates: value.emailUpdates,
    editKey: typeof value.editKey === "string" ? value.editKey : undefined,
    cityKey: citySlug(value.city),
    countryKey: countrySlug(value.country || ""),
    x: value.x,
    hidden: Boolean(value.hidden),
    claimToken: value.claimToken,
    claimedBy: value.claimedBy,
    invitedBy: normalizeHandle(value.invitedBy) || undefined,
    review: value.review,
    stage: primary?.stage ?? value.stage,
    connect: links[0],
    revenue: primary?.revenue,
    latestUpdate: value.latestUpdate,
    openToMeeting,
    coffee,
    mrr: primary?.revenue?.mrr ?? null,
    growth: primary?.growth ?? value.growth ?? 0,
    color: primary?.color || value.color || "#24352c",
    avatar: value.avatar || "",
    initials:
      value.initials ||
      value.name
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    update: value.latestUpdate?.text || value.update || "",
    need: lookingForText(lookingFor),
    offer: helpWithText(canHelpWith),
    handle:
      normalizeHandle(value.handle) ||
      normalizeHandle(value.connect?.url?.match(/x\.com\/([^/?#]+)/i)?.[1]) ||
      (value.name ? suggestHandle(value.name) : "") ||
      undefined,
    claimed: Boolean(value.claimed),
    source: value.source || (value.claimed ? "self" : "demo"),
  };
}

/** What the avatar needs, so list pages don't ship whole records to the client. */
export function avatarOf(maker: Maker): Pick<Maker, "avatar" | "color" | "initials"> {
  return { avatar: maker.avatar, color: maker.color, initials: maker.initials };
}

/**
 * The record as the public site may see it. Claim tokens and review state never
 * leave the server, and the X listing keeps only what the profile page shows.
 */
export function publicMaker(maker: Maker): Maker {
  const { claimToken: _token, review: _review, email: _email, emailUpdates: _updates, editKey: _key, claimedBy: _by, cityKey: _ck, countryKey: _cok, ...rest } = maker;
  const x = maker.x
    ? { userId: maker.x.userId, username: maker.x.username, name: maker.x.name, postId: maker.x.postId, postUrl: maker.x.postUrl, postText: maker.x.postText, postedAt: maker.x.postedAt, importedAt: maker.x.importedAt, placeLevel: maker.x.placeLevel, origin: maker.x.origin, pinned: maker.x.pinned }
    : undefined;
  return { ...rest, x };
}

/** False for country-level pins (the post only named a country), which must not count as a city. */
export function hasCity(maker: Maker): boolean {
  if (maker.x?.placeLevel === "country") return false;
  return Boolean(maker.city) && maker.city.trim().toLowerCase() !== (maker.country || "").trim().toLowerCase();
}
