"use client";

import { useState } from "react";
import { useStoredState } from "../use-stored";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Coffee, ExternalLink, MapPin, Plus, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { profilePath } from "../handle";
import type { Meetup } from "@/lib/meetups";

export type CityMaker = {
  id: number; handle?: string; xHandle?: string; name: string; role: string; avatar: string; initials: string; color: string;
  project: string; description: string; lookingFor: string[]; canHelpWith: string[];
  coffeeThisWeek: boolean; openToMeeting: string[]; claimed: boolean;
};

// Formatted in the city's own time zone: it's the only zone that makes sense for a
// local meetup, and it keeps server and client output identical during hydration.
function when(date: string, timeZone?: string): string {
  const d = new Date(date);
  try {
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timeZone || "UTC" });
  } catch {
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  }
}

const parseOwnHandle = (raw: string | null): string | null => {
  try { const own = JSON.parse(raw || "null"); return own && own.claimed && typeof own.handle === "string" ? own.handle : null; } catch { return null; }
};

export function CityMakers({ city, timezone, makers, meetups: initialMeetups }: { city: string; timezone?: string; makers: CityMaker[]; meetups: Meetup[] }) {
  const [coffeeOnly, setCoffeeOnly] = useState(false);
  const [meetups, setMeetups] = useState(initialMeetups);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", where: "", url: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [ownHandle] = useStoredState<string | null>("makersmap-own", parseOwnHandle);

  const shown = coffeeOnly ? makers.filter((m) => m.coffeeThisWeek) : makers;
  const coffeeCount = makers.filter((m) => m.coffeeThisWeek).length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ownHandle) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/meetups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, title: form.title, date: form.date, where: form.where, url: form.url, host: ownHandle }),
      });
      const data = await response.json() as { meetup?: Meetup; error?: string };
      if (!response.ok || !data.meetup) { setError(data.error || "Could not add the meetup."); return; }
      setMeetups((list) => [...list, data.meetup as Meetup].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setForm({ title: "", date: "", where: "", url: "" });
      setAdding(false);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="city-body">
      <section className="city-makers">
        <div className="public-projects-head">
          <span className="section-kicker">{coffeeOnly ? `Up for coffee this week · ${coffeeCount}` : `Makers in ${city} · ${makers.length}`}</span>
          <button type="button" className={"filter-chip" + (coffeeOnly ? " active" : "")} aria-pressed={coffeeOnly} onClick={() => setCoffeeOnly(!coffeeOnly)}>
            <Coffee size={15} />Up for coffee this week{coffeeCount > 0 && <span>{coffeeCount}</span>}
          </button>
        </div>
        {shown.length ? (
          <div className="city-maker-grid">
            {shown.map((m) => (
              <Link key={m.id} className="city-maker-card" href={m.handle ? profilePath(m.handle) : "/"}>
                <div className="match-card-head">
                  {m.avatar ? <img className="avatar" src={m.avatar} alt="" width={44} height={44} /> : <span className="avatar initials" style={{ width: 44, height: 44, background: m.color }}>{m.initials}</span>}
                  <span><strong>{m.name}</strong><small>{m.xHandle ? `@${m.xHandle} · ` : ""}{m.role}{m.project ? ` · ${m.project}` : ""}</small></span>
                  {m.coffeeThisWeek ? <em className="coffee-pill"><Coffee size={12} />This week</em> : <ArrowUpRight size={16} />}
                </div>
                {m.description && <p>{m.description}</p>}
                {m.lookingFor.length > 0 && <div className="passport-looking-chips small">{m.lookingFor.map((item) => <span key={item}>{item}</span>)}</div>}
              </Link>
            ))}
          </div>
        ) : (
          <p className="city-empty">Nobody in {city} has said they&apos;re up for coffee this week yet. Be the first from your profile page.</p>
        )}
      </section>

      <section className="city-meetups">
        <div className="public-projects-head">
          <span className="section-kicker">Upcoming meetups · {meetups.length}</span>
          {ownHandle ? (
            <button type="button" className="filter-chip" onClick={() => setAdding(!adding)}><Plus size={15} />{adding ? "Cancel" : "Add a meetup"}</button>
          ) : (
            <span className="city-hint">Claim your pin to add a meetup</span>
          )}
        </div>
        {adding && (
          <form className="meetup-form" onSubmit={submit}>
            <Input required maxLength={120} placeholder="What is it? e.g. Makers coffee at Fábrica" aria-label="Meetup title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="meetup-form-row">
              <Input required type="datetime-local" aria-label="When" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input maxLength={160} placeholder="Where" aria-label="Where" value={form.where} onChange={(e) => setForm({ ...form, where: e.target.value })} />
            </div>
            <Input placeholder="Link, optional" aria-label="Link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            {error && <p className="ask-error">{error}</p>}
            <button type="submit" className="join-next" disabled={busy}>{busy ? "Adding…" : "Add meetup"}</button>
          </form>
        )}
        {meetups.length ? (
          <ul className="meetup-list">
            {meetups.map((meetup) => (
              <li key={meetup.id} className="meetup">
                <span className="meetup-date"><CalendarDays size={15} />{when(meetup.date, timezone)}{timezone ? " local" : ""}</span>
                <span className="meetup-body">
                  <strong>{meetup.title}</strong>
                  <small>
                    {meetup.where && <><MapPin size={12} />{meetup.where}</>}
                    {meetup.host && <> · hosted by <Link href={profilePath(meetup.host)}>@{meetup.host}</Link></>}
                    
                  </small>
                </span>
                {meetup.url && <a className="meetup-link" href={meetup.url} target="_blank" rel="nofollow noopener">Details <ExternalLink size={13} /></a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="city-empty"><Users size={16} />No meetups yet in {city}. The first one is usually just coffee.</p>
        )}
      </section>
    </div>
  );
}
