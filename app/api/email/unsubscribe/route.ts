import { withDb } from "@/db";
import { MAKERS_COLLECTION } from "@/db/makers";
import { handleFromUnsubscribeToken } from "@/lib/email";
import { siteUrlFrom } from "@/lib/session";

// One click from the email footer turns the weekly digest off. No login needed.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const handle = await handleFromUnsubscribeToken(token);
  if (!handle) return new Response("This link is not valid.", { status: 400 });
  await withDb((db) => db.collection(MAKERS_COLLECTION).updateOne({ handle }, { $set: { emailUpdates: false } }));
  return new Response(null, { status: 302, headers: { Location: `${siteUrlFrom(request)}/m/${handle}?unsubscribed=1` } });
}
