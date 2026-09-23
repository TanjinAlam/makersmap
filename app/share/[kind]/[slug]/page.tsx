import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPublicMakers, resolveMakerByHandle } from "../../../makers-lookup";
import { citySlug, countrySlug, hasCity, isCoffeeThisWeek, isOpenInPerson, whereOf, xHandleOf, type Maker } from "../../../profile";
import { topMatches } from "@/lib/matching";
import { ShareClient, type Face, type ShareData } from "../../share-client";
import { BrandMark } from "@/app/brand";

type Params = { kind: string; slug: string };
const face = (m: Maker): Face => ({ avatar: m.avatar, initials: m.initials, color: m.color, name: m.name });
const rank = (n: number) => `#${n}`;

// Builds the card data for each kind of shareable: a maker's pin, their
// matches, a city, or a country's place in the world.
async function build(kind: string, slug: string): Promise<{ data: ShareData; back: string; title: string } | null> {
  const everyone = await listPublicMakers();
  if (kind === "maker" || kind === "matches") {
    const maker = await resolveMakerByHandle(slug);
    if (!maker) return null;
    const inCity = hasCity(maker) ? everyone.filter((m) => citySlug(m.city) === citySlug(maker.city)) : [];
    const inCountry = everyone.filter((m) => m.country === maker.country);
    const first = maker.name.split(" ")[0];
    if (kind === "maker") {
      const position = (hasCity(maker) ? inCity : inCountry).sort((a, b) => (a.joinedAt || "").localeCompare(b.joinedAt || "") || a.id - b.id).findIndex((m) => m.id === maker.id) + 1;
      const placeName = hasCity(maker) ? maker.city : maker.country || "the map";
      const count = hasCity(maker) ? inCity.length : inCountry.length;
      return {
        title: `${maker.name}'s pin`, back: `/m/${maker.handle}`,
        data: {
          kicker: `MAKER / ${String(maker.id).padStart(3, "0")}`,
          title: maker.name,
          subtitle: `@${xHandleOf(maker) || maker.handle} · ${maker.flag} ${whereOf(maker)} · ${maker.role}`,
          lines: [
            maker.project ? `Building ${maker.project}` : "",
            count > 1 ? `Maker ${rank(position)} of ${count} in ${placeName}` : `First maker in ${placeName}`,
            maker.lookingFor.length ? `Looking for ${maker.lookingFor.join(", ").toLowerCase()}` : "",
          ].filter(Boolean),
          faces: [face(maker)],
          stat: count > 1 ? { value: rank(position), label: `in ${placeName}` } : undefined,
          accent: maker.color,
          path: `/m/${maker.handle}`,
          postText: `I'm on MakersMap, a city map of makers. Maker ${rank(position)} in ${placeName}${maker.lookingFor.length ? `, looking for ${maker.lookingFor.join(", ").toLowerCase()}` : ""}.`,
          fileName: `makersmap-${maker.handle}`,
        },
      };
    }
    const matches = topMatches(maker, everyone, 3).map((m) => m.maker);
    if (!matches.length) return null;
    const names = matches.map((m) => m.name.split(" ")[0]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return {
      title: `${first}'s matches`, back: `/m/${maker.handle}`,
      data: {
        kicker: `MATCHES FOR ${first.toUpperCase()}`,
        title: `Meet ${list}.`,
        subtitle: `MakersMap thinks ${first} should talk to them`,
        lines: matches.map((m) => `${m.name.split(" ")[0]} · ${m.flag} ${hasCity(m) ? m.city : m.country} · ${m.project ? `building ${m.project}` : m.role}`),
        faces: [face(maker), ...matches.map(face)],
        accent: maker.color,
        path: `/m/${maker.handle}`,
        postText: `MakersMap says I should meet ${list}. Who are your matches?`,
        fileName: `makersmap-${maker.handle}-matches`,
      },
    };
  }
  if (kind === "city") {
    const inCity = everyone.filter((m) => hasCity(m) && citySlug(m.city) === slug);
    if (!inCity.length) return null;
    const name = inCity[0].city, flag = inCity[0].flag, country = inCity[0].country;
    const coffee = inCity.filter((m) => isCoffeeThisWeek(m)).length;
    const open = inCity.filter((m) => isOpenInPerson(m)).length;
    const cities = new Map<string, number>();
    for (const m of everyone) if (hasCity(m)) cities.set(citySlug(m.city), (cities.get(citySlug(m.city)) || 0) + 1);
    const position = [...cities.entries()].sort((a, b) => b[1] - a[1]).findIndex(([s]) => s === slug) + 1;
    return {
      title: `${name} on MakersMap`, back: `/city/${slug}`,
      data: {
        kicker: `${flag} ${country.toUpperCase()}`,
        title: `${name}.`,
        subtitle: `${inCity.length} ${inCity.length === 1 ? "maker" : "makers"} on the map · ${rank(position)} city in the world`,
        lines: [open ? `${open} open to meet in person` : "", coffee ? `${coffee} up for coffee this week` : "", `Founders, developers, designers, and more`].filter(Boolean),
        faces: inCity.filter((m) => m.avatar).slice(0, 5).map(face),
        stat: { value: String(inCity.length), label: "makers" },
        accent: "#3f6b4e",
        path: `/city/${slug}`,
        postText: `${name} has ${inCity.length} makers on MakersMap${open ? `, ${open} open to meet` : ""}. If you build things in ${name}, pin yourself.`,
        fileName: `makersmap-${slug}`,
      },
    };
  }
  if (kind === "country") {
    const inCountry = everyone.filter((m) => countrySlug(m.country || "") === slug);
    if (!inCountry.length) return null;
    const name = inCountry[0].country, flag = inCountry[0].flag;
    const byCountry = new Map<string, number>();
    for (const m of everyone) byCountry.set(countrySlug(m.country || ""), (byCountry.get(countrySlug(m.country || "")) || 0) + 1);
    const position = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).findIndex(([s]) => s === slug) + 1;
    const cities = new Set(inCountry.filter(hasCity).map((m) => m.city)).size;
    return {
      title: `${name} on MakersMap`, back: `/country/${slug}`,
      data: {
        kicker: `${flag} LEADERBOARD`,
        title: `${name} is ${rank(position)}.`,
        subtitle: `${inCountry.length} builders across ${cities} ${cities === 1 ? "city" : "cities"}`,
        lines: [`${rank(position)} of ${byCountry.size} countries by makers on the map`, "Founders, developers, designers, marketers", "Pin yourself and move your country up"],
        faces: inCountry.filter((m) => m.avatar).slice(0, 5).map(face),
        stat: { value: rank(position), label: "in the world" },
        accent: "#c46a32",
        path: `/country/${slug}`,
        postText: `${name} is ${rank(position)} in the world on MakersMap with ${inCountry.length} builders. Pin yourself and move us up.`,
        fileName: `makersmap-${slug}`,
      },
    };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kind, slug } = await params;
  const built = await build(kind, slug);
  return { title: built ? `${built.title} · share card` : "Share card", robots: { index: false, follow: false } };
}

export default async function SharePage({ params }: { params: Promise<Params> }) {
  const { kind, slug } = await params;
  const built = await build(kind, slug);
  if (!built) notFound();
  return (
    <div className="public-profile card-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href={built.back}>Back</Link>
      </header>
      <main className="card-main">
        <ShareClient data={built.data} />
      </main>
    </div>
  );
}
