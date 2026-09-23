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
        <p className="doc-lead">MakersMap is a city-level atlas of people who build things. Founders, developers, designers, creators, marketers. It answers one question fast: who near me is building something, and why should we talk?</p>

        <h2>Why it exists</h2>
        <p>Every week, people post the same kind of introduction on X: &ldquo;I&apos;m 29, solo founder from Brazil, based in Barcelona, looking to connect with designers.&rdquo; Those posts are a map of the maker world, scattered across a feed that forgets them in a day. MakersMap keeps them, puts every one on a real map, and makes the people behind them easy to find by city, role, and what they&apos;re looking for.</p>

        <h2>What you can do here</h2>
        <ul>
          <li>Browse the map. Click a country or a city and see everyone there, with who is open to meet in person and who is open to connect online.</li>
          <li>Ask in plain words: &ldquo;designers in Warsaw open to coffee this week&rdquo; or &ldquo;someone who can help with marketing for a SaaS&rdquo;.</li>
          <li>Open a profile to see the post that put them on the map, what they&apos;re building, what they&apos;re looking for, what they can help with, and how to reach them on X.</li>
          <li>Browse projects. Every project listed has a real website we visited; the name and summary come from that site.</li>
          <li>Follow your city: a leaderboard by country and city, who&apos;s new this week, and who&apos;s up for coffee.</li>
          <li>Share a card for your pin, your city, or your country, ready to post.</li>
        </ul>

        <h2>How the map gets filled in</h2>
        <p>Two ways. You can add yourself in a minute. Or, if you posted a public introduction on X saying who you are, where you are, and who you&apos;d like to meet, we may list a pin for you from that one post: your name, handle, photo, the city you named, and the post itself, quoted as you wrote it. Nothing more is added. A listed pin stays out of search engines until you claim it.</p>
        <p>Claiming takes one tap with Sign in with X and puts you in control of every word: the role, the place, the projects, the pinned post, the badges. You can also unpin the post or remove the pin entirely at any time by signing in with the same X account.</p>

        <h2>Every pin is a real person</h2>
        <p>There is no sample data and nothing is invented. Every profile comes from an X post, an X profile, or a project&apos;s own website, and every project link is re-checked every week. If a project has no website we can visit, it isn&apos;t listed.</p>

        <h2>What it costs</h2>
        <p>Nothing. No ads, no follower counts, no messaging inside the site. Conversations happen where they already do: on X, over coffee, or at a meetup.</p>

        <h2>Open source</h2>
        <p>MakersMap is built in the open by <a href="https://x.com/dotnafis" target="_blank" rel="noopener noreferrer">@dotnafis</a> in Warsaw. The code is on <a href="https://github.com/nafisfaysal/makersmap" target="_blank" rel="noopener noreferrer">GitHub</a> under the MIT license. The data is not published, because it holds people&apos;s email addresses and private keys.</p>

        <p className="doc-links"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/remove">Remove a pin</Link> · <Link href="/?edit=1">Add yourself</Link></p>
      </main>
    </div>
  );
}
