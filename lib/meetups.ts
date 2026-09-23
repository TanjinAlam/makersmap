import { citySlug } from "@/app/profile";

export type Meetup = {
  id: string;
  city: string;
  title: string;
  /** ISO date-time. */
  date: string;
  where?: string;
  url?: string;
  /** Handle of the maker who added it. */
  host?: string;
  source: "demo" | "self";
};


// Fictional meetups so city pages have something to show. Dates are relative to today.
export const demoMeetups: Meetup[] = [];

export function upcoming(meetups: Meetup[], now = Date.now()): Meetup[] {
  return meetups
    .filter((m) => new Date(m.date).getTime() >= now - 2 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function meetupsForCity(meetups: Meetup[], city: string): Meetup[] {
  const slug = citySlug(city);
  return meetups.filter((m) => citySlug(m.city) === slug);
}
