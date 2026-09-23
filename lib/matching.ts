import { isOpenInPerson, roleGroupOf, xHandleOf, type HelpWith, type LookingFor, type Maker } from "@/app/profile";

export type MatchReason = string;
export type Match = { maker: Maker; score: number; reasons: MatchReason[]; theirReasons: MatchReason[] };

// What a maker who is "looking for" X would find useful in someone else.
const helpFor: Partial<Record<LookingFor, HelpWith[]>> = {
  Feedback: ["Product", "Design", "Engineering", "Marketing"],
  Customers: ["Marketing", "Sales"],
  Cofounder: ["Engineering", "Design", "Product", "Marketing", "Sales"],
};

function overlap<T>(a: T[], b: T[]): T[] {
  return a.filter((item) => b.includes(item));
}

// Complementary roles for a cofounder search: business people need builders and vice versa.
function complementaryRoles(a: Maker, b: Maker): boolean {
  const ga = roleGroupOf(a.role), gb = roleGroupOf(b.role);
  const builder = (g: string) => g === "Developers" || g === "Designers";
  const business = (g: string) => g === "Founders" || g === "Business";
  return (builder(ga) && business(gb)) || (business(ga) && builder(gb)) || (ga === "Developers" && gb === "Designers") || (ga === "Designers" && gb === "Developers");
}

// Scores how useful B is to A. Not symmetric: a mutual-benefit bonus is added on top.
export function scoreMatch(a: Maker, b: Maker): { score: number; reasons: MatchReason[] } {
  let score = 0;
  const weighted: [number, MatchReason][] = [];
  const reasons = { push: (text: MatchReason, weight = 1) => weighted.push([weight, text]), some: (fn: (r: MatchReason) => boolean) => weighted.some(([, r]) => fn(r)) };
  const first = b.name.split(" ")[0];

  for (const need of a.lookingFor) {
    const wanted = helpFor[need];
    if (wanted) {
      const offers = overlap(wanted, b.canHelpWith);
      if (offers.length) {
        score += 3;
        reasons.push(`${first} can help with ${offers.slice(0, 2).join(" and ").toLowerCase()}, and you're looking for ${need.toLowerCase()}`, 5);
      }
    }
    if (need === "Cofounder" && complementaryRoles(a, b)) {
      score += 4;
      reasons.push(`A ${b.role.toLowerCase()} is the other half a ${a.role.toLowerCase()} usually needs`, 6);
    }
    if (need === "Founder friends" && roleGroupOf(b.role) === "Founders") {
      score += 2;
      reasons.push(`${first} is a founder too`, 1);
    }
    if (need === "Coffee" && isOpenInPerson(b)) {
      score += a.city && a.city === b.city ? 3 : 1;
      if (a.city && a.city === b.city) reasons.push(`Both of you are up for coffee in ${a.city}`, 5);
    }
  }

  // Mutual benefit: does A satisfy something B is looking for?
  const mutual = b.lookingFor.some((need) => {
    const wanted = helpFor[need];
    return (wanted && overlap(wanted, a.canHelpWith).length > 0) || (need === "Cofounder" && complementaryRoles(a, b));
  });
  if (mutual) {
    score += 2;
    reasons.push(`it goes both ways, you have what ${first} is looking for`, 4);
  }

  const shared = overlap(a.tags, b.tags);
  if (shared.length) {
    score += Math.min(3, shared.length);
    reasons.push(`you both care about ${shared.slice(0, 2).join(" and ")}`, 3);
  }

  const sharedSkills = overlap(a.skills.map((s) => s.toLowerCase()), b.skills.map((s) => s.toLowerCase()));
  if (sharedSkills.length) {
    score += 1;
    reasons.push(`you share tools like ${sharedSkills.slice(0, 2).join(" and ")}`, 2);
  }

  if (a.city && a.city === b.city) {
    score += 3;
    if (!reasons.some((r) => r.includes(a.city))) reasons.push(`${first} is also in ${a.city}`, 4);
  } else if (a.country && a.country === b.country) {
    score += 2;
    reasons.push(`${first} is also in ${a.country}`, 2);
  } else if (a.timezone && a.timezone === b.timezone) {
    score += 1;
    reasons.push("you're in the same time zone", 1);
  }

  if (a.city && a.city === b.city && a.openToMeeting.includes("Local meetups") && b.openToMeeting.includes("Local meetups")) {
    score += 2;
  }

  const ordered = weighted.sort((x, y) => y[0] - x[0]).map(([, text]) => text);
  return { score, reasons: ordered };
}

export function topMatches(maker: Maker, pool: Maker[], limit = 3): Match[] {
  return pool
    .filter((other) => other.id !== maker.id && other.handle !== maker.handle)
    .map((other) => {
      const mine = scoreMatch(maker, other);
      // The other direction, so the card can say what the match gets out of it too.
      const theirs = scoreMatch(other, maker);
      return { maker: other, score: mine.score + Math.round(theirs.score / 2), reasons: mine.reasons, theirReasons: theirs.reasons };
    })
    .filter((match) => match.score > 0)
    .sort((x, y) => y.score - x.score || x.maker.id - y.maker.id)
    .slice(0, limit);
}

// The public shape returned by the API: enough to render a card, nothing private.
export function publicMatch(match: Match, intro: string, theirIntro: string) {
  const { maker } = match;
  return {
    id: maker.id,
    handle: maker.handle,
    xHandle: xHandleOf(maker),
    name: maker.name,
    role: maker.role,
    city: maker.city,
    country: maker.country,
    flag: maker.flag,
    avatar: maker.avatar,
    initials: maker.initials,
    color: maker.color,
    project: maker.project,
    lookingFor: maker.lookingFor,
    canHelpWith: maker.canHelpWith,
    score: match.score,
    reasons: match.reasons,
    theirReasons: match.theirReasons,
    intro,
    theirIntro,
  };
}
