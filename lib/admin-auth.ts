import { readEnv } from "@/db";

// The admin console and its APIs are protected by one shared secret sent as a
// header. Good enough for a single operator; swap for real accounts later.
export function adminAllowed(request: Request): boolean {
  const secret = readEnv("ADMIN_SECRET");
  if (!secret || secret.length < 8) return false;
  const given = request.headers.get("x-admin-secret") || "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export function adminConfigured(): boolean {
  const secret = readEnv("ADMIN_SECRET");
  return Boolean(secret && secret.length >= 8);
}

export function forbidden(): Response {
  return Response.json({ error: adminConfigured() ? "Wrong admin secret." : "ADMIN_SECRET is not set (8+ characters)." }, { status: 401 });
}
