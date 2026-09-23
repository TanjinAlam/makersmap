const RESERVED = new Set([
  "about",
  "admin",
  "api",
  "app",
  "atlas",
  "auth",
  "dispatches",
  "explore",
  "favicon",
  "feed",
  "help",
  "join",
  "login",
  "m",
  "makersmap",
  "me",
  "projects",
  "public",
  "robots",
  "signup",
  "sitemap",
  "static",
  "support",
  "www",
]);

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

function foldLatin(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeHandle(value?: string | null): string {
  return foldLatin(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, HANDLE_MAX);
}

export function suggestHandle(name: string): string {
  const first = normalizeHandle(foldLatin(name).split(/\s+/)[0] || "");
  const full = normalizeHandle(foldLatin(name).replace(/\s+/g, ""));
  const base = first.length >= HANDLE_MIN ? first : full;
  if (base.length >= HANDLE_MIN) return base.slice(0, HANDLE_MAX);
  return ("maker" + (base || "pin")).slice(0, HANDLE_MAX);
}

export function uniqueHandleFromName(name: string, used: Set<string>): string {
  const candidates = [
    suggestHandle(name),
    normalizeHandle(foldLatin(name).replace(/\s+/g, "")),
  ];

  for (const candidate of candidates) {
    if (candidate.length >= HANDLE_MIN && !used.has(candidate) && !RESERVED.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const base = (candidates.find((value) => value.length >= HANDLE_MIN) || "maker").slice(0, HANDLE_MAX - 2);
  let n = 2;
  let next = `${base}${n}`;
  while (used.has(next) || RESERVED.has(next) || next.length < HANDLE_MIN) {
    n += 1;
    next = `${base}${n}`.slice(0, HANDLE_MAX);
  }
  used.add(next);
  return next;
}

export function handleError(value: string): string | null {
  const slug = normalizeHandle(value);
  if (!slug) return "Pick a public handle so people can find you.";
  if (slug.length < HANDLE_MIN) return "Use at least 3 characters.";
  if (!HANDLE_PATTERN.test(slug)) return "Letters, numbers, and underscores only.";
  if (RESERVED.has(slug)) return "That handle is reserved.";
  return null;
}

export function isReservedHandle(value: string): boolean {
  return RESERVED.has(normalizeHandle(value));
}

export function profilePath(handle: string): string {
  return `/m/${normalizeHandle(handle)}`;
}

export function projectPath(handle: string, projectId: string): string {
  return `${profilePath(handle)}/${encodeURIComponent(projectId)}`;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
