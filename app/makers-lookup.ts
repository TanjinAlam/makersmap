import { normalizeHandle } from "@/app/handle";
import { isMongoConfigured } from "@/db";
import { findMakerByHandle, listMakers, listPublicWhere } from "@/db/makers";
import { cache } from "react";
import { publicMaker, type Maker } from "@/app/profile";

// Wrapped in React's cache so a page that needs the list in metadata and body reads it once.
export const listPublicMakers = cache(async function listPublicMakers(): Promise<Maker[]> {
  if (isMongoConfigured()) {
    try {
      return (await listMakers()).filter((maker) => !maker.hidden).map(publicMaker);
    } catch {
      // Unreachable database: an empty atlas rather than a crash.
    }
  }
  return [];
});

export const resolveMakerByHandle = cache(async function resolveMakerByHandle(raw: string): Promise<Maker | null> {
  const slug = normalizeHandle(raw);
  if (!slug || !isMongoConfigured()) return null;
  try {
    const direct = await findMakerByHandle(slug);
    return direct && !direct.hidden ? publicMaker(direct) : null;
  } catch {
    return null;
  }
});

/** Visible makers in one country or city, by stored key, without loading the whole atlas. */
export const listPublicInPlace = cache(async function listPublicInPlace(kind: "country" | "city", slug: string): Promise<Maker[]> {
  if (!isMongoConfigured()) return [];
  try {
    return (await listPublicWhere(kind === "country" ? { countryKey: slug } : { cityKey: slug, "x.placeLevel": { $ne: "country" } })).map(publicMaker);
  } catch { return []; }
});
