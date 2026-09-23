import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { recheckDeletedPosts } from "@/lib/x-pipeline";

// Hides listed pins whose intro post was deleted on X.
export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    return Response.json(await recheckDeletedPosts());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Recheck failed" }, { status: 500 });
  }
}
