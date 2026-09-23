import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Coffee, Globe2, MapPin, Users } from "lucide-react";
import { listPublicMakers } from "../makers-lookup";
import { Avatar } from "../maker-ui";
import { avatarOf, citySlug, countrySlug, hasCity, isCoffeeThisWeek, emptyGroups, roleGroupOf, type Maker, type RoleGroup } from "../profile";
import { pageMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = pageMetadata({
  title: "Leaderboard",
  description: "Which countries and cities have the most makers, founders, designers, and developers on MakersMap.",
  path: "/leaderboard",
});

const GROUPS: RoleGroup[] = ["Founders", "Developers", "Designers", "Creators", "Business"];
const singular: Record<RoleGroup, string> = { Founders: "founder", Developers: "developer", Designers: "designer", Creators: "creator", Business: "business" };

type CountryRow = {
  country: string; slug: string; flag: string; total: number; claimed: number; coffee: number;
  groups: Record<RoleGroup, number>; cities: { city: string; slug: string; count: number }[]; faces: Maker[];
};

type CityRow = { city: string; slug: string; country: string; flag: string; count: number; coffee: number };

function label(group: RoleGroup, n: number): string {
  return n === 1 ? singular[group] : group.toLowerCase();
}

function RoleBar({ groups, total }: { groups: Record<RoleGroup, number>; total: number }) {
  return (
    <div className="lb-bar" aria-hidden="true">
      {GROUPS.filter((g) => groups[g] > 0).map((g) => (
        <span key={g} className={`lb-seg lb-seg-${g.toLowerCase()}`} style={{ width: `${(groups[g] / total) * 100}%` }} title={`${groups[g]} ${label(g, groups[g])}`} />
      ))}
    </div>
  );
}

export default async function LeaderboardPage() {
  const makers = await listPublicMakers();
  const byCountry = new Map<string, CountryRow>();
  const byCity = new Map<string, CityRow>();
  for (const m of makers) {
    const country = m.country || "Location unknown";
    const row = byCountry.get(country) || { country, slug: m.country ? countrySlug(country) : "", flag: m.flag || "🌍", total: 0, claimed: 0, coffee: 0, groups: emptyGroups(), cities: [], faces: [] };
    row.total += 1;
    if (m.claimed) row.claimed += 1;
    if (isCoffeeThisWeek(m)) row.coffee += 1;
    row.groups[roleGroupOf(m.role)] += 1;
    if (row.faces.length < 4) row.faces.push(m);
    byCountry.set(country, row);
    if (!hasCity(m)) continue; // a country-level pin is counted for the country, never as a city
    const slug = citySlug(m.city);
    const city = row.cities.find((c) => c.slug === slug);
    if (city) city.count += 1; else row.cities.push({ city: m.city, slug, count: 1 });

    const cityRow = byCity.get(slug) || { city: m.city, slug, country, flag: m.flag, count: 0, coffee: 0 };
    cityRow.count += 1;
    if (isCoffeeThisWeek(m)) cityRow.coffee += 1;
    byCity.set(slug, cityRow);
  }
  for (const row of byCountry.values()) row.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  // Real countries by size; the "location unknown" row always sits last.
  const countries = [...byCountry.values()].sort((a, b) => Number(!a.slug) - Number(!b.slug) || b.total - a.total || a.country.localeCompare(b.country));
  const cities = [...byCity.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)).slice(0, 10);
  const max = countries[0]?.total || 1;
  const totals = makers.reduce((acc, m) => { acc[roleGroupOf(m.role)] += 1; return acc; }, emptyGroups());
  const coffeeTotal = makers.filter((m) => isCoffeeThisWeek(m)).length;
  const podium = countries.slice(0, 3);
  const rest = countries.slice(3);

  return (
    <div className="public-profile leaderboard-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/city">All cities <ArrowUpRight size={16} /></Link>
      </header>

      <main className="lb">
        <section className="lb-hero">
          <div className="lb-hero-text">
            <p className="section-kicker">Leaderboard</p>
            <h1>Where the builders are</h1>
            <p>Countries and cities ranked by the makers who&apos;ve pinned themselves. Updated live as people join and claim their pins.</p>
          </div>
          <div className="lb-stats">
            <div><Users size={16} /><strong>{makers.length}</strong><span>makers</span></div>
            <div><Globe2 size={16} /><strong>{countries.length}</strong><span>countries</span></div>
            <div><MapPin size={16} /><strong>{byCity.size}</strong><span>cities</span></div>
            <div><Coffee size={16} /><strong>{coffeeTotal}</strong><span>up for coffee this week</span></div>
          </div>
          <div className="lb-legend" aria-label="Role mix">
            {GROUPS.map((g) => <span key={g}><i className={`lb-seg-${g.toLowerCase()}`} />{totals[g]} {label(g, totals[g])}</span>)}
          </div>
        </section>

        {podium.length > 0 && (
          <section className="lb-podium" aria-label="Top three countries">
            {podium.map((row, index) => (
              <Link key={row.country} className={`lb-podium-card place-${index + 1}`} href={`/country/${row.slug}`}>
                <span className="lb-medal">{index + 1}</span>
                <span className="lb-podium-flag" aria-hidden="true">{row.flag}</span>
                <strong>{row.country}</strong>
                <em>{row.total} {row.total === 1 ? "maker" : "makers"}</em>
                <RoleBar groups={row.groups} total={row.total} />
                <div className="lb-faces">
                  {row.faces.map((m) => <Avatar key={m.id} maker={avatarOf(m)} size={28} />)}
                  {row.total > row.faces.length && <span className="lb-more">+{row.total - row.faces.length}</span>}
                </div>
                <small>{row.cities.slice(0, 3).map((c) => c.city).join(" · ")}{row.cities.length > 3 ? ` · +${row.cities.length - 3}` : ""}</small>
              </Link>
            ))}
          </section>
        )}

        <div className="lb-grid">
          <section className="lb-table" aria-label="All countries">
            <div className="lb-table-head">
              <span className="section-kicker">All countries</span>
              <span className="lb-table-note">bar shows share of the top country</span>
            </div>
            <ol className="lb-rows" start={rest.length ? 4 : 1}>
              {(rest.length ? rest : countries).map((row, i) => {
                const rank = (rest.length ? 4 : 1) + i;
                return (
                  <li key={row.country} className="lb-row">
                    <span className="lb-rank">{rank}</span>
                    <Link className="lb-country" href={row.slug ? `/country/${row.slug}` : "/"}>
                      <span className="lb-flag" aria-hidden="true">{row.flag}</span>
                      <span className="lb-country-text">
                        <strong>{row.country}</strong>
                        <small>{row.cities.slice(0, 3).map((c) => c.city).join(" · ")}{row.cities.length > 3 ? ` · +${row.cities.length - 3}` : ""}</small>
                      </span>
                    </Link>
                    <div className="lb-row-bar">
                      <div className="lb-track"><span style={{ width: `${Math.max(3, (row.total / max) * 100)}%` }}><RoleBar groups={row.groups} total={row.total} /></span></div>
                    </div>
                    <span className="lb-count"><strong>{row.total}</strong>{row.coffee > 0 && <em><Coffee size={11} />{row.coffee}</em>}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className="lb-cities" aria-label="Top cities">
            <span className="section-kicker">Top cities</span>
            <ol className="lb-city-list">
              {cities.map((c, i) => (
                <li key={c.slug}>
                  <Link href={`/city/${c.slug}`}>
                    <span className="lb-city-rank">{i + 1}</span>
                    <span className="lb-flag" aria-hidden="true">{c.flag}</span>
                    <span className="lb-city-text"><strong>{c.city}</strong><small>{c.country}</small></span>
                    <span className="lb-city-count">{c.count}{c.coffee > 0 && <em><Coffee size={11} />{c.coffee}</em>}</span>
                  </Link>
                </li>
              ))}
            </ol>
            <Link className="lb-all-cities" href="/city">Every city <ArrowUpRight size={14} /></Link>
          </aside>
        </div>

        <p className="page-footnote">Counts include people listed from public intro posts on X and people who claimed or added their own pin.</p>
        <p className="lb-footnote-links"><Link href="/join">Put yourself on the map</Link></p>
      </main>
    </div>
  );
}
