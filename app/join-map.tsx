"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Orbit, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { handleError, normalizeHandle, suggestHandle } from "./handle";
import {
  cities,
  connectKinds,
  MAX_LINKS,
  MAX_SAMPLES,
  MAX_SKILLS,
  normalizeSkills,
  helpWithOptions,
  interestOptions,
  lookingForOptions,
  meetingOptions,
  roleGroupOptions,
  roleGroups,
  normalizeMaker,
  normalizeProject,
  stageOptions,
  type City,
  type ConnectKind,
  type HelpWith,
  type LookingFor,
  type Maker,
  type MeetingPref,
  type ProjectStage,
  type Role,
} from "./profile";

type Step = "build" | "place" | "meet" | "more";
type ExtraProject = { name: string; description: string; website: string; mrr: string; stage?: ProjectStage };
const emptyProject: ExtraProject = { name: "", description: "", website: "", mrr: "" };
const MAX_PROJECTS = 6;
type HandleState = "idle" | "checking" | "ok" | "claimable" | "taken" | "invalid";

const emptyDraft = {
  name: "",
  email: "",
  project: "",
  description: "",
  city: "",
  lookingFor: [] as LookingFor[],
  role: "Founder" as Role,
  tags: [] as string[],
  website: "",
  connectKind: "Website" as ConnectKind,
  connectUrl: "",
  canHelpWith: [] as HelpWith[],
  stage: undefined as ProjectStage | undefined,
  openToMeeting: [] as MeetingPref[],
  handle: "",
  xHandle: "",
  primaryMrr: "",
  extraProjects: [] as ExtraProject[],
  bio: "",
  skills: "",
  links: [] as { kind: ConnectKind; url: string }[],
  workSamples: [] as { label: string; url: string }[],
};

function toggleItem<T>(list: T[], item: T, max = 99): T[] {
  if (list.includes(item)) return list.filter((value) => value !== item);
  if (list.length >= max) return list;
  return [...list, item];
}

function xHandleFromMaker(maker?: Maker | null): string {
  if (!maker?.connect?.url || maker.connect.kind !== "X") return "";
  return maker.connect.url.replace(/^https?:\/\/(www\.)?x\.com\//i, "").replace(/^@/, "");
}

export function JoinMap({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Maker | null;
  onSave: (maker: Maker) => Promise<void> | void;
}) {
  const [step, setStep] = useState<Step>("build");
  const [draft, setDraft] = useState(emptyDraft);
  const [placeQuery, setPlaceQuery] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [handleStatus, setHandleStatus] = useState<{ state: HandleState; message: string }>({
    state: "idle",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedCity = cities.find((city) => city.city === draft.city);
  const filteredCities = useMemo(() => {
    const query = placeQuery.trim().toLowerCase();
    if (!query) return cities;
    return cities.filter((city) => `${city.city} ${city.country}`.toLowerCase().includes(query));
  }, [placeQuery]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the form is reset from the pin being edited each time the dialog opens
      setDraft({
        name: initial.name,
        email: initial.email || "",
        project: initial.project,
        description: initial.description,
        city: initial.city,
        lookingFor: initial.lookingFor,
        role: initial.role,
        tags: initial.tags,
        website: initial.website || "",
        connectKind: initial.connect?.kind || "Website",
        connectUrl: initial.connect?.url || "",
        canHelpWith: initial.canHelpWith,
        stage: initial.stage,
        openToMeeting: initial.openToMeeting,
        handle: initial.handle || suggestHandle(initial.name),
        xHandle: xHandleFromMaker(initial),
        primaryMrr: initial.projects[0]?.revenue?.mrr != null ? String(initial.projects[0].revenue.mrr) : "",
        bio: initial.bio || "",
        skills: initial.skills.join(", "),
        links: initial.links.filter((link) => !(link.kind === "X" && xHandleFromMaker(initial))).map((link) => ({ kind: link.kind, url: link.url })),
        workSamples: initial.workSamples.map((sample) => ({ label: sample.label, url: sample.url })),
        extraProjects: initial.projects.slice(1).map((project) => ({
          name: project.name,
          description: project.description,
          website: project.website || "",
          mrr: project.revenue?.mrr != null ? String(project.revenue.mrr) : "",
          stage: project.stage,
        })),
      });
      setHandleTouched(Boolean(initial.handle));
    } else {
      setDraft(emptyDraft);
      setHandleTouched(false);
    }
    setPlaceQuery("");
    setStep("build");
    setError("");
    setBusy(false);
    setHandleStatus({ state: "idle", message: "" });
  }, [open, initial]);

  useEffect(() => {
    if (!open || handleTouched || !draft.name.trim()) return;
    const next = suggestHandle(draft.name);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the handle suggestion follows the name until the person edits the handle
    if (next && next !== draft.handle) setDraft((current) => ({ ...current, handle: next }));
  }, [draft.name, draft.handle, handleTouched, open]);

  useEffect(() => {
    if (!open) return;
    const slug = normalizeHandle(draft.handle);
    const format = handleError(draft.handle);
    if (format) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- handle availability is checked whenever it changes
      setHandleStatus({ state: slug ? "invalid" : "idle", message: format });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHandleStatus({ state: "checking", message: "Checking that handle…" });
      try {
        const except =
          initial?.handle && normalizeHandle(initial.handle) === slug
            ? `?except=${encodeURIComponent(slug)}`
            : "";
        const response = await fetch(`/api/makers/handle/${encodeURIComponent(slug)}${except}`, {
          signal: controller.signal,
        });
        const data = await response.json() as { available?: boolean; claimable?: boolean; reason?: string };
        if (data.available && data.claimable) {
          setHandleStatus({ state: "claimable", message: data.reason || `@${slug} is listed. Saving will claim this pin.` });
        } else if (data.available) {
          setHandleStatus({ state: "ok", message: `@${slug} is free.` });
        } else {
          setHandleStatus({ state: "taken", message: data.reason || `@${slug} is already taken.` });
        }
      } catch {
        if (controller.signal.aborted) return;
        setHandleStatus({ state: "ok", message: `@${slug} will be your public page.` });
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft.handle, initial?.handle, open]);

  const save = async (includeExtras: boolean) => {
    const format = handleError(draft.handle);
    if (format) {
      setError(format);
      setStep("meet");
      return;
    }
    if (handleStatus.state === "taken" || handleStatus.state === "invalid") {
      setError(handleStatus.message);
      setStep("meet");
      return;
    }

    const place: City = selectedCity || cities[0];
    const lookingFor = draft.lookingFor.slice(0, 3);
    const parseMrr = (value: string) => {
      const n = Number(value.replace(/[^0-9.]/g, ""));
      return value.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const revenueFor = (value: string, previous?: Maker["projects"][number]) => {
      const mrr = includeExtras ? parseMrr(value) : previous?.revenue?.mrr ?? null;
      return mrr !== null ? { mrr, kind: "self-reported" as const, updatedAt: stamp } : undefined;
    };
    const projects = [
      normalizeProject({
        name: draft.project.trim(),
        description: draft.description.trim(),
        website: includeExtras ? draft.website.trim() : initial?.projects[0]?.website || "",
        stage: includeExtras ? draft.stage : initial?.projects[0]?.stage,
        color: initial?.projects[0]?.color,
        revenue: revenueFor(draft.primaryMrr, initial?.projects[0]),
      }),
      ...(includeExtras ? draft.extraProjects : initial?.projects.slice(1).map((p) => ({ name: p.name, description: p.description, website: p.website || "", mrr: p.revenue?.mrr != null ? String(p.revenue.mrr) : "", stage: p.stage })) || [])
        .filter((project) => project.name.trim())
        .map((project, index) => normalizeProject({
          name: project.name.trim(),
          description: project.description.trim(),
          website: project.website.trim(),
          stage: project.stage,
          color: initial?.projects[index + 1]?.color,
          revenue: revenueFor(project.mrr, initial?.projects[index + 1]),
        })),
    ];
    const xHandle = draft.xHandle.replace(/^@/, "").trim();
    setBusy(true);
    setError("");
    try {
      await onSave(
        normalizeMaker({
          id: initial?.id && initial.id !== 100 ? initial.id : 100,
          name: draft.name.trim(),
          email: draft.email.trim() || undefined,
          projects,
          project: draft.project.trim(),
          description: draft.description.trim(),
          city: place.city,
          country: place.country,
          flag: place.flag,
          lat: place.lat,
          lon: place.lon,
          lookingFor,
          role: includeExtras ? draft.role : initial?.role || "Founder",
          tags: includeExtras ? draft.tags : initial?.tags || [],
          website: includeExtras ? draft.website.trim() : initial?.website || "",
          handle: normalizeHandle(draft.handle),
          claimed: true,
          source: "self",
          links: [
            ...(xHandle ? [{ kind: "X" as ConnectKind, url: "https://x.com/" + xHandle }] : []),
            ...(includeExtras ? draft.links : initial?.links.filter((link) => !(link.kind === "X" && xHandle)) || []).filter((link) => link.url.trim()),
            ...(includeExtras && draft.connectUrl.trim() ? [{ kind: draft.connectKind, url: draft.connectUrl.trim() }] : []),
          ],
          skills: includeExtras ? normalizeSkills(draft.skills.split(/[,\n]/)) : initial?.skills || [],
          workSamples: includeExtras ? draft.workSamples.filter((sample) => sample.url.trim()) : initial?.workSamples || [],
          bio: includeExtras ? draft.bio.trim() : initial?.bio || "",
          joinedAt: initial?.joinedAt,
          canHelpWith: includeExtras ? draft.canHelpWith : initial?.canHelpWith || [],
          stage: includeExtras ? draft.stage : initial?.stage,
          openToMeeting: includeExtras ? draft.openToMeeting : lookingFor.includes("Coffee") ? ["Coffee"] : [],
          coffee: lookingFor.includes("Coffee") || draft.openToMeeting.includes("Coffee"),
          avatar: initial?.avatar || "",
          color: initial?.color || "#24352c",
          latestUpdate: initial?.latestUpdate,
          mrr: initial?.mrr ?? null,
          growth: initial?.growth ?? 0,
        })
      );
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your pin.");
      setStep("meet");
    } finally {
      setBusy(false);
    }
  };

  const handleReady = handleStatus.state === "ok" || handleStatus.state === "claimable";
  // X is optional. Without it, people need one other way to reach you: a link or an email.
  const xHandleTyped = draft.xHandle.replace(/^@/, "").trim();
  const xHandleOk = !xHandleTyped || /^[A-Za-z0-9_]{1,15}$/.test(xHandleTyped);
  const reachable = Boolean(xHandleTyped || draft.email.trim() || draft.links.some((l) => l.url.trim()) || draft.website.trim() || draft.connectUrl.trim());
  const canContinue =
    step === "build"
      ? Boolean(draft.name.trim() && draft.project.trim() && draft.description.trim())
      : step === "place"
        ? Boolean(selectedCity)
        : draft.lookingFor.length > 0 && handleReady && xHandleOk && reachable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="join-shell top-0 left-0 h-svh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 gap-0 shadow-none" aria-describedby="join-copy">
        <aside className="join-rail">
          <p className="join-mark"><Orbit size={18} strokeWidth={1.8} />makersmap.</p>
          <DialogTitle className="join-rail-title">Three answers. Then you’re on the map.</DialogTitle>
          <DialogDescription id="join-copy" className="join-rail-copy">
            We only keep what you type. City-level location. Your handle becomes a public page on MakersMap.
          </DialogDescription>
          <ol className="join-steps">
            {([
              ["build", "What are you building?"],
              ["place", "Where are you based?"],
              ["meet", "Who would you love to meet?"],
            ] as const).map(([key, label], index) => (
              <li key={key} className={step === key || (step === "more" && key === "meet") ? "current" : ""}>
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </aside>

        <div className="join-main">
          <button className="join-close" type="button" onClick={() => onOpenChange(false)} aria-label="Close">
            <X size={18} />
          </button>

          {step === "build" && (
            <section className="join-question">
              <p className="join-kicker">Question 1 of 3</p>
              <h2>What are you building?</h2>
              <label>
                Your name
                <Input value={draft.name} maxLength={45} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Sofia" />
              </label>
              <label>
                Your email
                <Input type="email" value={draft.email} maxLength={120} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
                <small className="join-hint">Private. Never shown on the site.</small>
              </label>
              <label>
                Project name
                <Input value={draft.project} maxLength={40} onChange={(e) => setDraft({ ...draft, project: e.target.value })} placeholder="Looply" />
              </label>
              <label>
                One sentence
                <Input value={draft.description} maxLength={120} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="The thing it does, in plain language." />
              </label>
            </section>
          )}

          {step === "place" && (
            <section className="join-question">
              <p className="join-kicker">Question 2 of 3</p>
              <h2>Where are you based?</h2>
              <p className="join-hint">City only. We never store a street or a pin on your house.</p>
              <Input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Search a city" aria-label="Search a city" />
              <ul className="join-cities">
                {filteredCities.map((city) => (
                  <li key={city.city + city.country}>
                    <button
                      type="button"
                      className={draft.city === city.city ? "selected" : ""}
                      onClick={() => setDraft({ ...draft, city: city.city })}
                    >
                      <span>{city.flag}</span>
                      <strong>{city.city}</strong>
                      <em>{city.country}</em>
                      {draft.city === city.city && <Check size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step === "meet" && (
            <section className="join-question">
              <p className="join-kicker">Question 3 of 3</p>
              <h2>Who would you love to meet?</h2>
              <p className="join-hint">Pick up to three. This is the reason someone reaches out.</p>
              <div className="join-picks" role="group" aria-label="Looking for">
                {lookingForOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={draft.lookingFor.includes(option) ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, lookingFor: toggleItem(draft.lookingFor, option, 3) })}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="join-count">{draft.lookingFor.length} of 3</p>
              <label>
                Your MakersMap handle
                <Input
                  value={draft.handle}
                  maxLength={24}
                  onChange={(e) => {
                    setHandleTouched(true);
                    setDraft({ ...draft, handle: e.target.value.replace(/\s/g, "") });
                  }}
                  placeholder="sofia"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <p className="join-handle-preview">
                Public page: <strong>/m/{normalizeHandle(draft.handle) || "yourhandle"}</strong>
              </p>
              {handleStatus.message && (
                <p className={"join-handle-status is-" + handleStatus.state}>{handleStatus.message}</p>
              )}
              <label>
                Your X handle <span>optional · the easiest way for people to message you</span>
                <Input
                  value={draft.xHandle}
                  maxLength={32}
                  onChange={(e) => setDraft({ ...draft, xHandle: e.target.value.replace(/\s/g, "") })}
                  placeholder="@yourhandle"
                />
              </label>
              {!xHandleTyped && !reachable && (
                <p className="join-handle-status is-hint">No X? Go back and add your email in the first step, or a website, so people have a way to reach you. It stays private.</p>
              )}
              {!xHandleOk && <p className="join-handle-status is-taken">That doesn&apos;t look like an X handle: letters, numbers, underscores, up to 15.</p>}
              {error && <p className="join-handle-status is-taken">{error}</p>}
            </section>
          )}

          {step === "more" && (
            <section className="join-question join-more">
              <p className="join-kicker">Optional</p>
              <h2>Add only what you want public.</h2>
              <p className="join-hint">Your project website is a normal dofollow link from your claimed page.</p>
              <label>
                About you <span>a sentence or two, optional</span>
                <Textarea rows={3} maxLength={320} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} placeholder="What you're into, what you've built before, what you'd talk about over coffee." />
              </label>
              <p className="join-mini">What do you do? <span>pick the closest</span></p>
              <div className="join-role-groups">
                {roleGroupOptions.map((group) => (
                  <div key={group} className="join-role-group">
                    <span>{group}</span>
                    <div className="join-picks compact" role="group" aria-label={group}>
                      {roleGroups[group].map((role) => (
                        <button key={role} type="button" className={draft.role === role ? "selected" : ""} onClick={() => setDraft({ ...draft, role: role as Role })}>
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="join-mini">Interests <span>up to 4</span></p>
              <div className="join-picks" role="group" aria-label="Interests">
                {interestOptions.map((tag) => (
                  <button key={tag} type="button" className={draft.tags.includes(tag) ? "selected" : ""} onClick={() => setDraft({ ...draft, tags: toggleItem(draft.tags, tag, 4) })}>
                    {tag}
                  </button>
                ))}
              </div>
              <label>
                Skills and tools <span>comma separated, up to {MAX_SKILLS}</span>
                <Input value={draft.skills} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} placeholder="After Effects, Figma, Rust, pricing…" />
              </label>
              <label>
                Project website
                <Input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://yourproject.com" />
              </label>
              <label>
                Monthly recurring revenue <span>optional · self-reported, USD</span>
                <Input inputMode="numeric" value={draft.primaryMrr} onChange={(e) => setDraft({ ...draft, primaryMrr: e.target.value })} placeholder="e.g. 2400" />
              </label>
              <p className="join-mini">Other projects <span>{draft.extraProjects.length ? `${draft.extraProjects.length + 1} of ${MAX_PROJECTS}` : "building more than one thing?"}</span></p>
              <div className="join-projects">
                {draft.extraProjects.map((project, index) => (
                  <fieldset key={index} className="join-project">
                    <legend>Project {index + 2}</legend>
                    <button type="button" className="join-project-remove" aria-label={`Remove project ${index + 2}`} onClick={() => setDraft({ ...draft, extraProjects: draft.extraProjects.filter((_, i) => i !== index) })}><Trash2 size={15} /></button>
                    <div className="join-project-grid">
                      <Input value={project.name} maxLength={40} placeholder="Project name" aria-label="Project name" onChange={(e) => setDraft({ ...draft, extraProjects: draft.extraProjects.map((p, i) => i === index ? { ...p, name: e.target.value } : p) })} />
                      <Input value={project.mrr} inputMode="numeric" placeholder="MRR, optional" aria-label="Monthly recurring revenue" onChange={(e) => setDraft({ ...draft, extraProjects: draft.extraProjects.map((p, i) => i === index ? { ...p, mrr: e.target.value } : p) })} />
                    </div>
                    <Input value={project.description} maxLength={120} placeholder="One sentence about it" aria-label="Project description" onChange={(e) => setDraft({ ...draft, extraProjects: draft.extraProjects.map((p, i) => i === index ? { ...p, description: e.target.value } : p) })} />
                    <Input value={project.website} placeholder="https://project.com (optional)" aria-label="Project website" onChange={(e) => setDraft({ ...draft, extraProjects: draft.extraProjects.map((p, i) => i === index ? { ...p, website: e.target.value } : p) })} />
                    <div className="join-picks compact" role="group" aria-label="Project stage">
                      {stageOptions.map((option) => (
                        <button key={option} type="button" className={project.stage === option ? "selected" : ""} onClick={() => setDraft({ ...draft, extraProjects: draft.extraProjects.map((p, i) => i === index ? { ...p, stage: p.stage === option ? undefined : option } : p) })}>{option}</button>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {draft.extraProjects.length + 1 < MAX_PROJECTS && (
                  <button type="button" className="join-project-add" onClick={() => setDraft({ ...draft, extraProjects: [...draft.extraProjects, { ...emptyProject }] })}>
                    <Plus size={15} /> Add another project
                  </button>
                )}
              </div>
              <p className="join-mini">Where people can find you <span>{draft.links.length ? `${draft.links.length} of ${MAX_LINKS}` : "LinkedIn, GitHub, Dribbble, your site…"}</span></p>
              <div className="join-links">
                {draft.links.map((link, index) => (
                  <div key={index} className="join-link-row">
                    <select aria-label="Link type" value={link.kind} onChange={(e) => setDraft({ ...draft, links: draft.links.map((l, i) => i === index ? { ...l, kind: e.target.value as ConnectKind } : l) })}>
                      {connectKinds.filter((kind) => kind !== "X").map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    <Input value={link.url} placeholder="https://…" aria-label="Link URL" onChange={(e) => setDraft({ ...draft, links: draft.links.map((l, i) => i === index ? { ...l, url: e.target.value } : l) })} />
                    <button type="button" className="join-row-remove" aria-label="Remove link" onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}><Trash2 size={15} /></button>
                  </div>
                ))}
                {draft.links.length < MAX_LINKS && (
                  <button type="button" className="join-project-add" onClick={() => setDraft({ ...draft, links: [...draft.links, { kind: "Website", url: "" }] })}><Plus size={15} /> Add a link</button>
                )}
              </div>
              <p className="join-mini">Work samples <span>{draft.workSamples.length ? `${draft.workSamples.length} of ${MAX_SAMPLES}` : "showreel, case study, portfolio piece"}</span></p>
              <div className="join-links">
                {draft.workSamples.map((sample, index) => (
                  <div key={index} className="join-link-row samples">
                    <Input value={sample.label} maxLength={60} placeholder="What is it?" aria-label="Sample title" onChange={(e) => setDraft({ ...draft, workSamples: draft.workSamples.map((s, i) => i === index ? { ...s, label: e.target.value } : s) })} />
                    <Input value={sample.url} placeholder="https://…" aria-label="Sample URL" onChange={(e) => setDraft({ ...draft, workSamples: draft.workSamples.map((s, i) => i === index ? { ...s, url: e.target.value } : s) })} />
                    <button type="button" className="join-row-remove" aria-label="Remove sample" onClick={() => setDraft({ ...draft, workSamples: draft.workSamples.filter((_, i) => i !== index) })}><Trash2 size={15} /></button>
                  </div>
                ))}
                {draft.workSamples.length < MAX_SAMPLES && (
                  <button type="button" className="join-project-add" onClick={() => setDraft({ ...draft, workSamples: [...draft.workSamples, { label: "", url: "" }] })}><Plus size={15} /> Add a work sample</button>
                )}
              </div>
              <p className="join-mini">Can help with</p>
              <div className="join-picks compact" role="group" aria-label="Can help with">
                {helpWithOptions.map((option) => (
                  <button key={option} type="button" className={draft.canHelpWith.includes(option) ? "selected" : ""} onClick={() => setDraft({ ...draft, canHelpWith: toggleItem(draft.canHelpWith, option) })}>
                    {option}
                  </button>
                ))}
              </div>
              <p className="join-mini">Project stage</p>
              <div className="join-picks compact" role="group" aria-label="Project stage">
                {stageOptions.map((option) => (
                  <button key={option} type="button" className={draft.stage === option ? "selected" : ""} onClick={() => setDraft({ ...draft, stage: option })}>
                    {option}
                  </button>
                ))}
              </div>
              <p className="join-mini">Open to meeting</p>
              <div className="join-picks compact" role="group" aria-label="Open to meeting">
                {meetingOptions.map((option) => (
                  <button key={option} type="button" className={draft.openToMeeting.includes(option) ? "selected" : ""} onClick={() => setDraft({ ...draft, openToMeeting: toggleItem(draft.openToMeeting, option) })}>
                    {option}
                  </button>
                ))}
              </div>
              {error && <p className="join-handle-status is-taken">{error}</p>}
            </section>
          )}

          <footer className="join-foot">
            {step !== "build" ? (
              <button type="button" className="join-back" onClick={() => setStep(step === "more" ? "meet" : step === "meet" ? "place" : "build")}>
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <span />
            )}
            {step === "build" && (
              <button type="button" className="join-next" disabled={!canContinue} onClick={() => setStep("place")}>
                Next <ArrowRight size={16} />
              </button>
            )}
            {step === "place" && (
              <button type="button" className="join-next" disabled={!canContinue} onClick={() => setStep("meet")}>
                Next <ArrowRight size={16} />
              </button>
            )}
            {step === "meet" && (
              <div className="join-split">
                <button type="button" className="join-ghost" disabled={!canContinue || busy} onClick={() => void save(false)}>
                  {busy ? "Saving…" : "Put me on the map"}
                </button>
                <button type="button" className="join-next" disabled={!canContinue || busy} onClick={() => setStep("more")}>
                  Add a little more
                </button>
              </div>
            )}
            {step === "more" && (
              <button type="button" className="join-next" disabled={busy} onClick={() => void save(true)}>
                {busy ? "Saving…" : "Save my pin"}
              </button>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
