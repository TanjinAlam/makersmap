import type { MetadataRoute } from "next";
import { profilePath, projectPath } from "@/app/handle";
import { listPublicMakers } from "@/app/makers-lookup";
import { absoluteUrl } from "@/lib/seo";
import { citySlug, hasCity } from "@/app/profile";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const makers = await listPublicMakers();
  const now = new Date();

  const profiles = makers
    .filter((maker) => maker.handle)
    .map((maker) => ({
      url: absoluteUrl(profilePath(maker.handle as string)),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: maker.claimed ? 0.8 : 0.6,
    }));

  const projects = makers
    .filter((maker) => maker.handle)
    .flatMap((maker) => maker.projects.map((project) => ({
      url: absoluteUrl(projectPath(maker.handle as string, project.id)),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })));

  const cities = [...new Set(makers.filter(hasCity).map((maker) => citySlug(maker.city)))].map((slug) => ({
    url: absoluteUrl(`/city/${slug}`),
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/city"), lastModified: now, changeFrequency: "daily", priority: 0.6 },
    ...cities,
    ...projects,
    { url: absoluteUrl("/projects"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...profiles,
  ];
}
