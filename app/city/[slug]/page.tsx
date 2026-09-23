import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { listPublicInPlace } from "../../makers-lookup";
import { listMeetups } from "@/db/meetups";
import { LocalTime } from "../../profile-actions";
import { avatarOf, cityFromSlug, hasCity, cityTimezone, countrySlug, isCoffeeThisWeek, xHandleOf } from "../../profile";
import { Avatar } from "../../maker-ui";
import { CityMakers } from "../city-makers";
import { RoleBreakdown } from "../../role-breakdown";
import { emptyGroups, roleGroupOf } from "../../profile";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

type Params = { slug: string };

async function load(slugPromise: Promise<Params>) {
  const { slug } = await slugPromise;
  const makers = (await listPublicInPlace("city", slug)).filter(hasCity);
  const known = cityFromSlug(slug);
  const name = known?.city || makers[0]?.city;
  if (!name) return null;
  const country = known?.country || makers[0]?.country || "";
  const flag = known?.flag || makers[0]?.flag || "";
  const meetups = await listMeetups(name);
  const weekAgo = Date.now() - 7 * 86400000;
  const fresh = makers.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() > weekAgo).slice(0, 12);
  return { slug, name, country, flag, timezone: known?.tz || cityTimezone(name), makers, meetups, fresh };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const city = await load(params);
  if (!city) return { title: "City not found", robots: { index: false, follow: false } };
  return pageMetadata({
    title: `Makers in ${city.name}`,
    description: `${city.makers.length} ${city.makers.length === 1 ? "maker" : "makers"} in ${city.name}${city.country ? `, ${city.country}` : ""} on MakersMap: who's building what, who's up for coffee this week, and upcoming meetups.`,
    path: `/city/${city.slug}`,
  });
}

export default async function CityPage({ params }: { params: Promise<Params> }) {
  const city = await load(params);
  if (!city) notFound();
  const coffeeCount = city.makers.filter((m) => isCoffeeThisWeek(m)).length;

  return (
    <div className="public-profile city-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/city">All cities <ArrowUpRight size={16} /></Link>
      </header>

      <main className="city-card">
        <section className="city-hero">
          <span className="city-flag" aria-hidden="true">{city.flag}</span>
          <div>
            <p className="section-kicker">{city.country ? <Link href={`/country/${countrySlug(city.country)}`}>{city.country}</Link> : "City"}</p>
            <h1>{city.name}</h1>
            <div className="share-links"><Link href={`/share/city/${city.slug}`}>Share {city.name}&apos;s card <ArrowUpRight size={13} /></Link></div>
            <p className="city-stats">
              <strong>{city.makers.length}</strong> {city.makers.length === 1 ? "maker" : "makers"}
              <span>·</span>
              <strong>{coffeeCount}</strong> up for coffee this week
              <span>·</span>
              <strong>{city.meetups.length}</strong> upcoming {city.meetups.length === 1 ? "meetup" : "meetups"}
              {city.timezone && <><span>·</span><LocalTime timezone={city.timezone} /></>}
            </p>
            <RoleBreakdown groups={city.makers.reduce((acc, m) => { acc[roleGroupOf(m.role)] += 1; return acc; }, emptyGroups())} total={city.makers.length} />
          </div>
        </section>

        {(() => {
          const fresh = city.fresh;
          if (!fresh.length) return null;
          return (
            <section className="city-new" aria-label="New this week">
              <span className="section-kicker">New this week · {fresh.length}</span>
              <div className="city-new-row">
                {fresh.map((m) => (
                  <Link key={m.id} href={m.handle ? `/m/${m.handle}` : "/"} className="city-new-face" title={m.name}>
                    <Avatar maker={avatarOf(m)} size={44} />
                    <small>{m.name.split(" ")[0]}</small>
                  </Link>
                ))}
              </div>
            </section>
          );
        })()}

        <CityMakers
          city={city.name}
          timezone={city.timezone}
          makers={city.makers.map((m) => ({
            id: m.id, handle: m.handle, xHandle: xHandleOf(m), name: m.name, role: m.role, avatar: m.avatar, initials: m.initials, color: m.color,
            project: m.project, description: m.description, lookingFor: m.lookingFor, canHelpWith: m.canHelpWith,
            coffeeThisWeek: isCoffeeThisWeek(m), openToMeeting: m.openToMeeting, claimed: Boolean(m.claimed),
          }))}
          meetups={city.meetups}
        />
      </main>
    </div>
  );
}
