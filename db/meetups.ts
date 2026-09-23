import { withDb } from "./index";
import { isMongoConfigured } from "./index";
import { demoMeetups, meetupsForCity, upcoming, type Meetup } from "@/lib/meetups";

const COLLECTION = "meetups";

type MeetupRecord = Meetup & { _id?: unknown };

export async function listMeetups(city?: string): Promise<Meetup[]> {
  let stored: Meetup[] = [];
  if (isMongoConfigured()) {
    try {
      stored = await withDb(async (db) => {
        const docs = await db.collection<MeetupRecord>(COLLECTION).find().toArray();
        return docs.map(({ _id: _unused, ...meetup }) => meetup);
      });
    } catch {
      // Fall through to demo meetups when Mongo is unreachable.
    }
  }
  const all = upcoming([...demoMeetups, ...stored]);
  return city ? meetupsForCity(all, city) : all;
}

export async function addMeetup(meetup: Meetup): Promise<Meetup> {
  return withDb(async (db) => {
    await db.collection<MeetupRecord>(COLLECTION).insertOne({ ...meetup });
    return meetup;
  });
}
