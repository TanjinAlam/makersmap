import type { Metadata } from "next";
import Link from "next/link";
import { AdminClient } from "./admin-client";
import { BrandMark } from "@/app/brand";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="public-profile admin-page">
      <header className="public-profile-nav">
        <Link className="brand" href="/" aria-label="MakersMap home">
          <BrandMark />
          makersmap<span className="brand-period">.</span>
        </Link>
        <span className="public-profile-atlas">Admin console</span>
      </header>
      <main className="admin-card">
        <AdminClient />
      </main>
    </div>
  );
}
