import { readEnv } from "@/db";
import { sign, verify } from "./session";

// Email goes through Resend when a key is set; otherwise sends are skipped and
// reported, so nothing breaks in development.
export function emailConfigured(): boolean {
  return Boolean(readEnv("RESEND_API_KEY"));
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = readEnv("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const from = readEnv("EMAIL_FROM") || "MakersMap <hello@makersmap.net>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => ({})) as { message?: string };
  return { ok: false, error: data.message || `Resend refused (${response.status})` };
}

/** A signed, link-safe token so an unsubscribe link works without a login. */
export async function unsubscribeToken(handle: string): Promise<string | null> {
  return sign(`unsub:${handle}`);
}
export async function handleFromUnsubscribeToken(token: string): Promise<string | null> {
  const value = await verify(token);
  return value?.startsWith("unsub:") ? value.slice(6) : null;
}
