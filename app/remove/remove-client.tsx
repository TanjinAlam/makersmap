"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SocialIcon } from "../social-icon";

// Removing a listed pin needs proof it's yours: Sign in with X on the same
// account. The server refuses anything else, so nobody can delist other people.
export function RemoveClient({ handle, session, configured }: { handle: string; session: { username: string } | null; configured: boolean }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const target = handle || session?.username || "";
  const signInHref = `/api/auth/x/start?next=${encodeURIComponent(`/remove${target ? `?handle=${encodeURIComponent(target)}` : ""}`)}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/makers/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: target, reason }) });
      const data = await response.json() as { removed?: boolean; error?: string };
      if (!response.ok || !data.removed) { setError(data.error || "Could not remove the pin."); return; }
      setDone(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="claim-done">
        <Check size={28} />
        <h1>Done. The pin is gone.</h1>
        <p>@{target} no longer appears anywhere on MakersMap, and won&apos;t be re-listed by future imports.</p>
        <Link className="join-ghost" href="/">Back to the atlas</Link>
      </div>
    );
  }

  return (
    <form className="claim" onSubmit={submit}>
      <div className="claim-intro">
        <span className="section-kicker">Remove a listed pin</span>
        <h1>Take me off the map</h1>
        <p>Sign in with X on the account the pin was listed from, and it&apos;s gone immediately, for good. That sign-in is only used to confirm it&apos;s you; nothing is posted or stored beyond your user id.</p>
      </div>
      {!configured ? (
        <p className="claim-note">Sign in with X isn&apos;t set up on this server yet. Reply to the account that pinned you on X and we&apos;ll remove it by hand.</p>
      ) : session ? (
        <>
          <p className="claim-note">Signed in as <strong>@{session.username}</strong>{target && target !== session.username.toLowerCase() ? <> · removing <strong>@{target}</strong></> : null}.</p>
          <label className="admin-label">Anything we should know? <span>optional</span><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          {error && <p className="ask-error">{error}</p>}
          <div className="claim-actions">
            <button type="submit" className="remove-pin-button" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}Remove my pin</button>
            <form method="post" action="/api/auth/x/logout"><button type="submit" className="join-ghost">Not you? Sign out</button></form>
          </div>
        </>
      ) : (
        <div className="claim-actions">
          <a className="join-next" href={signInHref}><SocialIcon kind="X" size={15} />Sign in with X to remove{target ? ` @${target}` : ""}</a>
        </div>
      )}
    </form>
  );
}
