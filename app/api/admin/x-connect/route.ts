import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { OPERATOR_SCOPES, authorizeUrl, codeChallenge, oauthConfigured, randomToken } from "@/lib/x-oauth";
import { cookie, encodeJson, sign, siteUrlFrom } from "@/lib/session";
import { disconnectOperator, operatorStatus } from "@/lib/x-post";

// Connects the operator's X account for automated replies. Returns the
// authorize URL and sets the pending-OAuth cookie flagged as an operator flow.
export async function GET(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  return Response.json(await operatorStatus());
}

export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  const body = await request.json().catch(() => ({})) as { disconnect?: boolean };
  if (body.disconnect) { await disconnectOperator(); return Response.json({ connected: false }); }
  if (!oauthConfigured()) return Response.json({ error: "Set X_CLIENT_ID, X_CLIENT_SECRET, and SESSION_SECRET first." }, { status: 503 });
  const site = siteUrlFrom(request);
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = await codeChallenge(verifier);
  const signed = await sign(encodeJson({ state, verifier, next: "/admin", at: Date.now(), operator: true }));
  if (!signed) return Response.json({ error: "SESSION_SECRET must be at least 16 characters." }, { status: 503 });
  return Response.json(
    { url: authorizeUrl({ redirectUri: `${site}/api/auth/x/callback`, state, challenge, scopes: OPERATOR_SCOPES }) },
    { headers: { "Set-Cookie": cookie("mm_oauth", signed, 600, site.startsWith("https")) } },
  );
}
