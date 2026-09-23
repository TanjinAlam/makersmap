import { normalizeHandle } from "@/app/handle";
import { listPublicMakers, resolveMakerByHandle } from "@/app/makers-lookup";
import { publicMatch, topMatches } from "@/lib/matching";
import { writeIntros } from "@/lib/match-intros";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: raw } = await params;
  const handle = normalizeHandle(raw);
  const limit = Math.min(6, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 3));
  const maker = await resolveMakerByHandle(handle);
  if (!maker) return Response.json({ error: "Maker not found", matches: [] }, { status: 404 });

  const pool = await listPublicMakers();
  const matches = topMatches(maker, pool, limit);
  const { intros, source } = await writeIntros(maker, matches);

  return Response.json(
    {
      for: maker.handle,
      source,
      matches: matches.map((match) => {
        const written = intros.get(match.maker.handle || String(match.maker.id));
        return publicMatch(match, written?.intro || "", written?.theirIntro || "");
      }),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
