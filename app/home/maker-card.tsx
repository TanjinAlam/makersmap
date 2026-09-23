"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Box, MessageCircle, Sparkles, Users } from "lucide-react";
import { Avatar } from "../maker-ui";
import { profilePath } from "../handle";
import { isOpenInPerson, isOpenToConnect, lookingForText, placeLabel, xHandleOf, type Maker } from "../profile";

// One card on the "Meet someone interesting" grid.
export function MakerCard({ maker: m, selected, isOwn, saved, reason, onSelect, onToggleSave, onOpen }: {
  maker: Maker; selected: boolean; isOwn: boolean; saved: boolean; reason?: string;
  onSelect: (m: Maker) => void; onToggleSave: (m: Maker) => void; onOpen: (m: Maker) => void;
}) {
  return (
    <article className={"maker-card" + (selected ? " selected" : "") + (reason ? " asked" : "")}>
      {reason && <p className="maker-card-reason"><Sparkles size={13} />{reason}</p>}
      <div className="maker-card-header">
        <button className="maker-identity" onClick={() => onSelect(m)} aria-label={"Show " + m.name + " on the map"} aria-pressed={selected} disabled={!m.city && !m.country}>
          <Avatar maker={m} size={46} />
          <span><strong>{m.name}{isOwn && <em> You</em>}</strong><small>{m.flag} {placeLabel(m)}{xHandleOf(m) ? ` · @${xHandleOf(m)}` : m.handle ? ` · @${m.handle}` : ""}<i /> {m.role}</small></span>
        </button>
        <button className={"icon-button save-button" + (saved ? " is-saved" : "")} onClick={() => onToggleSave(m)} aria-label={(saved ? "Unsave " : "Save ") + m.name} aria-pressed={saved}><Bookmark size={17} /></button>
      </div>
      <div className="maker-card-project">
        <span>BUILDING</span>
        <strong>{m.project || "A new pin"}{m.projects.length > 1 && <em className="more-projects"> +{m.projects.length - 1} more</em>}</strong>
        <p>{m.description || (m.lookingFor.length ? lookingForText(m.lookingFor) : m.role)}</p>
      </div>
      <div className="maker-card-footer">
        <span>{isOpenInPerson(m) ? <><Users size={14} />Open to meet</> : isOpenToConnect(m) ? <><MessageCircle size={14} />Open to connect</> : <><Box size={14} />{m.tags[0] || m.role}</>}</span>
        <Link href={m.handle ? profilePath(m.handle) : "/"} onClick={() => onOpen(m)}>Meet {m.name.split(" ")[0]}<ArrowUpRight size={16} /></Link>
      </div>
    </article>
  );
}
