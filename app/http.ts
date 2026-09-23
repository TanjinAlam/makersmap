export function safeHttpUrl(raw?: string | null): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/[\s<>"]/.test(trimmed)) return "";
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) return "";

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = withScheme.match(/^(https?):\/\/([^/?#]+)(.*)$/i);
  if (!match) return "";

  const host = match[2].replace(/^\[|\]$/g, "");
  if (!host || host.includes("@")) return "";
  const isLocal = host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1");
  if (!isLocal && !host.includes(".")) return "";

  return withScheme;
}

export function urlHostname(raw?: string | null): string {
  const href = safeHttpUrl(raw);
  if (!href) return "";
  const host = href.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] || "";
  return host.replace(/^www\./i, "");
}
