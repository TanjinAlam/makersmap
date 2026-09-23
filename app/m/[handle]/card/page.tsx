import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveMakerByHandle } from "../../../makers-lookup";
import { xHandleOf } from "../../../profile";
import { CardClient } from "./card-client";
import { BrandMark } from "@/app/brand";

type Params = { handle: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { handle } = await params;
  const maker = await resolveMakerByHandle(handle);
  return { title: maker ? `${maker.name}'s card` : "Card", robots: { index: false, follow: false } };
}

export default async function CardPage({ params }: { params: Promise<Params> }) {
  const { handle } = await params;
  const maker = await resolveMakerByHandle(handle);
  if (!maker || (maker.source === "x-intro" && !maker.claimed)) notFound();

  return (
    <div className="public-profile card-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href={`/m/${maker.handle}`}>Back to the profile</Link>
      </header>
      <main className="card-main">
        <CardClient
          handle={maker.handle || ""}
          maker={{
            name: maker.name, xHandle: xHandleOf(maker) || "", city: maker.city, country: maker.country, flag: maker.flag, role: maker.role,
            avatar: maker.avatar, initials: maker.initials, color: maker.color, id: maker.id,
            project: maker.project, description: maker.description, lookingFor: maker.lookingFor, tags: maker.tags,
          }}
        />
      </main>
    </div>
  );
}
