import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: "What MakersMap collects, where it comes from, how long it's kept, and how to remove yourself.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="public-profile doc-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/">Back to the atlas</Link>
      </header>
      <main className="doc-card">
        <p className="section-kicker">Privacy</p>
        <h1>What we keep, and how to make us stop</h1>
        <p className="doc-lead">Short version: we show what you made public, at city level only, and you can remove yourself in one click without an account.</p>

        <h2>Profiles you create</h2>
        <p>When you add yourself, we store what you type: name, city, what you&apos;re building, what you&apos;re looking for, and any links, skills, or revenue figures you choose to share. Location is city-level. We never ask for or store a street address, and pins are placed on the city, not on you.</p>

        <h2>Pins listed from X</h2>
        <p>If you post a public introduction on X, we may create a listed pin from it using X&apos;s official API. A listed pin holds your display name, your X handle, your profile photo URL, the city you said you&apos;re in, and the text and link of that one post. We don&apos;t read your other posts, followers, or messages. Listed pins are built only from that post and your public profile, and carry a no-index instruction so search engines don&apos;t list them. If you delete the post on X, the pin is hidden at the next check.</p>

        <h2>Claiming with X</h2>
        <p>Claiming uses Sign in with X to confirm you own the account. We store your X user id and username so only you can edit the pin. We don&apos;t post, follow, or read messages on your behalf, and we don&apos;t keep the access token after sign-in completes.</p>

        <h2>Email</h2>
        <p>When you claim a pin or add yourself, we ask for an email address, either the confirmed email on your X account (with your permission at sign-in) or one you type. It is stored privately, never shown on the site or returned by any public API, and used only to contact you about your pin and about people who want to meet you. Ask and we delete it.</p>

        <h2>Removing yourself</h2>
        <p>Listed pin: open <Link href="/remove">Remove a pin</Link>, enter your handle, done. It takes effect immediately and future imports won&apos;t re-list you. Claimed profile: use &quot;Remove my pin&quot; on your profile page. Removal requests are logged with the handle and time so we can honour them if the same post is seen again.</p>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>No ads and no selling or sharing of data with third parties.</li>
          <li>No tracking across other sites. If analytics are enabled, they are cookie-free and aggregate.</li>
          <li>No exact locations, ever.</li>
        </ul>

        <h2>Data we rely on from others</h2>
        <p>Map tiles come from OpenFreeMap and OpenStreetMap contributors. City coordinates for places outside our own list come from OpenStreetMap&apos;s Nominatim service. Match write-ups and post reading use a language model through OpenRouter, which receives only the public post or profile text needed for that task.</p>

        <h2>Contact</h2>
        <p>Questions or a removal we missed? Reply to the account that pinned you on X, or use the removal page above.</p>

        <p className="doc-links"><Link href="/terms">Terms</Link> · <Link href="/about">About</Link> · <Link href="/remove">Remove a pin</Link></p>
      </main>
    </div>
  );
}
