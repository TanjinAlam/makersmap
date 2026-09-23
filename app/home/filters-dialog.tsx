"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Filters } from "./use-shelf";

const TAGS = ["Any interest", "SaaS", "AI", "Design", "Devtools", "Open source", "No-code", "Community", "Marketing"];

export function FiltersDialog({ open, onOpenChange, filters, patch, clear, count }: {
  open: boolean; onOpenChange: (open: boolean) => void; filters: Filters; patch: (change: Partial<Filters>) => void; clear: () => void; count: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-dialog">
        <DialogHeader>
          <DialogTitle>Find your kind of people</DialogTitle>
          <DialogDescription>A shared interest is a pretty good place to start.</DialogDescription>
        </DialogHeader>
        <label className="field-label">Interested in
          <Select value={filters.tag} onValueChange={(tag) => patch({ tag })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TAGS.map((t) => <SelectItem value={t} key={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="switch-row"><div><strong>Looking for design help</strong><span>Find a maker you could lend a hand to.</span></div><Switch aria-label="Looking for design help" checked={filters.helpWanted} onCheckedChange={(helpWanted) => patch({ helpWanted })} /></label>
        <label className="switch-row"><div><strong>Meet nearby</strong><span>People open to a local meetup or a walk.</span></div><Switch aria-label="Meet nearby" checked={filters.nearby} onCheckedChange={(nearby) => patch({ nearby })} /></label>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={clear}>Reset filters</Button>
          <Button className="primary" onClick={() => onOpenChange(false)}>Show {count} makers<ArrowRight size={15} /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
