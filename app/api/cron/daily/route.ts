import { readEnv } from "@/db";
import { adminAllowed } from "@/lib/admin-auth";
import { siteUrlFrom } from "@/lib/session";
import { getImportState, recheckDeletedPosts, runImportPage } from "@/lib/x-pipeline";
import { outreachSettings, sendDueReplies } from "@/lib/outreach";
import { sendWeeklyDigests } from "@/lib/digest";
import { verifyProjectLinks } from "@/lib/site-reader";

// The daily job: pull new intro posts, hide deleted ones, send today's replies.
// Call it from any scheduler with the admin secret as a header or ?key=.
function allowed(request: Request): boolean {
  if (adminAllowed(request)) return true;
  const key = new URL(request.url).searchParams.get("key") || "";
  const secret = readEnv("ADMIN_SECRET") || "";
  if (!secret || key.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const startedAt = Date.now();
  const summary: Record<string, unknown> = {};
  try {
    // Incremental sweep: only posts newer than the last run, at most 4 pages a call.
    let fetched = 0, listed = 0, pages = 0;
    for (let i = 0; i < 4; i++) {
      // Continue the sweep where it left off; start a fresh window only once the previous one is complete.
      const page = await runImportPage({ maxPosts: 40, restart: i === 0 && (await getImportState()).sweepDone === true });
      pages += 1; fetched += page.fetched; listed += page.listed;
      if (page.done || page.error) { if (page.error) summary.importError = page.error; break; }
    }
    summary.import = { pages, fetched, listed };
  } catch (error) { summary.importError = error instanceof Error ? error.message : "failed"; }
  try { summary.projectLinks = await verifyProjectLinks(300); } catch (error) { summary.projectLinksError = error instanceof Error ? error.message : "failed"; }
  try { summary.recheck = await recheckDeletedPosts(); } catch (error) { summary.recheckError = error instanceof Error ? error.message : "failed"; }
  try {
    const settings = await outreachSettings();
    summary.outreach = settings.auto ? await sendDueReplies(siteUrlFrom(request)) : { skipped: "auto outreach is off" };
  } catch (error) { summary.outreachError = error instanceof Error ? error.message : "failed"; }
  try { summary.digest = await sendWeeklyDigests(siteUrlFrom(request)); } catch (error) { summary.digestError = error instanceof Error ? error.message : "failed"; }
  summary.tookMs = Date.now() - startedAt;
  return Response.json(summary);
}
