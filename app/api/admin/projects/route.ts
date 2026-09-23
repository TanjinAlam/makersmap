import { z } from "zod";
import { withDb } from "@/db";
import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { MAKERS_COLLECTION } from "@/db/makers";
import { normalizeProject, type Maker } from "@/app/profile";
import { dedupeBySite, enrichProject } from "@/lib/site-reader";
import { mapWithConcurrency } from "@/lib/llm";

type MakerRecord = Maker & { _id?: unknown };
const input = z.object({ ids: z.array(z.number().int().positive()).min(1).max(40) });

// Applies the project rule to listed pins: a project must have a site we can
// read; its description and logo come from that site. Claimed profiles are
// never touched, their owners write their own.
export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const { ids } = input.parse(await request.json());
    const docs = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ id: { $in: ids }, claimed: { $ne: true } }).toArray());
    const results = await mapWithConcurrency(docs, 4, async (m) => {
      const before = (m.projects || []).length;
      const kept = await mapWithConcurrency((m.projects || []).filter((p) => /^https?:\/\//i.test(p.website || "")), 3, async (p) => {
        if (p.logo && p.description && p.tagline) return p; // already read
        const site = await enrichProject(p.name, p.website as string, m.id).catch(() => null);
        return site ? normalizeProject({ ...p, name: site.name, description: site.description, tagline: site.tagline, website: site.website, logo: site.logo, image: site.image }) : null;
      });
      const projects = dedupeBySite(kept.filter((p): p is NonNullable<typeof p> => Boolean(p)));
      await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).updateOne({ id: m.id }, { $set: { projects, project: projects[0]?.name || "", description: projects[0]?.description || "" } }));
      return { id: m.id, handle: m.handle, before, after: projects.length };
    });
    return Response.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
