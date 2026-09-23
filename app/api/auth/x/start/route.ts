import { authorizeUrl, codeChallenge, oauthConfigured, randomToken } from "@/lib/x-oauth";
import { cookie, encodeJson, sign, siteUrlFrom } from "@/lib/session";

// Begins sign-in with X. `next` is where to go afterwards (a claim page, usually).
export async function GET(request: Request) {
  if (!oauthConfigured()) {
    return Response.json({ error: "Sign in with X is not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, and SESSION_SECRET." }, { status: 503 });
  }
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/claim";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/claim";
  const site = siteUrlFrom(request);
  const redirectUri = `${site}/api/auth/x/callback`;
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = await codeChallenge(verifier);
  const signed = await sign(encodeJson({ state, verifier, next: safeNext, at: Date.now() }));
  if (!signed) return Response.json({ error: "SESSION_SECRET must be at least 16 characters." }, { status: 503 });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl({ redirectUri, state, challenge }),
      "Set-Cookie": cookie("mm_oauth", signed, 600, site.startsWith("https")),
    },
  });
}
