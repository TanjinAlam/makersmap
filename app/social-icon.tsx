import {
  siBehance, siBluesky, siDiscord, siDribbble, siFacebook, siFigma, siGithub, siIndiehackers, siInstagram,
  siMastodon, siMedium, siProducthunt, siReddit, siSubstack, siTelegram, siThreads, siTiktok, siTwitch, siX, siYoutube,
} from "simple-icons";
import type { ConnectKind } from "./profile";

type Glyph = { path: string; hex: string };

// LinkedIn isn't in simple-icons for trademark reasons, so it's drawn here.
const linkedin: Glyph = {
  hex: "0A66C2",
  path: "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z",
};

const glyphs: Partial<Record<ConnectKind, Glyph>> = {
  X: siX, LinkedIn: linkedin, GitHub: siGithub, Dribbble: siDribbble, Behance: siBehance, YouTube: siYoutube,
  Instagram: siInstagram, TikTok: siTiktok, Threads: siThreads, Bluesky: siBluesky, Mastodon: siMastodon,
  "Product Hunt": siProducthunt, "Indie Hackers": siIndiehackers, Substack: siSubstack, Medium: siMedium,
  Twitch: siTwitch, Figma: siFigma, Discord: siDiscord, Telegram: siTelegram, Reddit: siReddit, Facebook: siFacebook,
};

export function brandColor(kind: ConnectKind): string {
  const hex = glyphs[kind]?.hex;
  // Pure black brands (X, TikTok, Threads, Medium) get the ink colour so hover still reads as a change.
  return hex && hex !== "000000" ? `#${hex}` : "#1d2a20";
}

export function SocialIcon({ kind, size = 16 }: { kind: ConnectKind; size?: number }) {
  const glyph = glyphs[kind];
  if (!glyph) {
    return kind === "Website" ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    ) : (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={glyph.path} />
    </svg>
  );
}
