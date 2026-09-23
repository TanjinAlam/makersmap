import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = pageMetadata({
  title: "Terms of service",
  description: "The plain-language terms for using MakersMap: what the atlas is, what you may do with it, and what we promise.",
  path: "/terms",
});

export default function TermsPage() {
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
        <p className="section-kicker">Terms of service</p>
        <h1>The short, honest rules</h1>
        <p className="doc-lead">MakersMap is a city-level atlas of people who build things. Using it means agreeing to these terms. They are written to be read, not skimmed.</p>

        <h2>What MakersMap is</h2>
        <p>A directory and map of makers, founders, designers, and developers, built from profiles people create themselves and from public introduction posts on X. It exists so people who build things can find each other in the same city or country. It is not a marketplace, a recruiting tool, or a data broker.</p>

        <h2>Your profile</h2>
        <ul>
          <li>You may only claim a pin for an X account you control. Claiming uses Sign in with X to confirm that.</li>
          <li>Keep what you publish truthful. Revenue figures, roles, and locations are self-reported unless marked otherwise.</li>
          <li>You own your words. You give MakersMap permission to show them on your page, on the map, and in lists and search within the site.</li>
          <li>You can edit, unpin your intro post, or remove your pin at any time. Removal takes effect immediately.</li>
        </ul>

        <h2>Listed pins</h2>
        <p>If we list you from a public intro post, we show only what that post and your public X profile already said, at city level, with the post pinned and linked to the original. Listed pins stay out of search engines until claimed. If you do not want to be listed, <Link href="/remove">remove yourself</Link>; no account is needed, and we will not re-list you.</p>

        <h2>Using the atlas</h2>
        <ul>
          <li>Use it to meet people, not to scrape them. Bulk copying profiles, automated collection, or reselling the data is not allowed.</li>
          <li>Be decent when you reach out. Messages go through X, in your own name.</li>
          <li>Do not impersonate anyone or claim a pin that is not yours.</li>
        </ul>

        <h2>Email</h2>
        <p>If you share an email address, at claim or when you join, we use it only to contact you about your pin and about people who want to meet you. We do not show it on the site, sell it, or add it to third-party lists. You can ask us to delete it at any time.</p>

        <h2>Availability and liability</h2>
        <p>MakersMap is provided as is. We work to keep it accurate and online, but we do not guarantee either, and we are not liable for what people do with introductions made here. We may change or remove features, and may hide content that breaks these terms.</p>

        <h2>Changes</h2>
        <p>If these terms change in a way that matters, we will say so on this page with the date. Continuing to use the site after a change means you accept it.</p>

        <p className="doc-links"><Link href="/privacy">Privacy</Link> · <Link href="/about">About</Link> · <Link href="/remove">Remove a pin</Link></p>
      </main>
    </div>
  );
}
