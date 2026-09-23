import { readEnv } from "@/db";
import { getSetting, setSetting } from "@/db/settings";

// Posting replies from the operator's own X account, using the OAuth 2.0 user
// token stored when the operator connected in the admin console. Tokens are
// refreshed as needed and never leave the server.

export type OperatorToken = { accessToken: string; refreshToken?: string; expiresAt: number; username: string; userId: string; connectedAt: string };
const KEY = "operator-x";

export async function operatorStatus(): Promise<{ connected: boolean; username?: string; connectedAt?: string; canWrite: boolean }> {
  const token = await getSetting<OperatorToken>(KEY);
  if (!token) return { connected: false, canWrite: false };
  return { connected: true, username: token.username, connectedAt: token.connectedAt, canWrite: Boolean(token.refreshToken || token.expiresAt > Date.now()) };
}

export async function storeOperatorToken(token: OperatorToken): Promise<void> {
  await setSetting(KEY, token);
}

export async function disconnectOperator(): Promise<void> {
  await setSetting(KEY, null);
}

async function freshAccessToken(): Promise<string> {
  const token = await getSetting<OperatorToken>(KEY);
  if (!token) throw new Error("No X account is connected for outreach. Connect one in the admin console.");
  if (token.expiresAt - 60_000 > Date.now()) return token.accessToken;
  if (!token.refreshToken) throw new Error("The connected X token expired and can't be refreshed. Reconnect in the admin console.");
  const id = readEnv("X_CLIENT_ID") || "", secret = readEnv("X_CLIENT_SECRET") || "";
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refreshToken, client_id: id }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || `Token refresh failed (${response.status})`);
  const next: OperatorToken = { ...token, accessToken: data.access_token, refreshToken: data.refresh_token || token.refreshToken, expiresAt: Date.now() + (data.expires_in || 7200) * 1000 };
  await setSetting(KEY, next);
  return next.accessToken;
}

export class XPostError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Posts a reply under someone's post from the operator account. Returns the new post id. */
export async function postReply(text: string, inReplyTo: string): Promise<string> {
  const accessToken = await freshAccessToken();
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: inReplyTo } }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as { data?: { id: string }; detail?: string; title?: string; errors?: { message?: string }[] };
  if (!response.ok || !data.data?.id) throw new XPostError(data.detail || data.errors?.[0]?.message || data.title || `X refused the reply (${response.status})`, response.status);
  return data.data.id;
}
