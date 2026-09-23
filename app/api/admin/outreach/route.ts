import { z } from "zod";
import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { outreachQueue, outreachSettings, previewReply, saveOutreachSettings, sendDueReplies, sendOne, sentToday, setOutreachStatus } from "@/lib/outreach";
import { operatorStatus } from "@/lib/x-post";
import { normalizeHandle } from "@/app/handle";
import { siteUrlFrom } from "@/lib/session";

export async function GET(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const [items, settings, operator, today] = await Promise.all([outreachQueue(siteUrlFrom(request)), outreachSettings(), operatorStatus(), sentToday()]);
    return Response.json({ items, settings, operator, sentToday: today });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load the queue", items: [] }, { status: 500 });
  }
}

const input = z.union([
  z.object({ handle: z.string().trim().min(3).max(32), status: z.enum(["sent", "skipped", "queued"]) }),
  z.object({ settings: z.object({ auto: z.boolean().optional(), dailyCap: z.number().int().min(0).max(200).optional(), maxAgeDays: z.number().int().min(1).max(90).optional() }) }),
  z.object({ send: z.string().trim().min(3).max(32) }),
  z.object({ preview: z.string().trim().min(3).max(32) }),
  z.object({ runNow: z.number().int().min(1).max(50) }),
]);

export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const body = input.parse(await request.json());
    const site = siteUrlFrom(request);
    if ("settings" in body) return Response.json({ settings: await saveOutreachSettings(body.settings) });
    if ("send" in body) { const result = await sendOne(site, normalizeHandle(body.send)); return Response.json(result, { status: result.ok ? 200 : 502 }); }
    if ("preview" in body) return Response.json({ text: await previewReply(site, normalizeHandle(body.preview)) });
    if ("runNow" in body) return Response.json(await sendDueReplies(site, body.runNow));
    const ok = await setOutreachStatus(normalizeHandle(body.handle), body.status);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "No such pin" }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}
