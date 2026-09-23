import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Site">
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/leaderboard">Leaderboard</Link>
        <Link href="/city">Cities</Link>
        <Link href="/projects">Projects</Link>
        <Link href="/remove">Remove a pin</Link>
      </nav>
      <p>A city-level atlas of makers. Pins listed from public intro posts stay out of search engines until claimed.</p>
    </footer>
  );
}
