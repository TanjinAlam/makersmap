import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { normalizeHandle } from "../handle";
import { readSessionFromCookieHeader } from "@/lib/session";
import { oauthConfigured } from "@/lib/x-oauth";
import { resolveMakerByHandle } from "../makers-lookup";
import { ClaimClient } from "./claim-client";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = {
  title: "Claim your pin",
  description: "Claim the MakersMap pin that was listed from your intro post.",
  robots: { index: false, follow: false },
};

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ handle?: string; error?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const session = await readSessionFromCookieHeader(requestHeaders.get("cookie"));
  const handle = normalizeHandle(params.handle || session?.username || "");
  const pin = handle ? await resolveMakerByHandle(handle) : null;
  const configured = oauthConfigured();

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
        <ClaimClient
          handle={handle}
          configured={configured}
          error={params.error || ""}
          session={session ? { username: session.username, name: session.name, email: session.email } : null}
          pin={pin ? {
            name: pin.name, handle: pin.handle || "", city: pin.city, country: pin.country, flag: pin.flag, role: pin.role,
            avatar: pin.avatar, initials: pin.initials, color: pin.color, claimed: Boolean(pin.claimed),
            postText: pin.x?.postText || "", postUrl: pin.x?.postUrl || "", listedFromX: pin.source === "x-intro" || Boolean(pin.x),
          } : null}
        />
      </main>
    </div>
  );
}
