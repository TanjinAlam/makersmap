import { z } from "zod";
import { adminAllowed, forbidden } from "@/lib/admin-auth";
import { extractPin } from "@/lib/x-extract";
import { mapWithConcurrency } from "@/lib/llm";

const input = z.object({
  posts: z.array(z.object({
    text: z.string().min(1).max(2000),
    location: z.string().max(120).optional(),
    bio: z.string().max(600).optional(),
    name: z.string().max(80).optional(),
    username: z.string().max(40).optional(),
    website: z.string().max(300).optional(),
  })).min(1).max(30),
});

// Dry-run the reader on pasted posts: what would it make of them? Nothing is stored.
export async function POST(request: Request) {
  if (!adminAllowed(request)) return forbidden();
  try {
    const { posts } = input.parse(await request.json());
    // Posts are read several at a time; order is preserved.
    const results = await mapWithConcurrency(posts, 8, async (post, i) => {
      const extracted = await extractPin(
        { id: `dry-${i}`, text: post.text, links: post.text.match(/https?:\/\/[^\s)]+/g) || [], author_id: "dry", created_at: new Date().toISOString() },
        { id: "dry", username: post.username || "", name: post.name || "", description: post.bio, location: post.location, url: post.website || undefined },
      );
      return { text: post.text.slice(0, 80), ...extracted };
    });
    return Response.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
