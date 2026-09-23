import { clearSessionCookie, siteUrlFrom } from "@/lib/session";

export async function POST(request: Request) {
  const site = siteUrlFrom(request);
  return new Response(null, { status: 302, headers: { Location: `${site}/`, "Set-Cookie": clearSessionCookie(site.startsWith("https")) } });
}
