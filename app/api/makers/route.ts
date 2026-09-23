import { z } from "zod";
import { handleError, normalizeHandle } from "@/app/handle";
import { isMongoConfigured } from "@/db";
import { getMakerById as findMakerById, listMakers, upsertClaimedMaker } from "@/db/makers";
import { connectKinds, helpWithOptions, MAX_LINKS, MAX_SAMPLES, MAX_SKILLS, normalizeMaker, normalizeProject, roleOptions, type Maker } from "@/app/profile";
import { dotView, publicCache } from "@/lib/tiers";
import { readSession } from "@/lib/session";
import { withDb } from "@/db";
import { MAKERS_COLLECTION } from "@/db/makers";

function newEditKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The atlas payload is the "dot" tier: visible makers, no secrets, no long text.
function atlasView(makers: Maker[]) {
  return makers.filter((m) => !m.hidden).map(dotView);
}
const atlasHeaders = publicCache;

const roles = roleOptions as [(typeof roleOptions)[number], ...(typeof roleOptions)[number][]];
const helps = helpWithOptions as [(typeof helpWithOptions)[number], ...(typeof helpWithOptions)[number][]];

const makerInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().max(80).optional(),
  flag: z.string().trim().max(8).optional(),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  role: z.enum(roles).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  project: z.string().trim().max(80).optional(),
  description: z.string().trim().max(240).optional(),
  website: z.string().trim().max(240).optional(),
  bio: z.string().trim().max(600).optional(),
  lookingFor: z.array(z.enum(["Cofounder", "Feedback", "Customers", "Founder friends", "Coffee"])).max(3).optional(),
  canHelpWith: z.array(z.enum(helps)).optional(),
  stage: z.enum(["Exploring", "Building", "Launched", "Growing"]).optional(),
  connect: z.object({
    kind: z.enum(connectKinds as [(typeof connectKinds)[number], ...(typeof connectKinds)[number][]]),
    url: z.string().trim().min(1).max(240),
  }).optional(),
  links: z.array(z.object({
    kind: z.enum(connectKinds as [(typeof connectKinds)[number], ...(typeof connectKinds)[number][]]).optional(),
    url: z.string().trim().min(1).max(240),
  })).max(MAX_LINKS).optional(),
  skills: z.array(z.string().trim().min(1).max(32)).max(MAX_SKILLS).optional(),
  workSamples: z.array(z.object({
    label: z.string().trim().max(60).optional(),
    url: z.string().trim().min(1).max(240),
  })).max(MAX_SAMPLES).optional(),
  openToMeeting: z.array(z.enum(["Coffee", "Remote chats", "Local meetups"])).optional(),
  latestUpdate: z.object({
    text: z.string().trim().min(1).max(400),
    url: z.string().trim().max(240).optional(),
  }).optional(),
  coffee: z.boolean().optional(),
  color: z.string().trim().max(32).optional(),
  avatar: z.string().max(400).optional(),
  handle: z.string().trim().min(3).max(32),
  projects: z.array(z.object({
    id: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).optional(),
    website: z.string().trim().max(240).optional(),
    logo: z.string().trim().max(400).optional(),
    image: z.string().trim().max(400).optional(),
    tagline: z.string().trim().max(120).optional(),
    stage: z.enum(["Exploring", "Building", "Launched", "Growing"]).optional(),
    color: z.string().trim().max(32).optional(),
    growth: z.number().gte(-100).lte(10000).optional(),
    revenue: z.object({
      mrr: z.number().gte(0).lte(100000000).nullable().optional(),
      range: z.string().trim().max(40).optional(),
      updatedAt: z.string().trim().max(40).optional(),
    }).optional(),
  })).max(8).optional(),
  claimed: z.boolean().optional(),
  source: z.enum(["demo", "x-intro", "self"]).optional(),
  coffeeWeek: z.string().trim().max(40).nullable().optional(),
  invitedBy: z.string().trim().max(32).optional(),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  if (!isMongoConfigured()) {
    return Response.json(
      { error: "MongoDB is not configured. Set MONGODB_URI first.", makers: [] },
      { status: 503 }
    );
  }

  try {
    return Response.json({ makers: atlasView(await listMakers()) }, { headers: atlasHeaders });
  } catch (error) {
    return Response.json({ error: errorMessage(error), makers: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return Response.json(
      { error: "MongoDB is not configured. Set MONGODB_URI first." },
      { status: 503 }
    );
  }

  try {
    const payload = makerInputSchema.parse(await request.json());
    const formatError = handleError(payload.handle);
    if (formatError) {
      return Response.json({ error: formatError }, { status: 400 });
    }

    // Who is allowed to write this record: the X account that owns it, or the
    // holder of the edit key issued when the pin was created without X.
    const session = await readSession(request);
    const editKey = request.headers.get("x-edit-key") || "";
    const targetHandle = normalizeHandle(payload.handle);
    const existing = await withDb((db) => db.collection<Maker>(MAKERS_COLLECTION).findOne(
      payload.id && payload.id !== 100 ? { $or: [{ id: payload.id }, { handle: targetHandle }] } : { handle: targetHandle },
    ));
    if (existing) {
      const ownsByX = Boolean(session && (existing.claimedBy === session.xUserId || existing.x?.userId === session.xUserId));
      const ownsByKey = Boolean(existing.editKey && editKey && sameKey(existing.editKey, editKey));
      if (!ownsByX && !ownsByKey) {
        return Response.json({ error: existing.source === "x-intro" && !existing.claimed ? "That pin is listed from X. Claim it with Sign in with X to edit it." : "You don't own this pin." }, { status: 403 });
      }
      if (existing.id !== payload.id && payload.id && payload.id !== 100) return Response.json({ error: "That handle belongs to someone else." }, { status: 409 });
    } else if (session && normalizeHandle(session.username) !== targetHandle) {
      // Signed in with X: the pin is created under that account's handle, so nobody can squat someone else's.
      return Response.json({ error: `Signed in as @${session.username}; use that handle or sign out to join by hand.` }, { status: 403 });
    }
    const issuedKey = !existing && !session ? newEditKey() : undefined;

    // Revenue typed in by a maker is self-reported by definition; stamp it here.
    const today = new Date().toISOString().slice(0, 10);
    const projects = payload.projects?.map((project) => normalizeProject({
      ...project,
      revenue: project.revenue && project.revenue.mrr != null
        ? { mrr: project.revenue.mrr, kind: "self-reported" as const, updatedAt: project.revenue.updatedAt || today }
        : undefined,
    }));
    const existingJoin = payload.id && payload.id !== 100 ? (await findMakerById(payload.id))?.joinedAt : undefined;
    const maker: Maker = normalizeMaker({
      ...payload,
      projects,
      links: payload.links?.map((link) => ({ kind: link.kind ?? "Other", url: link.url })),
      coffeeWeek: payload.coffeeWeek ?? undefined,
      workSamples: payload.workSamples?.map((sample) => ({ label: sample.label ?? "", url: sample.url })),
      joinedAt: existingJoin || today,
      id: payload.id && payload.id !== 100 ? payload.id : 100,
      name: payload.name,
      email: payload.email || undefined,
      city: payload.city,
      lat: payload.lat,
      lon: payload.lon,
      handle: normalizeHandle(payload.handle),
      claimed: true,
      source: "self",
      claimedBy: existing?.claimedBy ?? session?.xUserId,
      editKey: existing?.editKey ?? issuedKey,
    });
    const created = await upsertClaimedMaker(maker, existing?.id ?? payload.id);
    const { editKey: _k, claimedBy: _c, ...safe } = created;
    // The edit key is returned exactly once, at creation, for the browser to keep.
    return Response.json({ maker: safe, editKey: issuedKey }, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid maker payload", details: error.flatten() }, { status: 400 });
    }

    const message = errorMessage(error);
    const taken = /already taken/i.test(message);
    return Response.json({ error: message }, { status: taken ? 409 : 500 });
  }
}
