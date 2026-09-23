import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ExternalLink, Sparkles } from "lucide-react";
import { JsonLd } from "../../../json-ld";
import { Avatar, ProductIcon } from "../../../maker-ui";
import { OutboundLink } from "../../../outbound";
import { resolveMakerByHandle } from "../../../makers-lookup";
import { profilePath, projectPath } from "../../../handle";
import { formatRevenueDate } from "../../../profile";
import { money } from "../../../data";
import { projectJsonLd, projectMetadata } from "@/lib/seo";
import { BrandMark } from "@/app/brand";

type Params = { handle: string; project: string };

async function load(params: Promise<Params>) {
  const { handle, project } = await params;
  const maker = await resolveMakerByHandle(handle);
  const found = maker?.projects.find((p) => p.id === decodeURIComponent(project));
  return { maker, project: found };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { maker, project } = await load(params);
  if (!maker || !project) {
    return { title: "Project not found", robots: { index: false, follow: false } };
  }
  return projectMetadata(maker, project);
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { maker, project } = await load(params);
  if (!maker || !project) notFound();

  const mrr = project.revenue?.mrr ?? null;
  const label = project.revenue?.kind === "verified" ? "Verified" : "Self-reported";
  const when = project.revenue?.updatedAt ? formatRevenueDate(project.revenue.updatedAt) : "";
  const others = maker.projects.filter((p) => p.id !== project.id);
  const host = project.website ? project.website.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "") : "";

  return (
    <div className="public-profile project-page">
      <JsonLd data={projectJsonLd(maker, project)} />
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <Link className="public-profile-atlas" href="/projects">All projects <ArrowUpRight size={16} /></Link>
      </header>

      <main className="project-hero-card">
        <section className="project-hero">
          <ProductIcon maker={maker} size={72} name={project.name} color={project.color} logo={project.logo} />
          <div className="project-hero-text">
            <p className="section-kicker">{project.stage ? `${project.stage} · ` : ""}by <Link href={maker.handle ? profilePath(maker.handle) : "/"}>{maker.name}</Link></p>
            <h1>{project.name}</h1>
            {project.tagline && <p className="project-hero-pitch">{project.tagline}</p>}
            {project.description && <p className="project-hero-description">{project.description}</p>}
            <div className="project-hero-actions">
              {project.website && (
                <OutboundLink className="join-next" href={project.website} maker={maker} referral="project">
                  Visit {host || "website"} <ExternalLink size={15} />
                </OutboundLink>
              )}
              <Link className="join-ghost" href={maker.handle ? profilePath(maker.handle) : "/"}>
                Say hello to {maker.name.split(" ")[0]} <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        <div className="project-page-grid">
          <section className="project-page-main">
            <span className="section-kicker">The numbers</span>
            {mrr !== null ? (
              <div className="project-card-revenue">
                <div className="project-card-numbers">
                  <div><span>Monthly recurring</span><strong>{money(mrr)}</strong><small>MRR / USD</small></div>
                </div>
                <p className="project-card-source">{label}{when ? ` · updated ${when}` : ""}</p>
              </div>
            ) : (
              <div className="project-card-early"><Sparkles size={16} />No revenue shared yet · {project.stage ? project.stage.toLowerCase() : "building"}</div>
            )}

            {maker.latestUpdate?.text && (
              <div className="signal-update">
                <span className="section-kicker">Latest from {maker.name.split(" ")[0]}</span>
                <p>
                  {maker.latestUpdate.text}
                  {maker.latestUpdate.url && <> <OutboundLink href={maker.latestUpdate.url} maker={maker}>Read more <ExternalLink size={13} /></OutboundLink></>}
                </p>
              </div>
            )}
          </section>

          <aside className="project-page-aside">
            <span className="section-kicker">The maker</span>
            <Link className="project-maker-card" href={maker.handle ? profilePath(maker.handle) : "/"}>
              <Avatar maker={maker} size={56} />
              <span>
                <strong>{maker.name}</strong>
                <small>{maker.flag} {maker.city} · {maker.role}</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
            {maker.lookingFor.length > 0 && (
              <div className="project-maker-looking">
                <span>Looking for</span>
                <div className="passport-looking-chips">{maker.lookingFor.map((item) => <em key={item}>{item}</em>)}</div>
              </div>
            )}
            {others.length > 0 && (
              <div className="project-more">
                <span className="section-kicker">More from {maker.name.split(" ")[0]}</span>
                <ul>
                  {others.map((other) => (
                    <li key={other.id}>
                      <Link href={maker.handle ? projectPath(maker.handle, other.id) : "/"}>
                        <ProductIcon maker={maker} size={32} name={other.name} color={other.color} logo={other.logo} />
                        <span><strong>{other.name}</strong><small>{other.revenue?.mrr != null ? `${money(other.revenue.mrr)} MRR` : other.stage || "Building"}</small></span>
                        <ArrowUpRight size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
