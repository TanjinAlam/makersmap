import { z } from "zod";
import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { llmModel, llmSource } from "@/lib/llm";
import { DEFAULT_QUERY, QUERIES, currentQuery, getImportState, purgeListedPins, removeSamplePins, resetSweep, runImportPage } from "@/lib/x-pipeline";
import { isMongoConfigured, readEnv } from "@/db";
import { provider } from "@/lib/x-api";

const input = z.object({
  query: z.string().trim().min(3).max(512).optional(),
  restart: z.boolean().optional(),
  maxPosts: z.number().int().min(10).max(100).optional(),
  sample: z.boolean().optional(),
  removeSamples: z.boolean().optional(),
  /** Start a fresh sweep covering the last N days (twitterapi.io searches beyond 7 days). */
  sinceDays: z.number().int().min(1).max(60).optional(),
  /** Delete every listed (unclaimed) pin imported from X and reset the sweep. */
  purgeListed: z.boolean().optional(),
});

export async function GET(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  const state = await getImportState();
  return Response.json({
    state,
    defaultQuery: DEFAULT_QUERY,
    patterns: QUERIES.map((q) => q.label),
    current: currentQuery(state).pattern,
    provider: provider(),
    llm: llmSource() === "none" ? null : { source: llmSource(), model: llmSource() === "openrouter" ? llmModel() : "claude-opus-5" },
    configured: { mongo: isMongoConfigured(), x: provider() !== "none", claude: llmSource() !== "none", oauth: Boolean(readEnv("X_CLIENT_ID") && readEnv("X_CLIENT_SECRET")), session: Boolean(readEnv("SESSION_SECRET")) },
  });
}

export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const options = input.parse(await request.json().catch(() => ({})));
    if (options.removeSamples) return Response.json({ removed: await removeSamplePins() });
    if (options.purgeListed) return Response.json({ removed: await purgeListedPins() });
    if (options.sinceDays) await resetSweep(options.sinceDays);
    const result = await runImportPage({ ...options, restart: options.restart || Boolean(options.sinceDays) });
    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid options" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
