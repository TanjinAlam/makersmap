import { withDb } from "@/db";
import { MAKERS_COLLECTION, toMaker } from "@/db/makers";
import { getSetting, setSetting } from "@/db/settings";
import { citySlug, hasCity, isCoffeeThisWeek, isPlaced, type Maker } from "@/app/profile";
import { emailConfigured, sendEmail, unsubscribeToken } from "./email";
import { signalsSince } from "./signals";

type MakerRecord = Maker & { _id?: unknown };

// The weekly digest: "12 people looked at your pin this week, 3 new makers in
// Berlin, 2 up for coffee." Only to claimed owners with an email who haven't
// turned it off, at most once every 7 days each.
export async function sendWeeklyDigests(site: string, max = 200): Promise<{ eligible: number; sent: number; skipped: number; errors: string[] }> {
  const report = { eligible: 0, sent: 0, skipped: 0, errors: [] as string[] };
  if (!emailConfigured()) { report.errors.push("Email is not configured (RESEND_API_KEY)."); return report; }
  const last = (await getSetting<Record<string, string>>("digest-sent")) || {};
  const weekAgo = Date.now() - 7 * 86400000;
  const owners = await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ claimed: true, hidden: { $ne: true }, email: { $exists: true, $ne: "" }, emailUpdates: { $ne: false } }).toArray());
  const everyone = (await withDb((db) => db.collection<MakerRecord>(MAKERS_COLLECTION).find({ hidden: { $ne: true } }).toArray())).map(toMaker);
  report.eligible = owners.length;
  for (const record of owners) {
    if (report.sent >= max) break;
    const maker = toMaker(record);
    if (!maker.handle || !record.email) continue;
    if (last[maker.handle] && new Date(last[maker.handle]).getTime() > weekAgo) { report.skipped += 1; continue; }
    const signals = await signalsSince(maker.handle, 7);
    const place = hasCity(maker) ? maker.city : maker.country;
    const nearby = isPlaced(maker) ? everyone.filter((m) => m.id !== maker.id && (hasCity(maker) ? citySlug(m.city) === citySlug(maker.city) : m.country === maker.country)) : [];
    const newNearby = nearby.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() > weekAgo);
    const coffee = nearby.filter((m) => isCoffeeThisWeek(m));
    if (signals.view + signals.save + newNearby.length + coffee.length === 0) { report.skipped += 1; continue; } // nothing to say this week
    const first = maker.name.split(" ")[0];
    const token = await unsubscribeToken(maker.handle);
    const lines = [
      signals.view ? `${signals.view} ${signals.view === 1 ? "person" : "people"} looked at your pin.` : "",
      signals.save ? `${signals.save} saved you to their list.` : "",
      newNearby.length ? `${newNearby.length} new ${newNearby.length === 1 ? "maker" : "makers"} in ${place}: ${newNearby.slice(0, 3).map((m) => m.name).join(", ")}${newNearby.length > 3 ? " and more" : ""}.` : "",
      coffee.length ? `${coffee.length} in ${place} ${coffee.length === 1 ? "is" : "are"} up for coffee this week.` : "",
    ].filter(Boolean);
    const subject = signals.view ? `${signals.view} people looked at your pin this week` : `This week in ${place} on MakersMap`;
    const profile = `${site}/m/${maker.handle}`;
    const text = `Hi ${first},\n\n${lines.join("\n")}\n\nYour pin: ${profile}\nPeople near you: ${site}/city/${citySlug(maker.city)}\n\nOne email a week, only when there's something to say. Turn it off: ${site}/api/email/unsubscribe?token=${token}`;
    const html = `<p>Hi ${first},</p>${lines.map((l) => `<p>${l}</p>`).join("")}<p><a href="${profile}">Your pin</a> · <a href="${site}/city/${citySlug(maker.city)}">People near you</a></p><p style="color:#888;font-size:12px">One email a week, only when there's something to say. <a href="${site}/api/email/unsubscribe?token=${token}">Turn it off</a>.</p>`;
    const result = await sendEmail(record.email, subject, html, text);
    if (result.ok) { report.sent += 1; last[maker.handle] = new Date().toISOString(); }
    else report.errors.push(`@${maker.handle}: ${result.error}`);
  }
  await setSetting("digest-sent", last);
  return report;
}
