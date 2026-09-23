import { z } from "zod";
import { isMongoConfigured } from "@/db";
import { normalizeHandle } from "@/app/handle";
import { recordSignal } from "@/lib/signals";

const input = z.object({ handle: z.string().trim().min(1).max(40), kind: z.enum(["view", "save", "message"]) });

// Called by the site when someone opens a profile, saves it, or clicks message.
export async function POST(request: Request) {
  if (!isMongoConfigured()) return new Response(null, { status: 204 });
  try {
    const { handle, kind } = input.parse(await request.json());
    const slug = normalizeHandle(handle);
    if (slug) await recordSignal(slug, kind);
  } catch { /* a lost signal is fine */ }
  return new Response(null, { status: 204 });
}
