import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Pin, Users, Coffee, Sparkles } from "lucide-react";
import { JsonLd } from "../../json-ld";
import { Avatar } from "../../maker-ui";
import { OutboundLink } from "../../outbound";
import { listPublicMakers, resolveMakerByHandle } from "../../makers-lookup";
import { profilePath } from "../../handle";

const profilePathOf = (handle?: string) => (handle ? profilePath(handle) : "/");
import { LocalTime, ProfileActions, ProjectsSection } from "../../profile-actions";
import { SocialIcon, brandColor } from "../../social-icon";
import { MatchesSection } from "../../matches-section";
import { citySlug, makerMrr, whereOf, xHandleOf, xProfileUrl } from "../../profile";
import { money } from "../../data";
import { makerJsonLd, makerMetadata } from "@/lib/seo";
import { recordSignal } from "@/lib/signals";
import { isMongoConfigured } from "@/db";
import { findMakerByHandle } from "@/db/makers";
import { BrandMark } from "@/app/brand";

type ProfileParams = { handle: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<ProfileParams>;
}): Promise<Metadata> {
  const { handle } = await params;
  const maker = await resolveMakerByHandle(handle);
  if (!maker) {
    return {
      title: "Maker not found",
      description: "This handle is not on MakersMap yet.",
      robots: { index: false, follow: false },
    };
  }

  return makerMetadata(maker);
}

function memberSince(joinedAt?: string): string {
  if (!joinedAt) return "";
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function MakerProfilePage({
  params,
}: {
  params: Promise<ProfileParams>;
}) {
  const { handle } = await params;
  const maker = await resolveMakerByHandle(handle);
  if (!maker) notFound();

  const where = whereOf(maker);
  const first = maker.name.split(" ")[0];
  if (isMongoConfigured() && maker.handle) recordSignal(maker.handle, "view").catch(() => undefined);
  const intro = maker.bio || `${maker.role} in ${maker.city}${maker.project ? `, building ${maker.project}` : ""}.`;
  const total = makerMrr(maker);
  const since = memberSince(maker.joinedAt);
  const everyone = await listPublicMakers();
  // The public record has private settings stripped; the owner's own email toggle needs the stored value.
  const emailUpdates = maker.claimed && maker.handle && isMongoConfigured() ? (await findMakerByHandle(maker.handle))?.emailUpdates : undefined;
  const invited = maker.handle ? everyone.filter((m) => m.invitedBy === maker.handle) : [];
  const inviter = maker.invitedBy ? everyone.find((m) => m.handle === maker.invitedBy) : undefined;
  const hasHelloCard = maker.lookingFor.length > 0 || maker.canHelpWith.length > 0 || maker.openToMeeting.length > 0;

  // Pins listed from a public post get the same full profile, built from what
  // the post and bio said, plus a claim block; they stay out of search engines until claimed.
  const unclaimedListing = maker.source === "x-intro" && !maker.claimed;

  return (
    <div className="public-profile">
      <JsonLd data={makerJsonLd(maker)} />
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href={maker.handle ? `/?maker=${encodeURIComponent(maker.handle)}` : "/"}>
          Find on the atlas <ArrowUpRight size={16} />
        </Link>
      </header>

      <main className="public-profile-card">
        {/* Zone 1: identity */}
        <aside className="public-profile-identity">
          <div className="public-profile-portrait">
            <Avatar maker={maker} size={132} />
            <span className="passport-number">MAKER / {String(maker.id).padStart(3, "0")}</span>
          </div>
          <p className="section-kicker">{maker.claimed ? "Claimed pin" : maker.source === "x-intro" ? "Listed pin" : "Community atlas"}</p>
          <h1>
            {maker.name}
            {maker.claimed ? <em className="claim-badge claimed">Claimed</em> : maker.source === "x-intro" ? <em className="claim-badge">Listed</em> : null}
          </h1>
          {xHandleOf(maker) ? (
            <OutboundLink className="public-profile-x" href={xProfileUrl(xHandleOf(maker) as string)} maker={maker}>
              <SocialIcon kind="X" size={14} />@{xHandleOf(maker)}<span>on X</span>
            </OutboundLink>
          ) : maker.handle ? (
            <p className="public-profile-handle">@{maker.handle}</p>
          ) : null}
          <p className="public-profile-role">{maker.role}</p>
          {where ? (
            <p className="public-profile-place">{maker.flag} <Link href={`/city/${citySlug(maker.city)}`}>{where}</Link></p>
          ) : (
            <p className="public-profile-place quiet">Location unknown{unclaimedListing ? " · add it when you claim" : ""}</p>
          )}
          {maker.timezone && <LocalTime timezone={maker.timezone} />}
          {maker.tags.length > 0 && (
            <div className="passport-tags public-profile-tags">
              {maker.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          {maker.links.length > 0 && (
            <div className="public-profile-links" aria-label="Where to find them">
              {maker.links.map((link) => {
                const host = link.url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "");
                const label = link.kind === "Website" || link.kind === "Other" ? host : link.kind;
                return (
                  <OutboundLink key={link.url} className="public-profile-link" href={link.url} maker={maker} referral={link.kind === "Website" || link.kind === "Other" ? "profile" : undefined}>
                    <span className="public-profile-link-icon" style={{ ["--brand" as string]: brandColor(link.kind) }}><SocialIcon kind={link.kind} size={15} /></span>
                    <span>{label}</span>
                  </OutboundLink>
                );
              })}
            </div>
          )}
          <ProfileActions maker={{ ...maker, emailUpdates }} />
          {maker.handle && (
            <div className="share-links" aria-label="Share">
              <Link href={`/share/maker/${encodeURIComponent(maker.handle)}`}>Share this pin <ArrowUpRight size={13} /></Link>
              <Link href={`/share/matches/${encodeURIComponent(maker.handle)}`}>Share {first}&apos;s matches <ArrowUpRight size={13} /></Link>
            </div>
          )}
          {unclaimedListing && (
            <div className="listed-pin-actions profile-claim-block">
              <Link className="join-next" href={`/claim?handle=${encodeURIComponent(maker.handle || "")}`}>This is me, claim this pin <ArrowUpRight size={15} /></Link>
              <Link className="join-ghost" href={`/remove?handle=${encodeURIComponent(maker.handle || "")}`}>Not for me, remove it</Link>
              <p className="claim-fine">Built from {first}&apos;s public intro post. Once claimed, {first} controls every word here, can add projects and links, and the page becomes searchable.</p>
            </div>
          )}
        </aside>

        <div className="public-profile-copy">
          {/* Zone 2: why say hello */}
          <section className="profile-intro">
            <p className="profile-bio">{intro}</p>
          </section>

          {maker.x?.postText && maker.x.pinned !== false && (
            <section className="pinned-post" aria-label="Pinned post">
              <span className="section-kicker"><Pin size={13} /> Pinned · the post that put {maker.name.split(" ")[0]} on the map{maker.x.postedAt ? ` · ${new Date(maker.x.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</span>
              <blockquote className="listed-post">
                <p>{maker.x.postText}</p>
                <OutboundLink href={maker.x.postUrl} maker={maker}>Read the post on X <ExternalLink size={13} /></OutboundLink>
              </blockquote>
            </section>
          )}

          {hasHelloCard && (
            <section className="hello-card" aria-label="Why say hello">
              <span className="section-kicker">A good reason to say hello</span>
              <div className="hello-card-grid">
                <div className="hello-card-cell">
                  <h3><ArrowDownRight size={16} />Looking for</h3>
                  {maker.lookingFor.length ? (
                    <div className="passport-looking-chips">{maker.lookingFor.map((item) => <span key={item}>{item}</span>)}</div>
                  ) : (
                    <p className="hello-card-empty">Not shared yet.</p>
                  )}
                </div>
                <div className="hello-card-cell">
                  <h3><ArrowUpRight size={16} />Can help with</h3>
                  {maker.canHelpWith.length ? (
                    <div className="passport-looking-chips quiet">{maker.canHelpWith.map((item) => <span key={item}>{item}</span>)}</div>
                  ) : (
                    <p className="hello-card-empty">Not shared yet.</p>
                  )}
                </div>
              </div>
              {maker.openToMeeting.length > 0 && (
                <div className="hello-card-foot">
                  <Users size={14} />
                  <span>Open to</span>
                  {maker.openToMeeting.map((item) => <em key={item}>{item === "Coffee" && <Coffee size={12} />}{item.toLowerCase()}</em>)}
                </div>
              )}
            </section>
          )}

          {/* Zone 3: the work */}
          <ProjectsSection maker={maker} />

          {(maker.skills.length > 0 || maker.workSamples.length > 0) && (
            <section className="profile-craft">
              {maker.skills.length > 0 && (
                <div>
                  <span className="section-kicker">Skills and tools</span>
                  <div className="skill-chips">{maker.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                </div>
              )}
              {maker.workSamples.length > 0 && (
                <div>
                  <span className="section-kicker">Work samples</span>
                  <ul className="work-samples">
                    {maker.workSamples.map((sample) => (
                      <li key={sample.url}>
                        <OutboundLink href={sample.url} maker={maker}>
                          <Sparkles size={14} />
                          <span>{sample.label}</span>
                          <small>{sample.url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "")}</small>
                          <ExternalLink size={13} />
                        </OutboundLink>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <MatchesSection handle={maker.handle || ""} firstName={maker.name.split(" ")[0]} />

          {/* Zone 4: signals */}
          <section className="profile-signals">
            <div className="signal-tiles">
              {since && <div><span>On the map since</span><strong>{since}</strong></div>}
              <div><span>Projects</span><strong>{maker.projects.length}</strong></div>
              {total !== null && <div><span>Self-reported MRR</span><strong>{money(total)}</strong></div>}
              {invited.length > 0 && <div><span>Brought to the map</span><strong>{invited.length}</strong></div>}
            </div>
            {(invited.length > 0 || inviter) && (
              <div className="signal-invites">
                {inviter && <p>Invited by <Link href={profilePathOf(inviter.handle)}>{inviter.name}</Link>.</p>}
                {invited.length > 0 && (
                  <p>Brought in {invited.slice(0, 6).map((m, i) => <span key={m.id}>{i > 0 ? ", " : ""}<Link href={profilePathOf(m.handle)}>{m.name}</Link></span>)}{invited.length > 6 ? ` and ${invited.length - 6} more` : ""}.</p>
                )}
              </div>
            )}
            {maker.latestUpdate?.text && maker.latestUpdate.url !== maker.x?.postUrl && (
              <div className="signal-update">
                <span className="section-kicker">Latest update</span>
                <p>
                  {maker.latestUpdate.text}
                  {maker.latestUpdate.url && (
                    <> <OutboundLink href={maker.latestUpdate.url} maker={maker}>Read more <ExternalLink size={13} /></OutboundLink></>
                  )}
                </p>
              </div>
            )}
          </section>

          <p className="public-profile-foot">
            <Link className="join-ghost" href={maker.handle ? `/?maker=${encodeURIComponent(maker.handle)}` : "/"}>
              Find {maker.name.split(" ")[0]} on the atlas <ArrowUpRight size={16} />
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
