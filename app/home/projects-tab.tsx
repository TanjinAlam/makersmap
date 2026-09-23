"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, Search, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, ProductIcon } from "../maker-ui";
import { Sparkline } from "../sparkline";
import { money } from "../data";
import { profilePath, projectPath } from "../handle";
import type { Maker } from "../profile";
import type { CatalogueRow } from "./use-makers-data";

const SORTS = ["Shuffle", "A to Z", "Highest revenue", "Newest"] as const;

// A stable daily shuffle: the order changes each day but stays put while you browse.
function dailyOrder(key: string): number {
  const seed = new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (const ch of `${seed}:${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The project catalogue: one row per project, searchable and sortable.
export function ProjectsTab({ catalogue, saved, onToggleSave }: { catalogue: CatalogueRow[] | null; saved: number[]; onToggleSave: (m: Maker) => void }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Shuffle");
  const [revenueOnly, setRevenueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const projects = (catalogue || [])
    .filter(({ maker, project }) => !q || [project.name, project.description, maker.name, ...maker.tags].join(" ").toLowerCase().includes(q))
    .filter(({ project }) => !revenueOnly || project.revenue?.mrr != null)
    .sort((a, b) => sort === "Highest revenue"
      ? (b.project.revenue?.mrr || 0) - (a.project.revenue?.mrr || 0) || a.project.name.localeCompare(b.project.name)
      : sort === "Newest"
        ? b.maker.id - a.maker.id
        : sort === "Shuffle"
          ? dailyOrder(`${a.maker.id}:${a.project.id}`) - dailyOrder(`${b.maker.id}:${b.project.id}`)
          : a.project.name.localeCompare(b.project.name, undefined, { sensitivity: "base" }));
  const withRevenue = (catalogue || []).filter(({ project }) => project.revenue?.mrr != null).length;

  return (
    <main className="content-page projects-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">THE THINGS WE MAKE</span>
          <h1>Built with a little obsession</h1>
          <p>Explore the projects. Meet the people behind them.</p>
        </div>
      </div>
      <div className="project-toolbar">
        <div className="atlas-search">
          <Search size={18} />
          <Input aria-label="Search projects" placeholder="Find a project or an interest…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className={"filter-chip" + (revenueOnly ? " active" : "")} aria-pressed={revenueOnly} onClick={() => setRevenueOnly(!revenueOnly)}><TrendingUp size={15} />With revenue{withRevenue > 0 && <span>{withRevenue}</span>}</button>
        <Select value={sort} onValueChange={(v) => setSort(v as (typeof SORTS)[number])}>
          <SelectTrigger aria-label="Sort projects"><SelectValue /></SelectTrigger>
          <SelectContent>{SORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="catalogue-labels"><span>THE PROJECT</span><span>THE MAKER</span><span>REVENUE</span></div>
      <div className="project-catalogue">
        {projects.map(({ maker: m, project: p }, i) => (
          <article className="catalogue-row" key={m.id + ":" + p.id}>
            <span className="catalogue-number">{String(i + 1).padStart(2, "0")}</span>
            <ProductIcon maker={m} size={52} name={p.name} color={p.color} logo={p.logo} />
            <Link className="catalogue-project" href={m.handle ? projectPath(m.handle, p.id) : "/"}>
              <h2>{p.name}<ArrowUpRight size={20} /></h2>
              {p.tagline && <p className="catalogue-pitch">{p.tagline}</p>}
              <p>{p.description}</p>
              <div className="tag-row">{p.stage && <span className="stage-tag">{p.stage}</span>}{m.tags.map((t) => <span key={t}>{t}</span>)}</div>
            </Link>
            <Link className="catalogue-maker" href={m.handle ? profilePath(m.handle) : "/"}>
              <Avatar maker={m} size={36} />
              <span><strong>{m.name}</strong><small>{m.flag} {m.city}{(m.projectCount || 1) > 1 ? ` · ${m.projectCount} projects` : m.handle ? ` · @${m.handle}` : ""}</small></span>
            </Link>
            <div className="catalogue-revenue">
              {p.revenue?.mrr != null ? <><span><strong>{money(p.revenue.mrr)}</strong><small>{p.revenue.kind === "verified" ? "Verified" : "Self-reported"} MRR / USD</small></span><Sparkline color={p.color || "#6a8450"} /></> : <span className="pre-revenue"><Sparkles size={17} />No revenue shared</span>}
            </div>
            <button className={"icon-button save-button" + (saved.includes(m.id) ? " is-saved" : "")} onClick={() => onToggleSave(m)} aria-label={(saved.includes(m.id) ? "Unsave " : "Save ") + m.name}><Bookmark size={18} /></button>
          </article>
        ))}
      </div>
      {catalogue === null && <p className="page-footnote">Loading projects…</p>}
      {catalogue !== null && !projects.length && <div className="empty-state"><h3>No projects match your search.</h3><Button variant="outline" onClick={() => { setQuery(""); setRevenueOnly(false); }}>Show all projects</Button></div>}
      <p className="page-footnote">Revenue is self-reported by each maker unless marked verified.</p>
    </main>
  );
}
