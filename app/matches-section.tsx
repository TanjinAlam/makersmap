"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { profilePath } from "./handle";

type PublicMatch = {
  id: number; handle?: string; xHandle?: string; name: string; role: string; city: string; flag: string;
  avatar: string; initials: string; color: string; project: string;
  lookingFor: string[]; canHelpWith: string[]; score: number; reasons: string[]; theirReasons: string[]; intro: string; theirIntro: string;
};

export function MatchesSection({ handle, firstName }: { handle: string; firstName: string }) {
  const [matches, setMatches] = useState<PublicMatch[] | null>(null);
  const [source, setSource] = useState<"claude" | "rules">("rules");

  useEffect(() => {
    if (!handle) return;
    const controller = new AbortController();
    fetch(`/api/matches/${encodeURIComponent(handle)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) { setMatches([]); return; }
        const data = await response.json() as { matches?: PublicMatch[]; source?: "claude" | "rules" };
        setMatches(Array.isArray(data.matches) ? data.matches : []);
        if (data.source) setSource(data.source);
      })
      .catch(() => { if (!controller.signal.aborted) setMatches([]); });
    return () => controller.abort();
  }, [handle]);

  if (matches === null) {
    return (
      <section className="profile-matches" aria-busy="true">
        <span className="section-kicker">People {firstName} should meet</span>
        <div className="match-grid">{[0, 1, 2].map((i) => <div key={i} className="match-card skeleton" />)}</div>
      </section>
    );
  }
  if (!matches.length) return null;

  return (
    <section className="profile-matches" aria-label={`People ${firstName} should meet`}>
      <div className="public-projects-head">
        <span className="section-kicker">People {firstName} should meet</span>
        <span className="match-source"><Sparkles size={12} />{source === "claude" ? "Intros written by AI" : "Matched on profiles"}</span>
      </div>
      <div className="match-grid">
        {matches.map((match) => (
          <Link key={match.id} className="match-card" href={match.handle ? profilePath(match.handle) : "/"}>
            <div className="match-card-head">
              {match.avatar ? <img className="avatar" src={match.avatar} alt="" width={44} height={44} /> : <span className="avatar initials" style={{ width: 44, height: 44, background: match.color }}>{match.initials}</span>}
              <span>
                <strong>{match.name}</strong>
                <small>{match.xHandle ? `@${match.xHandle} · ` : ""}{match.flag} {match.city} · {match.role}</small>
              </span>
              <ArrowUpRight size={16} />
            </div>
            <div className="match-side">
              <span>For {firstName}</span>
              <p className="match-intro">{match.intro || match.reasons[0] || "Worth a hello."}</p>
            </div>
            <div className="match-side theirs">
              <span>For {match.name.split(" ")[0]}</span>
              <p className="match-intro">{match.theirIntro || match.theirReasons[0] || `${firstName} would enjoy hearing what you're working on.`}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
