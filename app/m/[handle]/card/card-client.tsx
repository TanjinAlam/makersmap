"use client";

import { useRef, useState } from "react";
import { useHydrated } from "../../../use-stored";
import { Check, Copy, Download, LoaderCircle, Orbit } from "lucide-react";
import { toPng } from "html-to-image";
import { SocialIcon } from "../../../social-icon";

type CardMaker = {
  id: number; name: string; xHandle: string; city: string; country: string; flag: string; role: string;
  avatar: string; initials: string; color: string; project: string; description: string; lookingFor: string[]; tags: string[];
};

// A 1200x630 passport that renders in the browser and downloads as a PNG, so
// makers can post their own pin on X. No server-side image pipeline needed.
export function CardClient({ handle, maker }: { handle: string; maker: CardMaker }) {
  const card = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  // The origin is only known in the browser; resolving it after mount keeps server and client markup identical.
  const hydrated = useHydrated();
  const origin = hydrated ? window.location.origin : "";
  const profileUrl = `${origin}/m/${handle}`;
  const postText = `I'm on MakersMap, a city map of makers. Find me in ${maker.city}${maker.lookingFor.length ? `, looking for ${maker.lookingFor.join(", ").toLowerCase()}` : ""}: ${profileUrl}`;

  const download = async () => {
    if (!card.current) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await toPng(card.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#f4f6ec" });
      const link = document.createElement("a");
      link.download = `makersmap-${handle}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError("Couldn't render the image here. Try a different browser, or screenshot the card.");
    } finally {
      setBusy(false);
    }
  };

  const copyPost = async () => {
    try { await navigator.clipboard.writeText(postText); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div className="card-wrap">
      <div className="card-stage">
        <div ref={card} className="share-card" style={{ ["--accent" as string]: maker.color }}>
          <div className="share-card-left">
            {maker.avatar ? <img src={maker.avatar} alt="" crossOrigin="anonymous" /> : <span className="share-card-initials" style={{ background: maker.color }}>{maker.initials}</span>}
            <span className="share-card-number">MAKER / {String(maker.id).padStart(3, "0")}</span>
          </div>
          <div className="share-card-right">
            <div className="share-card-brand"><Orbit size={26} strokeWidth={1.8} />makersmap.</div>
            <h1>{maker.name}</h1>
            <p className="share-card-handle"><SocialIcon kind="X" size={18} />@{maker.xHandle || handle}</p>
            <p className="share-card-place">{maker.flag} {maker.city}{maker.country ? `, ${maker.country}` : ""} · {maker.role}</p>
            {maker.project && <p className="share-card-project"><strong>{maker.project}</strong>{maker.description ? ` — ${maker.description}` : ""}</p>}
            {maker.lookingFor.length > 0 && (
              <div className="share-card-looking"><span>Looking for</span>{maker.lookingFor.map((item) => <em key={item}>{item}</em>)}</div>
            )}
            <p className="share-card-url">makersmap.com/m/{handle}</p>
          </div>
        </div>
      </div>
      <div className="card-actions">
        <button type="button" className="join-next" onClick={() => void download()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}Download PNG</button>
        <button type="button" className="join-ghost" onClick={() => void copyPost()}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy a post to go with it</>}</button>
        <a className="join-ghost" href={`https://x.com/intent/post?text=${encodeURIComponent(postText)}`} target="_blank" rel="noopener"><SocialIcon kind="X" size={14} />Open X composer</a>
      </div>
      {error && <p className="ask-error">{error}</p>}
      <p className="claim-fine">Download the image, then attach it to the post. X shows attached images far more than link previews.</p>
    </div>
  );
}
