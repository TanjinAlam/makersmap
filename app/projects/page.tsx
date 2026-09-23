import type { Metadata } from "next";
import { HomeClient } from "../home-client";
import { projectsMetadata } from "@/lib/seo";

export const metadata: Metadata = projectsMetadata();

export default function ProjectsPage() {
  return <HomeClient tab="projects" />;
}
