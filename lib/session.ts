import { readEnv } from "@/db";

// A small signed cookie. The payload is JSON, base64url-encoded, followed by an
// HMAC-SHA256 signature. Workers has WebCrypto, so no Node crypto is needed.

export type Session = { xUserId: string; username: string; name: string; avatarUrl?: string; email?: string; issuedAt: number };

const COOKIE = "mm_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const s = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey | null> {
  const secret = readEnv("SESSION_SECRET");
  if (!secret || secret.length < 16) return null;
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(value: string): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(value));
  return `${value}.${b64url(sig)}`;
}

export async function verify(token: string): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const at = token.lastIndexOf(".");
  if (at < 0) return null;
  const value = token.slice(0, at), sig = token.slice(at + 1);
  const ok = await crypto.subtle.verify("HMAC", k, fromB64url(sig), encoder.encode(value));
  return ok ? value : null;
}

export function encodeJson(data: unknown): string {
  return b64url(encoder.encode(JSON.stringify(data)));
}

export function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(value))) as T;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function sessionCookie(session: Session, secure: boolean): Promise<string | null> {
  const signed = await sign(encodeJson(session));
  return signed ? cookie(COOKIE, signed, MAX_AGE, secure) : null;
}

export function clearSessionCookie(secure: boolean): string {
  return cookie(COOKIE, "", 0, secure);
}

export async function readSession(request: Request): Promise<Session | null> {
  const raw = readCookie(request, COOKIE);
  if (!raw) return null;
  const value = await verify(raw);
  if (!value) return null;
  const session = decodeJson<Session>(value);
  if (!session?.xUserId || Date.now() - session.issuedAt > MAX_AGE * 1000) return null;
  return session;
}

/** Same as readSession but from a header string, for server components using next/headers. */
export async function readSessionFromCookieHeader(header: string | null | undefined): Promise<Session | null> {
  return readSession(new Request("https://app.local/", { headers: header ? { cookie: header } : {} }));
}

export function siteUrlFrom(request: Request): string {
  const configured = readEnv("SITE_URL");
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
