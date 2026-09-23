import type { Metadata } from "next";
import { HomeClient } from "./home-client";
import { homeMetadata } from "@/lib/seo";

export const metadata: Metadata = homeMetadata();

export default function HomePage() {
  return <HomeClient tab="explore" />;
}
