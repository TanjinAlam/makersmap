import type { Metadata } from "next";
import { profilePath, projectPath } from "@/app/handle";
import { whereOf, type Maker, type Project } from "@/app/profile";

export const SITE_NAME = "MakersMap";
export const DEFAULT_TITLE = "MakersMap — A world of good company";
export const DEFAULT_DESCRIPTION =
  "A city-level atlas of makers. See what someone is building, and why you should say hello.";

export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://makersmap.com";
}

export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${normalized}`;
}

function clip(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

export function pageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "profile";
}): Metadata {
  const url = absoluteUrl(path);
  const metaTitle = title === DEFAULT_TITLE ? title : title;
  const metaDescription = clip(description);

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type,
      locale: "en_US",
      url,
      siteName: SITE_NAME,
      title: metaTitle,
      description: metaDescription,
    },
    twitter: {
      card: "summary",
      title: metaTitle,
      description: metaDescription,
    },
  };
}

export function homeMetadata(): Metadata {
  return {
    ...pageMetadata({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: "/",
    }),
    title: { absolute: DEFAULT_TITLE },
  };
}

export function dispatchesMetadata(): Metadata {
  return pageMetadata({
    title: "Dispatches",
    description:
      "Small updates from makers on MakersMap — what shipped, what’s stuck, and who is looking for a hello.",
    path: "/dispatches",
  });
}

export function projectsMetadata(): Metadata {
  return pageMetadata({
    title: "Projects",
    description:
      "Explore the projects makers are building on MakersMap, then meet the people behind them.",
    path: "/projects",
  });
}

export function makerTitle(maker: Maker): string {
  const handle = maker.handle ? ` (@${maker.handle})` : "";
  const project = maker.project ? ` · ${maker.project}` : "";
  return clip(`${maker.name}${handle}${project}`, 60);
}

export function makerDescription(maker: Maker): string {
  const where = whereOf(maker);
  const role = maker.role || "maker";
  const building = maker.project
    ? `${maker.name} is a ${role} in ${where} building ${maker.project}${maker.description ? ` — ${maker.description}` : "."}`
    : `${maker.name} is a ${role} in ${where} on MakersMap.`;
  const looking = maker.lookingFor.length ? ` Looking for ${maker.lookingFor.join(", ")}.` : "";
  return clip(building + looking);
}

export function makerMetadata(maker: Maker): Metadata {
  const path = maker.handle ? profilePath(maker.handle) : "/";
  const meta = pageMetadata({
    title: makerTitle(maker),
    description: makerDescription(maker),
    path,
    type: "profile",
  });
  // Listed-but-unclaimed pins stay out of search engines until the person claims them.
  if (maker.source === "x-intro" && !maker.claimed) return { ...meta, robots: { index: false, follow: false } };
  return meta;
}

export function projectMetadata(maker: Maker, project: Project): Metadata {
  const path = maker.handle ? projectPath(maker.handle, project.id) : "/";
  const description = `${project.name} by ${maker.name}${maker.city ? ` in ${maker.city}` : ""}${project.description ? `: ${project.description}` : "."}${project.stage ? ` Stage: ${project.stage}.` : ""}`;
  return pageMetadata({
    title: clip(`${project.name} · ${maker.name}`, 60),
    description,
    path,
  });
}

export function projectJsonLd(maker: Maker, project: Project) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.name,
    description: project.description || undefined,
    url: maker.handle ? absoluteUrl(projectPath(maker.handle, project.id)) : siteUrl(),
    sameAs: project.website || undefined,
    creator: {
      "@type": "Person",
      name: maker.name,
      url: maker.handle ? absoluteUrl(profilePath(maker.handle)) : siteUrl(),
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl(),
    description: DEFAULT_DESCRIPTION,
  };
}

export function makerJsonLd(maker: Maker) {
  const sameAs = [maker.connect?.url, maker.website].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: maker.name,
    url: maker.handle ? absoluteUrl(profilePath(maker.handle)) : siteUrl(),
    jobTitle: maker.role,
    description: makerDescription(maker),
    address: {
      "@type": "PostalAddress",
      addressLocality: maker.city,
      addressCountry: maker.country || undefined,
    },
    sameAs: sameAs.length ? sameAs : undefined,
  };
}
