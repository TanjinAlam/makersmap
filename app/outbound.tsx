import type { ReactNode } from "react";
import { safeHttpUrl } from "./http";
import type { Maker } from "./profile";

type LinkMaker = Pick<Maker, "claimed" | "source">;

// Social profiles and app stores ignore or strip tracking parameters; only a
// maker's own site gets them.
const NO_TRACKING = /(^|\.)(x\.com|twitter\.com|t\.co|linkedin\.com|instagram\.com|facebook\.com|youtube\.com|youtu\.be|tiktok\.com|threads\.net|bsky\.app|github\.com|producthunt\.com|apps\.apple\.com|play\.google\.com|discord\.gg|t\.me|wa\.me|calendly\.com)$/i;

/**
 * Adds "this came from MakersMap" to a link so the maker sees us in their
 * analytics: standard utm parameters for Google Analytics and friends, plus
 * ?ref=makersmap, which indie tools like Plausible and Fathom read directly.
 * Links that already carry utm parameters are left alone.
 */
export function withReferral(href: string, campaign: "project" | "profile" | "share" = "profile"): string {
  try {
    const url = new URL(href);
    if (NO_TRACKING.test(url.hostname)) return href;
    if ([...url.searchParams.keys()].some((k) => k.startsWith("utm_"))) return href;
    url.searchParams.set("utm_source", "makersmap");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", campaign);
    if (!url.searchParams.has("ref")) url.searchParams.set("ref", "makersmap");
    return url.toString();
  } catch { return href; }
}

export function outboundRel(maker?: LinkMaker | null, trusted = false): string {
  if (trusted || maker?.claimed || maker?.source === "self") return "noopener";
  return "nofollow noopener";
}

export function OutboundLink({
  href,
  maker,
  trusted = false,
  children,
  className,
  referral,
}: {
  href: string;
  maker?: LinkMaker | null;
  trusted?: boolean;
  children: ReactNode;
  className?: string;
  /** Tag the visit as coming from MakersMap; "project" for a product's own site. */
  referral?: "project" | "profile" | "share";
}) {
  const url = safeHttpUrl(href);
  if (!url) return null;
  const target = referral ? withReferral(url, referral) : url;

  return (
    <a className={className} href={target} target="_blank" rel={outboundRel(maker, trusted)}>
      {children}
    </a>
  );
}
