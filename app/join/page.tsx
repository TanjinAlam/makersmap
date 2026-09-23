import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { readSessionFromCookieHeader } from "@/lib/session";
import { oauthConfigured } from "@/lib/x-oauth";
import { SocialIcon } from "../social-icon";
import { JoinDone } from "./join-done";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = {
  title: "Find your place",
  description: "Join MakersMap with your X account: if you're already on the map, the pin is yours; if not, we build one from your profile.",
  robots: { index: true, follow: true },
};

type Query = { done?: string; handle?: string; error?: string };
const statuses = new Set(["claimed", "existing", "created", "needs-place", "conflict"]);

export default async function JoinPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const session = await readSessionFromCookieHeader(requestHeaders.get("cookie"));
  const configured = oauthConfigured();
  const done = params.done && statuses.has(params.done) ? (params.done as "claimed" | "existing" | "created" | "needs-place" | "conflict") : null;

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
        {done && session ? (
          <JoinDone status={done} handle={params.handle || session.username} name={session.name} avatarUrl={session.avatarUrl} />
        ) : (
          <div className="claim">
            <div className="claim-intro">
              <span className="section-kicker">Find your place</span>
              <h1>One tap and you&apos;re on the map.</h1>
              <p>Continue with X. If we already listed you from an intro post, the pin becomes yours. If not, we build one from your profile and ask three quick questions.</p>
            </div>
            {params.error && <p className="ask-error">{params.error}</p>}
            <div className="claim-actions">
              {configured ? (
                <a className="join-next" href={`/api/auth/x/start?next=${encodeURIComponent("/join")}`}><SocialIcon kind="X" size={15} />Continue with X</a>
              ) : (
                <p className="claim-note">Sign in with X isn&apos;t set up on this server yet.</p>
              )}
              <Link className="join-ghost" href="/?edit=1">I don&apos;t use X, add me by hand</Link>
              <p className="claim-fine">We read your name, photo, bio, and location to build the pin. Nothing is posted or followed on your behalf, and your email stays private.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
