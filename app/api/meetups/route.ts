import { z } from "zod";
import { readSession } from "@/lib/session";
import { withDb } from "@/db";
import { MAKERS_COLLECTION } from "@/db/makers";
import type { Maker } from "@/app/profile";
import { isMongoConfigured } from "@/db";
import { addMeetup, listMeetups } from "@/db/meetups";
import { normalizeHandle } from "@/app/handle";
import { resolveMakerByHandle } from "@/app/makers-lookup";
import { safeHttpUrl } from "@/app/http";

const meetupInput = z.object({
  city: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(120),
  date: z.string().trim().min(8).max(40),
  where: z.string().trim().max(160).optional(),
  url: z.string().trim().max(240).optional(),
  host: z.string().trim().min(3).max(32),
});

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city") || undefined;
  return Response.json({ meetups: await listMeetups(city) });
}

export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB is not configured." }, { status: 503 });
  }
  try {
    const input = meetupInput.parse(await request.json());
    const when = new Date(input.date);
    if (Number.isNaN(when.getTime())) return Response.json({ error: "Pick a valid date." }, { status: 400 });
    if (when.getTime() < Date.now() - 60 * 60 * 1000) return Response.json({ error: "That date is in the past." }, { status: 400 });
    // Only the signed-in owner of a claimed pin can post a meetup, as themselves.
    const session = await readSession(request);
    if (!session) return Response.json({ error: "Sign in with X to add a meetup." }, { status: 401 });
    const host = await resolveMakerByHandle(normalizeHandle(input.host));
    if (!host || !host.claimed) return Response.json({ error: "Claim your pin first to add a meetup." }, { status: 403 });
    const record = await withDb((db) => db.collection<Maker>(MAKERS_COLLECTION).findOne({ id: host.id }));
    if (!record || (record.claimedBy !== session.xUserId && record.x?.userId !== session.xUserId)) return Response.json({ error: "You can only post meetups as yourself." }, { status: 403 });

    const meetup = await addMeetup({
      id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      city: input.city,
      title: input.title,
      date: when.toISOString(),
      where: input.where || undefined,
      url: safeHttpUrl(input.url) || undefined,
      host: host.handle,
      source: "self",
    });
    return Response.json({ meetup }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid meetup", details: error.flatten() }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the meetup." }, { status: 500 });
  }
}
