import { z } from "zod";
import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { decideReview, pendingReview } from "@/lib/x-pipeline";

// Imported pins the extractor scored below the confidence bar. A human says yes or no.
export async function GET(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const pins = await pendingReview();
    return Response.json({
      items: pins.map((m) => ({
        id: m.id, handle: m.handle, name: m.name, city: m.city, country: m.country, flag: m.flag, role: m.role,
        lookingFor: m.lookingFor, postText: m.x?.postText || "", postUrl: m.x?.postUrl || "", location: m.x?.location || "",
        bio: m.bio, confidence: m.x?.confidence,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load", items: [] }, { status: 500 });
  }
}

const input = z.object({ id: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) });

export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const { id, decision } = input.parse(await request.json());
    const ok = await decideReview(id, decision);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Nothing pending with that id" }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 500 });
  }
}
