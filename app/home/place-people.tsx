"use client";

import Link from "next/link";
import { ArrowUpRight, MessageCircle, Users } from "lucide-react";
import type { PlaceSelection } from "../atlas-map";
import { Avatar } from "../maker-ui";
import { profilePath } from "../handle";
import { citySlug, countrySlug, hasCity, isOpenInPerson, isOpenToConnect, xHandleOf, type Maker } from "../profile";

// Everyone inside the country, city, or cluster selected on the map.
export function PlacePeople({ selection, onClose, onHover }: { selection: PlaceSelection; onClose: () => void; onHover: (m: Maker) => void }) {
  const people = [...selection.makers].sort((a, b) => Number(hasCity(b)) - Number(hasCity(a)) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  if (!people.length) return null;
  const first = people[0];
  const pageHref = selection.kind === "country" ? `/country/${countrySlug(first.country || "")}` : selection.kind === "city" && hasCity(first) ? `/city/${citySlug(first.city)}` : null;
  return (
    <section id="place-people" className="place-people" aria-label={`Everyone in ${selection.name}`}>
      <div className="place-people-head">
        <div>
          <span className="section-kicker">{selection.kind === "area" ? "Around here" : selection.kind}</span>
          <h2>Everyone in {selection.name}<span>{people.length}</span></h2>
        </div>
        <div className="place-people-actions">
          {pageHref && <Link href={pageHref}>Open {selection.kind} page <ArrowUpRight size={15} /></Link>}
          <button type="button" onClick={onClose} aria-label="Close this list">Close</button>
        </div>
      </div>
      <ul className="place-people-list">
        {people.map((m) => (
          <li key={m.id}>
            <Link href={m.handle ? profilePath(m.handle) : "/"} onMouseEnter={() => onHover(m)} onFocus={() => onHover(m)}>
              <Avatar maker={m} size={40} />
              <span>
                <strong>{m.name}</strong>
                <small>{xHandleOf(m) ? `@${xHandleOf(m)} · ` : ""}{hasCity(m) ? m.city : m.country} · {m.role}{m.project ? ` · ${m.project}` : ""}</small>
              </span>
              {isOpenInPerson(m) ? <em className="coffee-pill"><Users size={12} />Open to meet</em> : isOpenToConnect(m) ? <em className="coffee-pill connect"><MessageCircle size={12} />Open to connect</em> : <ArrowUpRight size={15} />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
