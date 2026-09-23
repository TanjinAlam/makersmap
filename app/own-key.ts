// The private edit key for a pin created without X. Kept only in this browser.
const KEY = "makersmap-edit-key";
export function readEditKey(): string {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
export function storeEditKey(key: string) {
  try { localStorage.setItem(KEY, key); } catch {}
}
export function ownerHeaders(): Record<string, string> {
  const key = readEditKey();
  return key ? { "x-edit-key": key } : {};
}
