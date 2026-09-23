"use client";

import { useRef, useState } from "react";
import { parseString, useStoredState } from "../use-stored";
import { Check, Copy, ExternalLink, LoaderCircle, Play, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImportResult, ImportState } from "@/lib/x-pipeline";
import type { OutreachItem } from "@/lib/outreach";
type OutreachSettingsView = { auto: boolean; dailyCap: number; maxAgeDays: number };
type OperatorView = { connected: boolean; username?: string; canWrite: boolean };

type Status = { state: ImportState; defaultQuery: string; patterns?: string[]; current?: string; provider?: "twitterapi" | "x" | "none"; llm?: { source: string; model: string } | null; configured: Record<"mongo" | "x" | "claude" | "oauth" | "session", boolean> };
type ReviewItem = { id: number; handle?: string; name: string; city: string; country: string; flag: string; role: string; lookingFor: string[]; postText: string; postUrl: string; location: string; bio: string; confidence?: number };

const SECRET_KEY = "mm-admin-secret";

export function AdminClient() {
  const [secret, setSecret] = useStoredState<string>(SECRET_KEY, parseString, { store: "session", serialize: (v) => v });
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [queue, setQueue] = useState<OutreachItem[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<"queued" | "sent" | "all">("queued");
  const [copied, setCopied] = useState<string | null>(null);

  const headers = () => ({ "Content-Type": "application/json", "x-admin-secret": secret });

  const load = async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/import", { headers: headers() });
      const data = await response.json() as Status & { error?: string };
      if (!response.ok) { setError(data.error || "Could not load."); setStatus(null); return; }
      setStatus(data);
      setQuery((q) => q || data.state.query);
      const q = await fetch("/api/admin/outreach", { headers: headers() });
      const qd = await q.json() as { items?: OutreachItem[]; settings?: OutreachSettingsView; operator?: OperatorView; sentToday?: number };
      setQueue(qd.items || []);
      if (qd.settings) setOutreach(qd.settings);
      if (qd.operator) setOperator(qd.operator);
      setSentToday(qd.sentToday || 0);
      const r = await fetch("/api/admin/review", { headers: headers() });
      const rd = await r.json() as { items?: ReviewItem[] };
      setReview(rd.items || []);
    } catch {
      setError("Could not reach the server.");
    }
  };

  const [outreach, setOutreach] = useState<OutreachSettingsView>({ auto: false, dailyCap: 30, maxAgeDays: 21 });
  const [operator, setOperator] = useState<OperatorView>({ connected: false, canWrite: false });
  const [sentToday, setSentToday] = useState(0);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [busyHandle, setBusyHandle] = useState<string | null>(null);

  const saveOutreach = async (patch: Partial<OutreachSettingsView>) => {
    const response = await fetch("/api/admin/outreach", { method: "POST", headers: headers(), body: JSON.stringify({ settings: patch }) });
    const data = await response.json() as { settings?: OutreachSettingsView };
    if (data.settings) setOutreach(data.settings);
  };
  const connectOperator = async () => {
    const response = await fetch("/api/admin/x-connect", { method: "POST", headers: headers(), body: "{}" });
    const data = await response.json() as { url?: string; error?: string };
    if (data.url) window.location.assign(data.url); else say(`Error: ${data.error}`);
  };
  const disconnectOperator = async () => {
    await fetch("/api/admin/x-connect", { method: "POST", headers: headers(), body: JSON.stringify({ disconnect: true }) });
    setOperator({ connected: false, canWrite: false });
  };
  const previewFor = async (handle: string) => {
    const response = await fetch("/api/admin/outreach", { method: "POST", headers: headers(), body: JSON.stringify({ preview: handle }) });
    const data = await response.json() as { text?: string };
    if (data.text) setPreview((p) => ({ ...p, [handle]: data.text! }));
  };
  const replyNow = async (handle: string) => {
    setBusyHandle(handle);
    try {
      const response = await fetch("/api/admin/outreach", { method: "POST", headers: headers(), body: JSON.stringify({ send: handle }) });
      const data = await response.json() as { ok?: boolean; text?: string; error?: string };
      if (data.ok) { setQueue((items) => items.map((i) => i.handle === handle ? { ...i, status: "sent", sentAt: new Date().toISOString(), reply: data.text || i.reply } : i)); setSentToday((n) => n + 1); say(`Replied to @${handle}.`); }
      else say(`Could not reply to @${handle}: ${data.error}`);
    } finally { setBusyHandle(null); }
  };
  const runOutreachNow = async () => {
    const response = await fetch("/api/admin/outreach", { method: "POST", headers: headers(), body: JSON.stringify({ runNow: 10 }) });
    const data = await response.json() as { sent?: number; failed?: number; skipped?: number; notes?: string[] };
    say(`Outreach run: replied ${data.sent ?? 0}, skipped ${data.skipped ?? 0}, failed ${data.failed ?? 0}${data.notes?.length ? ` · ${data.notes.join(" · ")}` : ""}`);
    await load();
  };

  const say = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString("en-US")}  ${line}`, ...l].slice(0, 60));

  const runPage = async (options: { restart?: boolean } = {}): Promise<ImportResult | null> => {
    const response = await fetch("/api/admin/import", { method: "POST", headers: headers(), body: JSON.stringify({ query: query.trim() || undefined, ...options }) });
    const data = await response.json() as ImportResult & { error?: string };
    if (!response.ok) { say(`Error: ${data.error}`); return null; }
    const skipped = Object.entries(data.skipped).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
    say(`${data.pattern ? `[${data.pattern}${data.extractor ? `, ${data.extractor}` : ""}] ` : ""}Fetched ${data.fetched}, listed ${data.listed}, updated ${data.updated}${skipped ? `, skipped: ${skipped}` : ""}${data.error ? `. ${data.error}` : ""}`);
    for (const s of data.samples) say(`  + @${s.handle} · ${s.city} · ${s.role} · ${(s.confidence * 100).toFixed(0)}%`);
    return data;
  };

  const runOnce = async (restart = false) => { setRunning(true); await runPage({ restart }); await load(); setRunning(false); };

  const stopRef = useRef(false);
  const runAll = async () => {
    setRunning(true); stopRef.current = false;
    let pages = 0;
    while (pages < 200) {
      const result = await runPage();
      pages += 1;
      if (!result || result.done || result.error) break;
      if (stopRef.current) { say("Stopped."); break; }
      await new Promise((r) => setTimeout(r, 400));
    }
    await load();
    setRunning(false);
  };

  const runSample = async () => {
    setRunning(true);
    const response = await fetch("/api/admin/import", { method: "POST", headers: headers(), body: JSON.stringify({ sample: true }) });
    const data = await response.json() as ImportResult & { error?: string };
    if (!response.ok) say(`Error: ${data.error}`);
    else {
      say(`Sample run: fetched ${data.fetched}, listed ${data.listed}, updated ${data.updated}, skipped ${Object.values(data.skipped).reduce((a, b) => a + b, 0)}.`);
      for (const s of data.samples) say(`  + @${s.handle} · ${s.city} · ${s.role} · ${(s.confidence * 100).toFixed(0)}%`);
    }
    await load();
    setRunning(false);
  };

  const clearSamples = async () => {
    setRunning(true);
    const response = await fetch("/api/admin/import", { method: "POST", headers: headers(), body: JSON.stringify({ removeSamples: true }) });
    const data = await response.json() as { removed?: number; error?: string };
    say(data.error ? `Error: ${data.error}` : `Removed ${data.removed} sample pins.`);
    await load();
    setRunning(false);
  };

  const recheck = async () => {
    setRunning(true);
    const response = await fetch("/api/admin/recheck", { method: "POST", headers: headers() });
    const data = await response.json() as { checked?: number; hidden?: number; error?: string };
    say(data.error ? `Recheck error: ${data.error}` : `Rechecked ${data.checked} posts, hid ${data.hidden} whose post is gone.`);
    await load();
    setRunning(false);
  };

  const decide = async (id: number, decision: "approved" | "rejected") => {
    await fetch("/api/admin/review", { method: "POST", headers: headers(), body: JSON.stringify({ id, decision }) });
    setReview((items) => items.filter((i) => i.id !== id));
    say(`${decision === "approved" ? "Approved" : "Rejected"} pin #${id}.`);
  };

  const mark = async (handle: string, status: "sent" | "skipped" | "queued") => {
    await fetch("/api/admin/outreach", { method: "POST", headers: headers(), body: JSON.stringify({ handle, status }) });
    setQueue((items) => items.map((i) => i.handle === handle ? { ...i, status, sentAt: new Date().toISOString() } : i));
  };

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); } catch {}
  };

  const shown = queue.filter((i) => filter === "all" ? true : filter === "sent" ? i.status === "sent" : i.status === "queued");

  if (!status) {
    return (
      <div className="admin-login">
        <ShieldCheck size={28} />
        <h1>Admin console</h1>
        <p>Enter the admin secret from <code>.env</code> to run imports and work the outreach queue.</p>
        <form onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" aria-label="Admin secret" />
          <button type="submit" className="join-next">Open</button>
        </form>
        {error && <p className="ask-error">{error}</p>}
      </div>
    );
  }

  const c = status.configured;
  const sent = queue.filter((i) => i.status === "sent").length;
  const claimed = queue.filter((i) => i.status === "claimed").length;

  return (
    <div className="admin">
      <section className="admin-section">
        <div className="admin-head">
          <h1>Import from X</h1>
          <div className="admin-config">
            {(["mongo", "x", "claude", "oauth", "session"] as const).map((k) => <span key={k} className={c[k] ? "on" : "off"}>{c[k] ? "●" : "○"} {k === "x" ? (status.provider === "twitterapi" ? "twitterapi.io" : status.provider === "x" ? "X API" : "X data") : k === "oauth" ? "Sign in with X" : k === "claude" ? (status.llm ? `AI reader (${status.llm.model.replace(/^anthropic\//, "")})` : "AI reader") : k === "mongo" ? "MongoDB" : "Sessions"}</span>)}
          </div>
        </div>
        <p className="admin-hint">{"One run fetches up to 100 recent intro posts, asks Claude to read each one, geocodes the city, and lists the pin. “Run until done” keeps going page by page. Only posts newer than the last sweep are fetched, so it’s safe to run on a schedule."}</p>
        <label className="admin-label">Search query<Textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="admin-actions">
          <button type="button" className="join-next" disabled={running || !c.x} onClick={() => void runOnce()}>{running ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}Run one page</button>
          <button type="button" className="join-next" disabled={running || !c.x} onClick={() => void runAll()}><Play size={15} />Run until done</button>
          {running && <button type="button" className="join-ghost" onClick={() => { stopRef.current = true; }}>Stop after this page</button>}
          <button type="button" className="join-ghost" disabled={running || !c.x} onClick={() => void runOnce(true)}><RotateCcw size={15} />Restart sweep</button>
          <button type="button" className="join-ghost" disabled={running || !c.x} onClick={() => void recheck()}><RefreshCw size={15} />Hide deleted posts</button>
          <button type="button" className="join-ghost" disabled={running} onClick={() => void runSample()}>Try with sample posts</button>
          <button type="button" className="join-ghost" disabled={running} onClick={() => void clearSamples()}>Remove sample pins</button>
        </div>
        {!c.x && <p className="ask-error">{"No X data provider is set. Add TWITTERAPI_IO_KEY (preferred) or X_BEARER_TOKEN to .env."}</p>}
        {!c.claude && <p className="admin-warn">No ANTHROPIC_API_KEY: posts are parsed with keyword rules, which finds fewer cities and roles. Add the key for better pins.</p>}
        <div className="admin-stats">
          <div><span>Fetched (all time)</span><strong>{status.state.totals.fetched}</strong></div>
          <div><span>Listed</span><strong>{status.state.totals.listed}</strong></div>
          <div><span>Skipped</span><strong>{status.state.totals.skipped}</strong></div>
          <div><span>Last run</span><strong>{status.state.lastRunAt ? new Date(status.state.lastRunAt).toLocaleString("en-US") : "never"}</strong></div>
          <div><span>Sweep position</span><strong>{status.state.nextToken ? "mid-sweep" : "caught up"}</strong></div>
        </div>
        {log.length > 0 && <pre className="admin-log">{log.join("\n")}</pre>}
      </section>

      <section className="admin-section">
        <div className="admin-head">
          <h2>Needs a human look</h2>
          <div className="admin-config"><span>{review.length} pending</span></div>
        </div>
        <p className="admin-hint">{"Posts the reader wasn’t sure about. Approve puts the pin on the map; reject hides it for good."}</p>
        {review.length === 0 && <p className="city-empty">Nothing waiting.</p>}
        <ul className="outreach-list">
          {review.map((item) => (
            <li key={item.id} className="outreach">
              <div className="outreach-top">
                <strong>{item.name}</strong><span>@{item.handle} · {item.flag} {item.city}{item.country ? `, ${item.country}` : ""} · {item.role}{item.location ? ` · location field: "${item.location}"` : ""}{typeof item.confidence === "number" ? ` · ${Math.round(item.confidence * 100)}% sure` : ""}</span>
              </div>
              <blockquote>{item.postText}</blockquote>
              {item.bio && <p className="admin-hint">Bio: {item.bio}</p>}
              <div className="outreach-reply"><div>
                <button type="button" className="join-next" onClick={() => void decide(item.id, "approved")}>Approve</button>
                <button type="button" className="join-ghost" onClick={() => void decide(item.id, "rejected")}>Reject</button>
                {item.postUrl && <a className="join-ghost" href={item.postUrl} target="_blank" rel="noopener">Open the post <ExternalLink size={12} /></a>}
              </div></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section">
        <div className="admin-head">
          <h2>Outreach queue</h2>
          <div className="admin-config">
            <span>{queue.filter((i) => i.status === "queued").length} queued</span><span>{sent} sent</span><span className="on">{claimed} claimed</span>
          </div>
        </div>
        <p className="admin-hint">{"Replies go out under each person's intro post from the connected X account, personalised by the model, best profiles first, within a daily cap. Turn it on once the X app has write access. Until then every reply is prepared here to copy or post one at a time."}</p>
        <div className="admin-controls outreach-controls">
          {operator.connected ? (
            <span className={operator.canWrite ? "on" : "off"}>{operator.canWrite ? "●" : "○"} Replying as @{operator.username} <button type="button" className="join-ghost" onClick={() => void disconnectOperator()}>Disconnect</button></span>
          ) : (
            <button type="button" className="join-next" onClick={() => void connectOperator()}>Connect the X account that replies</button>
          )}
          <label className="admin-toggle"><input type="checkbox" checked={outreach.auto} onChange={(e) => void saveOutreach({ auto: e.target.checked })} /> Reply automatically each day</label>
          <label>Daily cap <input type="number" min={0} max={200} value={outreach.dailyCap} onChange={(e) => void saveOutreach({ dailyCap: Number(e.target.value) })} /></label>
          <label>Only posts newer than <input type="number" min={1} max={90} value={outreach.maxAgeDays} onChange={(e) => void saveOutreach({ maxAgeDays: Number(e.target.value) })} /> days</label>
          <span>{sentToday} replied today</span>
          <button type="button" className="join-ghost" onClick={() => void runOutreachNow()} disabled={!operator.canWrite}>Reply to the next 10 now</button>
        </div>
        <div className="admin-filter">
          {(["queued", "sent", "all"] as const).map((f) => <button key={f} type="button" className={"filter-chip" + (filter === f ? " active" : "")} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        {shown.length === 0 && <p className="city-empty">Nothing here yet. Run an import first.</p>}
        <ul className="outreach-list">
          {shown.map((item) => (
            <li key={item.id} className={"outreach " + item.status}>
              <div className="outreach-top">
                <a href={item.profileUrl} target="_blank" rel="noopener"><strong>{item.name}</strong> @{item.handle}</a>
                <span>{item.role} · {item.city}{item.country ? `, ${item.country}` : ""} · {item.sameCity} nearby · {typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}% sure` : ""}</span>
                <em className={"outreach-status " + item.status}>{item.status}</em>
              </div>
              <blockquote>{item.postText}</blockquote>
              <div className="outreach-links">
                {item.postUrl && <a href={item.postUrl} target="_blank" rel="noopener">Open the post <ExternalLink size={12} /></a>}
                <a href={item.claimUrl} target="_blank" rel="noopener">Claim link <ExternalLink size={12} /></a>
                {item.topMatches.length > 0 && <span>Matches: {item.topMatches.join(", ")}</span>}
              </div>
              <div className="outreach-reply">
                <p>{preview[item.handle] || item.reply}</p>
                <div>
                  <button type="button" className="join-ghost" onClick={() => void copy(preview[item.handle] || item.reply, item.handle)}>{copied === item.handle ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy reply</>}</button>
                  {item.status === "queued" && !preview[item.handle] && <button type="button" className="join-ghost" onClick={() => void previewFor(item.handle)}>Personalise</button>}
                  {item.status === "queued" && operator.canWrite && <button type="button" className="join-next" onClick={() => void replyNow(item.handle)} disabled={busyHandle === item.handle}>{busyHandle === item.handle ? "Posting…" : "Post reply now"}</button>}
                  {item.status === "queued" && <button type="button" className="join-next" onClick={() => void mark(item.handle, "sent")}>Mark sent</button>}
                  {item.status === "queued" && <button type="button" className="join-ghost" onClick={() => void mark(item.handle, "skipped")}>Skip</button>}
                  {item.status === "sent" && <button type="button" className="join-ghost" onClick={() => void mark(item.handle, "queued")}>Back to queue</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
