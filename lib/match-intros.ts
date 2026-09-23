import { z } from "zod/v4";
import { llmSource, structured } from "./llm";
import { isMongoConfigured, withDb } from "@/db";
import { whereOf, type Maker } from "@/app/profile";
import type { Match } from "./matching";

const IntroSchema = z.object({
  intros: z.array(z.object({
    handle: z.string(),
    intro: z.string(),
    theirIntro: z.string(),
  })),
});

export type Intro = { intro: string; theirIntro: string };

const SYSTEM = `You write one-line introductions for a community atlas of makers, founders, designers, and developers.
Given a maker and a few people they've been matched with, write two sentences per match:
- "intro": why the maker should talk to this match, addressed to the maker as "you", naming the match by first name.
- "theirIntro": the same pairing from the match's side, addressed to the match as "you", naming the maker by first name. Say what the match gets out of it.
Rules: be concrete and use details from both profiles (projects, what they're looking for, what they can help with, city, skills). Never invent facts.
Warm and direct, no hype, no exclamation marks, no emojis, under 30 words each.`;

function describe(maker: Maker): string {
  const lines = [
    `Name: ${maker.name} (@${maker.handle})`,
    `Role: ${maker.role} in ${whereOf(maker)}`,
    maker.bio ? `Bio: ${maker.bio}` : "",
    maker.projects.length ? `Projects: ${maker.projects.map((p) => `${p.name}${p.description ? ` (${p.description})` : ""}${p.stage ? `, ${p.stage}` : ""}`).join("; ")}` : "",
    maker.lookingFor.length ? `Looking for: ${maker.lookingFor.join(", ")}` : "",
    maker.canHelpWith.length ? `Can help with: ${maker.canHelpWith.join(", ")}` : "",
    maker.skills.length ? `Skills: ${maker.skills.join(", ")}` : "",
    maker.tags.length ? `Interests: ${maker.tags.join(", ")}` : "",
    maker.openToMeeting.length ? `Open to: ${maker.openToMeeting.join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinReasons(reasons: string[]): string {
  const [first, second] = reasons;
  if (!first) return "";
  return second ? `${sentence(first)}, and ${second}.` : `${sentence(first)}.`;
}

function fallbackIntro(match: Match, makerFirst: string): Intro {
  return {
    intro: joinReasons(match.reasons) || "Worth a hello.",
    theirIntro: joinReasons(match.theirReasons) || `${makerFirst} would enjoy hearing what you're working on.`,
  };
}

// Cache per (maker, match set) so a profile view doesn't cost an API call every
// time: in memory for this process, and in MongoDB so it survives restarts and
// is shared across workers. Intros only change when the match set changes.
const cache = new Map<string, { at: number; intros: Map<string, Intro> }>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
type StoredIntros = { _id: string; at: number; intros: { handle: string; intro: string; theirIntro: string }[] };

async function loadStored(key: string): Promise<Map<string, Intro> | null> {
  if (!isMongoConfigured()) return null;
  try {
    const doc = await withDb((db) => db.collection<StoredIntros>("intro_cache").findOne({ _id: key }));
    if (!doc || Date.now() - doc.at > TTL_MS) return null;
    return new Map(doc.intros.map((i) => [i.handle, { intro: i.intro, theirIntro: i.theirIntro }]));
  } catch { return null; }
}

async function store(key: string, intros: Map<string, Intro>): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    const doc: StoredIntros = { _id: key, at: Date.now(), intros: [...intros].map(([handle, i]) => ({ handle, ...i })) };
    await withDb((db) => db.collection<StoredIntros>("intro_cache").updateOne({ _id: key }, { $set: doc }, { upsert: true }));
  } catch { /* a cache miss next time is fine */ }
}

export async function writeIntros(maker: Maker, matches: Match[]): Promise<{ intros: Map<string, Intro>; source: "claude" | "rules" }> {
  const makerFirst = maker.name.split(" ")[0];
  const rules = new Map(matches.map((m) => [m.maker.handle || String(m.maker.id), fallbackIntro(m, makerFirst)]));
  if (llmSource() === "none" || matches.length === 0) return { intros: rules, source: "rules" };

  const cacheKey = `${maker.handle}:${matches.map((m) => m.maker.handle).join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return { intros: hit.intros, source: "claude" };
  const stored = await loadStored(cacheKey);
  if (stored) { cache.set(cacheKey, { at: Date.now(), intros: stored }); return { intros: stored, source: "claude" }; }

  const prompt = [
    "MAKER",
    describe(maker),
    "",
    "MATCHES",
    ...matches.map((m, i) => `--- match ${i + 1} ---\n${describe(m.maker)}\nWhy matched: ${m.reasons.join("; ") || "shared interests"}`),
  ].join("\n");
  const out = await structured({ system: SYSTEM, user: prompt, schema: IntroSchema, maxTokens: 2000, label: "intros" });
  if (!out) return { intros: rules, source: "rules" };
  const intros = new Map(rules);
  for (const item of out.intros) {
    const key = item.handle.replace(/^@/, "");
    const previous = intros.get(key) || { intro: "", theirIntro: "" };
    intros.set(key, {
      intro: item.intro.trim() || previous.intro,
      theirIntro: item.theirIntro.trim() || previous.theirIntro,
    });
  }
  cache.set(cacheKey, { at: Date.now(), intros });
  await store(cacheKey, intros);
  return { intros, source: "claude" };
}
