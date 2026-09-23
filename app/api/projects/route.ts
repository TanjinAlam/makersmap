import { isMongoConfigured } from "@/db";
import { listPublicWhere } from "@/db/makers";
import { publicMaker } from "@/app/profile";
import { publicCache } from "@/lib/tiers";

// The project catalogue: every named project with the maker it belongs to.
export async function GET() {
  if (!isMongoConfigured()) return Response.json({ projects: [] }, { status: 503 });
  const makers = (await listPublicWhere({ "projects.0": { $exists: true } }, { id: 1, name: 1, handle: 1, city: 1, country: 1, flag: 1, lat: 1, lon: 1, avatar: 1, color: 1, initials: 1, tags: 1, projects: 1, hidden: 1 })).map(publicMaker);
  const projects = makers.flatMap((m) => m.projects.map((project) => ({
    maker: { id: m.id, name: m.name, handle: m.handle, city: m.city, flag: m.flag, avatar: m.avatar, color: m.color, initials: m.initials, tags: m.tags.slice(0, 3), projectCount: m.projects.length },
    project,
  })));
  return Response.json({ projects }, { headers: publicCache });
}
