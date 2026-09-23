"use client";

import { useCallback, useSyncExternalStore } from "react";

// Browser storage as a React store. Components read it through
// useSyncExternalStore, so the first client render matches the server render
// (the server snapshot) and no effect has to copy storage into state.

type Store = "local" | "session";
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, unknown>();
const serverSnapshots = new Map<string, unknown>();

function storage(kind: Store): Storage | null {
  try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

/**
 * A value kept in localStorage (or sessionStorage). `parse` turns the raw
 * string (or null when absent) into the value and must be a stable function;
 * define it at module level.
 */
export function useStoredState<T>(key: string, parse: (raw: string | null) => T, options: { store?: Store; serialize?: (value: T) => string } = {}): [T, (next: T | ((prev: T) => T)) => void] {
  const kind = options.store ?? "local";
  const serialize = options.serialize;
  const cacheKey = `${kind}:${key}`;

  const subscribe = useCallback((cb: () => void) => {
    let set = listeners.get(cacheKey);
    if (!set) { set = new Set(); listeners.set(cacheKey, set); }
    set.add(cb);
    const onStorage = (event: StorageEvent) => { if (event.key === key) { cache.delete(cacheKey); cb(); } };
    window.addEventListener("storage", onStorage);
    return () => { set!.delete(cb); window.removeEventListener("storage", onStorage); };
  }, [cacheKey, key]);

  const getSnapshot = useCallback(() => {
    if (!cache.has(cacheKey)) {
      let raw: string | null = null;
      try { raw = storage(kind)?.getItem(key) ?? null; } catch { raw = null; }
      cache.set(cacheKey, parse(raw));
    }
    return cache.get(cacheKey) as T;
  }, [cacheKey, key, kind, parse]);

  const getServerSnapshot = useCallback(() => {
    if (!serverSnapshots.has(cacheKey)) serverSnapshots.set(cacheKey, parse(null));
    return serverSnapshots.get(cacheKey) as T;
  }, [cacheKey, parse]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(getSnapshot()) : next;
    cache.set(cacheKey, resolved);
    try { storage(kind)?.setItem(key, serialize ? serialize(resolved) : JSON.stringify(resolved)); } catch {}
    notify(cacheKey);
  }, [cacheKey, key, kind, serialize, getSnapshot]);

  return [value, set];
}

const noop = () => () => {};
/** False during server render and the first client render, true after hydration. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

// Shared parsers for the keys the site uses.
export const parseIds = (raw: string | null): number[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "number") : []; } catch { return []; }
};
export const parseStrings = (raw: string | null): string[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};
export const parseString = (raw: string | null): string => raw || "";
