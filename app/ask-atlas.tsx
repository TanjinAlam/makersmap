"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AskFilters } from "@/lib/ask";

export type AskHit = {
  handle: string; reason: string; name?: string; role?: string; city?: string; flag?: string;
  avatar?: string; initials?: string; color?: string; project?: string;
};
export type AskOutcome = { query: string; summary: string; filters: AskFilters; results: AskHit[]; source: "claude" | "rules" };

const examples = [
  "a designer in Berlin who's into open source and wants feedback",
  "founders in Lisbon up for coffee this week",
  "someone who can help with marketing for a SaaS",
  "find me a cofounder: a developer who's into AI and wants to build a product",
  "designers in Warsaw open to meet this week",
];

export function AskAtlas({ onResult, onClear, active }: { onResult: (outcome: AskOutcome) => void; onClear: () => void; active: AskOutcome | null }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const data = await response.json() as Partial<AskOutcome> & { error?: string };
      if (!response.ok || !data.filters) { setError(data.error || "Could not search right now."); return; }
      onResult({ query: q, summary: data.summary || "", filters: data.filters, results: data.results || [], source: data.source || "rules" });
    } catch {
      setError("Could not reach the atlas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask-atlas">
      <form className="ask-form" onSubmit={(event) => { event.preventDefault(); void ask(query); }}>
        <Sparkles size={17} />
        <Input aria-label="Ask the atlas" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask the atlas: a designer in Berlin who's into open source and wants feedback…" maxLength={300} />
        <button type="submit" className="ask-submit" disabled={busy || !query.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : "Ask"}</button>
      </form>
      {!active && !busy && (
        <div className="ask-examples">
          {examples.map((example) => <button key={example} type="button" onClick={() => { setQuery(example); void ask(example); }}>{example}</button>)}
        </div>
      )}
      {error && <p className="ask-error">{error}</p>}
      {active && (
        <div className="ask-results" role="region" aria-label="Ask results">
          <div className="ask-results-head">
            <p><strong>{active.summary}</strong> <span>{active.source === "claude" ? "Ranked by Claude" : "Matched on profiles"} · {active.results.length} {active.results.length === 1 ? "person" : "people"}</span></p>
            <button type="button" onClick={() => { onClear(); setQuery(""); }}><X size={14} />Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
