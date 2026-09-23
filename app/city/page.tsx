import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Coffee, Users } from "lucide-react";
import { listPublicMakers } from "../makers-lookup";
import { listMeetups } from "@/db/meetups";
import { citySlug, hasCity, isCoffeeThisWeek } from "../profile";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = pageMetadata({
  title: "Cities",
  description: "Every city with makers on MakersMap, who's up for coffee this week, and upcoming meetups.",
  path: "/city",
});

export default async function CitiesPage() {
  const makers = await listPublicMakers();
  const meetups = await listMeetups();
  const byCity = new Map<string, { city: string; country: string; flag: string; count: number; coffee: number; meetups: number }>();
  for (const m of makers) {
    if (!hasCity(m)) continue;
    const slug = citySlug(m.city);
    const entry = byCity.get(slug) || { city: m.city, country: m.country, flag: m.flag, count: 0, coffee: 0, meetups: 0 };
    entry.count += 1;
    if (isCoffeeThisWeek(m)) entry.coffee += 1;
    byCity.set(slug, entry);
  }
  for (const meetup of meetups) {
    const entry = byCity.get(citySlug(meetup.city));
    if (entry) entry.meetups += 1;
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].count - a[1].count || a[1].city.localeCompare(b[1].city));

  return (
    <div className="public-profile city-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/">Back to the atlas <ArrowUpRight size={16} /></Link>
      </header>
      <main className="city-card">
        <section className="city-hero">
          <div>
            <p className="section-kicker">The atlas by city</p>
            <h1>Where the makers are</h1>
            <p className="city-stats"><strong>{cities.length}</strong> cities <span>·</span> <strong>{makers.length}</strong> makers</p>
          </div>
        </section>
        <div className="city-grid">
          {cities.map(([slug, c]) => (
            <Link key={slug} className="city-tile" href={`/city/${slug}`}>
              <span className="city-tile-flag" aria-hidden="true">{c.flag}</span>
              <span className="city-tile-text">
                <strong>{c.city}</strong>
                <small>{c.country}</small>
              </span>
              <span className="city-tile-stats">
                <em><Users size={13} />{c.count}</em>
                {c.coffee > 0 && <em className="coffee"><Coffee size={13} />{c.coffee}</em>}
                {c.meetups > 0 && <em>{c.meetups} {c.meetups === 1 ? "meetup" : "meetups"}</em>}
              </span>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
