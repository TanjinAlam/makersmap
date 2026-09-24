"use client";

import { useEffect } from "react";
import { initDataFast } from "datafast";

type DataFast = Awaited<ReturnType<typeof initDataFast>>;
let client: Promise<DataFast> | null = null;

/** The DataFast client, created once per page. Resolves to null when analytics is off. */
export function analytics(websiteId?: string): Promise<DataFast | null> {
  if (!websiteId || typeof window === "undefined") return Promise.resolve(null);
  client ||= initDataFast({ websiteId, autoCapturePageviews: true });
  return client;
}

/** Records a product event when DataFast is configured; a no-op otherwise. */
export function trackEvent(name: string, props?: Record<string, string | number | boolean>) {
  client?.then((c) => c.track(name, props)).catch(() => undefined);
}

// Mounted once in the root layout. Pageviews are captured on load and on every route change.
export function DataFastAnalytics({ websiteId }: { websiteId: string }) {
  useEffect(() => { analytics(websiteId).catch(() => undefined); }, [websiteId]);
  return null;
}
