import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Coffee, Users } from "lucide-react";
import { listPublicInPlace } from "../../makers-lookup";
import { listMeetups } from "@/db/meetups";
import { citySlug, hasCity, isCoffeeThisWeek, emptyGroups, roleGroupOf } from "../../profile";
import { PlaceList } from "../place-list";
import { RoleBreakdown } from "../../role-breakdown";
import { rowView } from "@/lib/tiers";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

type Params = { slug: string };

async function load(params: Promise<Params>) {
  const { slug } = await params;
  const makers = await listPublicInPlace("country", slug);
  if (!makers.length) return null;
  const name = makers[0].country;
  const flag = makers[0].flag;
  const citySlugs = new Set(makers.map((m) => citySlug(m.city)));
  const meetups = (await listMeetups()).filter((meetup) => citySlugs.has(citySlug(meetup.city)));
  return { slug, name, flag, makers, meetups };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const country = await load(params);
  if (!country) return { title: "Country not found", robots: { index: false, follow: false } };
  return pageMetadata({
    title: `Makers in ${country.name}`,
    description: `${country.makers.length} ${country.makers.length === 1 ? "maker" : "makers"} in ${country.name} on MakersMap, by city, with who's up for coffee this week and upcoming meetups.`,
    path: `/country/${country.slug}`,
  });
}

export default async function CountryPage({ params }: { params: Promise<Params> }) {
  const country = await load(params);
  if (!country) notFound();
  const groups = country.makers.reduce((acc, m) => { acc[roleGroupOf(m.role)] += 1; return acc; }, emptyGroups());
  const coffee = country.makers.filter((m) => isCoffeeThisWeek(m)).length;
  const cities = new Map<string, { city: string; slug: string; count: number; coffee: number }>();
  for (const m of country.makers) {
    if (!hasCity(m)) continue;
    const slug = citySlug(m.city);
    const entry = cities.get(slug) || { city: m.city, slug, count: 0, coffee: 0 };
    entry.count += 1;
    if (isCoffeeThisWeek(m)) entry.coffee += 1;
    cities.set(slug, entry);
  }
  const cityRows = [...cities.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  return (
    <div className="public-profile city-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/leaderboard">Leaderboard <ArrowUpRight size={16} /></Link>
      </header>

      <main className="city-card">
        <section className="city-hero">
          <span className="city-flag" aria-hidden="true">{country.flag}</span>
          <div>
            <p className="section-kicker">Country</p>
            <h1>{country.name}</h1>
            <div className="share-links"><Link href={`/share/country/${country.slug}`}>Share {country.name}&apos;s rank <ArrowUpRight size={13} /></Link></div>
            <p className="city-stats">
              <strong>{country.makers.length}</strong> {country.makers.length === 1 ? "maker" : "makers"}
              <span>·</span> <strong>{cityRows.length}</strong> {cityRows.length === 1 ? "city" : "cities"}
              <span>·</span> <strong>{coffee}</strong> up for coffee this week
              <span>·</span> <strong>{country.meetups.length}</strong> upcoming {country.meetups.length === 1 ? "meetup" : "meetups"}
            </p>
            <RoleBreakdown groups={groups} total={country.makers.length} />
          </div>
        </section>

        <div className="country-body">
          <section className="country-cities">
            <span className="section-kicker">Cities</span>
            <div className="city-grid">
              {cityRows.map((c) => (
                <Link key={c.slug} className="city-tile" href={`/city/${c.slug}`}>
                  <span className="city-tile-flag" aria-hidden="true">{country.flag}</span>
                  <span className="city-tile-text"><strong>{c.city}</strong><small>{country.name}</small></span>
                  <span className="city-tile-stats"><em><Users size={13} />{c.count}</em>{c.coffee > 0 && <em className="coffee"><Coffee size={13} />{c.coffee}</em>}</span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          </section>

          <section className="country-makers">
            <span className="section-kicker">Everyone in {country.name}</span>
            <PlaceList kind="country" slug={country.slug} placeName={country.name} total={country.makers.length}
              initial={[...country.makers].sort((a, b) => Number(hasCity(b)) - Number(hasCity(a)) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).slice(0, 60).map(rowView)} />
          </section>
        </div>
      </main>
    </div>
  );
}
