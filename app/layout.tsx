import type { Metadata } from "next";
import { JsonLd } from "./json-ld";
import { SiteFooter } from "./site-footer";
import { readEnv } from "@/db";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME, siteUrl, websiteJsonLd } from "@/lib/seo";
import "./globals.css";
import "./globe.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["makers", "founders", "atlas", "indie hackers", "city map", "builders"],
  authors: [{ name: SITE_NAME }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: siteUrl(),
  },
  twitter: {
    card: "summary",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <JsonLd data={websiteJsonLd()} />
        {children}
        <SiteFooter />
        {readEnv("PLAUSIBLE_DOMAIN") && (
          <script defer data-domain={readEnv("PLAUSIBLE_DOMAIN")} src="https://plausible.io/js/script.js" />
        )}
      </body>
    </html>
  );
}
