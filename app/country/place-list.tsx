"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Coffee, MessageCircle, Users } from "lucide-react";
import { Avatar } from "../maker-ui";
import { profilePath } from "../handle";
import { isCoffeeThisWeek, isOpenInPerson, isOpenToConnect } from "../profile";
import type { MakerRow } from "@/lib/tiers";

// A country's or city's people, a page at a time. The server renders the
// first page for search engines and first paint; the rest arrives as you scroll.
export function PlaceList({ kind, slug, placeName, initial, total }: { kind: "country" | "city"; slug: string; placeName: string; initial: MakerRow[]; total: number }) {
  const [rows, setRows] = useState<MakerRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = rows.length >= total;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/makers/place?${kind}=${encodeURIComponent(slug)}&offset=${rows.length}&limit=60`);
        const data = await response.json() as { rows?: MakerRow[] };
        if (Array.isArray(data.rows)) setRows((prev) => { const seen = new Set(prev.map((r) => r.id)); return [...prev, ...data.rows!.filter((r) => !seen.has(r.id))]; });
      } catch {} finally { setLoading(false); }
    }, { rootMargin: "500px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows.length, done, loading, kind, slug]);

  return (
    <>
      <ul className="country-list">
        {rows.map((m) => {
          const meet = { lookingFor: m.lookingFor as never, openToMeeting: m.openToMeeting as never, coffee: m.coffee, coffeeWeek: m.coffeeWeek };
          return (
            <li key={m.id}>
              <Link href={m.handle ? profilePath(m.handle) : "/"}>
                <Avatar maker={{ avatar: m.avatar, color: m.color, initials: m.initials }} size={40} />
                <span>
                  <strong>{m.name}</strong>
                  <small>{m.xHandle ? `@${m.xHandle} · ` : ""}{m.placeLevel === "country" ? `Somewhere in ${placeName}` : m.city} · {m.role}{m.project ? ` · ${m.project}` : ""}</small>
                </span>
                {isCoffeeThisWeek(meet) ? <em className="coffee-pill"><Coffee size={12} />This week</em> : isOpenInPerson(meet) ? <em className="coffee-pill"><Users size={12} />Open to meet</em> : isOpenToConnect(meet) ? <em className="coffee-pill connect"><MessageCircle size={12} />Open to connect</em> : <ArrowUpRight size={15} />}
              </Link>
            </li>
          );
        })}
      </ul>
      {!done && <div ref={sentinel} className="shelf-sentinel">Showing {rows.length} of {total}{loading ? " · loading…" : " · loading more as you scroll"}</div>}
    </>
  );
}
