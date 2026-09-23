import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: "What MakersMap is, who it's for, and how the map gets filled in.",
  path: "/about",
});

export default function AboutPage() {
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
        <p className="section-kicker">About</p>
        <h1>A world of good company</h1>
        <p className="doc-lead">MakersMap is a city-level atlas of people who build things: founders, developers, designers, marketers, and everyone in between. It exists to answer one question quickly: who near me is building something, and why should we talk?</p>

        <h2>What you can do here</h2>
        <ul>
          <li>Find makers on the map by city, country, role, or interest, or just ask in plain words.</li>
          <li>Open a profile to see what someone is building, what they&apos;re looking for, what they can help with, and how to reach them on X.</li>
          <li>Say you&apos;re up for coffee this week, and see who else is, in your city.</li>
          <li>Post and find meetups on a city page.</li>
          <li>Get matched with people you should meet, with a sentence explaining why, in both directions.</li>
        </ul>

        <h2>How the map gets filled in</h2>
        <p>Two ways. People add themselves in three questions. And when someone posts a public introduction on X saying who they are, where they are, and who they&apos;d like to meet, we may list a minimal pin for them: name, handle, city, and a quote of that post. That pin stays out of search engines and shows nothing else until the person claims it by signing in with X. Claiming takes one tap and puts them in control of every word. Anyone can also remove a listed pin instantly, no sign-in needed.</p>

        <h2>What it costs</h2>
        <p>Nothing. There are no ads, no follower counts, and no messaging inside the site. Conversations happen where they already do, on X, over coffee, or at a meetup.</p>

        <h2>Where the profiles come from</h2>
        <p>Every pin is a real person: either they added themselves, or they posted a public introduction on X and we listed them from that one post, with their name, handle, photo, and the post itself. Nothing on the map is invented, and there is no sample data.</p>

        <p className="doc-links"><Link href="/privacy">Privacy</Link> · <Link href="/remove">Remove a pin</Link> · <Link href="/?edit=1">Add yourself</Link></p>
      </main>
    </div>
  );
}
