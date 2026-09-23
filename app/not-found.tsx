import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page is not on MakersMap.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="public-profile public-missing">
      <Link className="brand" href="/" aria-label="MakersMap home">
        <BrandMark />
        makersmap<span className="brand-period">.</span>
      </Link>
      <h1>This page isn’t on the atlas.</h1>
      <p>The handle may be free, or the pin may have moved.</p>
      <Link className="join-next" href="/">Back to MakersMap</Link>
    </div>
  );
}
