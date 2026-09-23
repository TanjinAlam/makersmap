import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { normalizeHandle } from "../handle";
import { readSessionFromCookieHeader } from "@/lib/session";
import { oauthConfigured } from "@/lib/x-oauth";
import { RemoveClient } from "./remove-client";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = {
  title: "Remove a pin",
  robots: { index: false, follow: false },
};

export default async function RemovePage({ searchParams }: { searchParams: Promise<{ handle?: string }> }) {
  const { handle } = await searchParams;
  const session = await readSessionFromCookieHeader((await headers()).get("cookie"));
  return (
    <div className="public-profile claim-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/">Back to the atlas</Link>
      </header>
      <main className="claim-card">
        <RemoveClient handle={normalizeHandle(handle || "")} session={session ? { username: session.username } : null} configured={oauthConfigured()} />
      </main>
    </div>
  );
}
