import { exchangeCode, exchangeCodeFull, whoAmI } from "@/lib/x-oauth";
import { storeOperatorToken } from "@/lib/x-post";
import { joinFromX } from "@/lib/join-from-x";
import { clearSessionCookie, cookie, decodeJson, readCookie, sessionCookie, siteUrlFrom, verify } from "@/lib/session";

type Pending = { state: string; verifier: string; next: string; at: number; operator?: boolean };

function back(site: string, path: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { Location: `${site}${path}`, ...headers } });
}

export async function GET(request: Request) {
  const site = siteUrlFrom(request);
  const secure = site.startsWith("https");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const raw = readCookie(request, "mm_oauth");
  const pending = raw ? decodeJson<Pending>((await verify(raw)) || "") : null;
  const clearPending = cookie("mm_oauth", "", 0, secure);

  if (denied) return back(site, `/claim?error=${encodeURIComponent("Sign-in was cancelled.")}`, { "Set-Cookie": clearPending });
  if (!code || !state || !pending || pending.state !== state || Date.now() - pending.at > 600_000) {
    return back(site, `/claim?error=${encodeURIComponent("Sign-in expired or didn't match. Please try again.")}`, { "Set-Cookie": clearPending });
  }

  if (pending.operator) {
    // The operator connecting their own account for outreach: keep the tokens, not a session.
    try {
      const token = await exchangeCodeFull({ code, redirectUri: `${site}/api/auth/x/callback`, verifier: pending.verifier });
      const me = await whoAmI(token.accessToken);
      await storeOperatorToken({ accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: Date.now() + token.expiresIn * 1000, username: me.username, userId: me.id, connectedAt: new Date().toISOString() });
      return back(site, `/admin?connected=${encodeURIComponent(me.username)}`, { "Set-Cookie": clearPending });
    } catch (error) {
      return back(site, `/admin?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not connect the account.")}`, { "Set-Cookie": clearPending });
    }
  }

  try {
    const accessToken = await exchangeCode({ code, redirectUri: `${site}/api/auth/x/callback`, verifier: pending.verifier });
    const me = await whoAmI(accessToken);
    const session = await sessionCookie({ xUserId: me.id, username: me.username, name: me.name, avatarUrl: me.avatarUrl, email: me.email, issuedAt: Date.now() }, secure);
    if (!session) throw new Error("SESSION_SECRET is not set.");
    // Joining: the sign-in itself claims or creates the pin, then lands on the result.
    let next = pending.next;
    if (next.startsWith("/join")) {
      const outcome = await joinFromX(me);
      next = `/join?done=${outcome.status}&handle=${encodeURIComponent(outcome.handle)}`;
    }
    const headers = new Headers({ Location: `${site}${next}` });
    headers.append("Set-Cookie", session);
    headers.append("Set-Cookie", clearPending);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    const headers = new Headers({ Location: `${site}/claim?error=${encodeURIComponent(message)}` });
    headers.append("Set-Cookie", clearSessionCookie(secure));
    headers.append("Set-Cookie", clearPending);
    return new Response(null, { status: 302, headers });
  }
}
