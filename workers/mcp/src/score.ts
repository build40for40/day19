// Turns a Google contact into one row of the brain, and picks each day's hand.
// Pure functions, no I/O, so they are easy to test.

import type { Person } from "./google";

/** Google's built-in contact groups. Anything else is a label the user made. */
const SYSTEM_GROUPS = new Set(["myContacts", "starred", "friends", "family", "coworkers", "chatBuddies", "all", "blocked"]);

export interface IndexedContact {
  resourceName: string;
  etag: string;
  displayName: string;
  /** Last time this contact was edited, ISO 8601. Oldest first is the "probably junk" end. */
  updatedAt: string;
  emails: string[];
  phones: string[];
  photoUrl: string | null;
  /** "" when there's none, as in the shared contract. */
  organisation: string;
  /** How likely it is that this person matters to the user. Higher means more likely. */
  score: number;
  /** Why it scored that, so Claude can say "you starred them" and the team can tune it. */
  signals: string[];
}

function groupIds(person: Person): string[] {
  return (person.memberships ?? []).flatMap((m) => {
    const name = m.contactGroupMembership?.contactGroupResourceName;
    return name ? [name.replace(/^contactGroups\//, "")] : [];
  });
}

/** The latest edit time across this contact's sources, or the epoch when Google didn't say. */
export function lastUpdated(person: Person): string {
  const times = (person.metadata?.sources ?? []).flatMap((s) => (s.updateTime ? [s.updateTime] : []));
  return times.sort().at(-1) ?? "1970-01-01T00:00:00Z";
}

/**
 * Cheap clues, no AI: signs the user has put effort into this contact.
 * The weights are a first guess. Tune them once real address books are in.
 */
export function scoreContact(person: Person, userFamilyName: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  const add = (signal: string, points: number) => {
    signals.push(signal);
    return points;
  };
  let score = 0;
  const groups = groupIds(person);

  if (groups.includes("starred")) score += add("starred", 3);
  if (groups.some((g) => g === "family" || g === "friends")) score += add("family or friends group", 2);
  if (groups.some((g) => !SYSTEM_GROUPS.has(g))) score += add("in a label you made", 2);
  if (person.birthdays?.length) score += add("has a birthday", 2);
  if (person.photos?.some((p) => !p.default)) score += add("has a photo", 1);
  if (person.biographies?.some((b) => b.value.trim())) score += add("has notes", 1);
  if (person.emailAddresses?.length && person.phoneNumbers?.length) score += add("has email and phone", 1);

  const familyName = person.names?.[0]?.familyName?.trim().toLowerCase();
  if (familyName && userFamilyName && familyName === userFamilyName.trim().toLowerCase()) {
    score += add("shares your surname", 2);
  }
  return { score, signals };
}

export function indexContact(person: Person, userFamilyName: string): IndexedContact {
  const { score, signals } = scoreContact(person, userFamilyName);
  const name =
    person.names?.[0]?.displayName?.trim() ||
    person.emailAddresses?.[0]?.value ||
    person.phoneNumbers?.[0]?.value ||
    "(no name)";
  return {
    resourceName: person.resourceName,
    etag: person.etag,
    displayName: name,
    updatedAt: lastUpdated(person),
    emails: (person.emailAddresses ?? []).map((e) => e.value),
    phones: (person.phoneNumbers ?? []).map((p) => p.value),
    photoUrl: person.photos?.find((p) => !p.default)?.url ?? null,
    organisation: person.organizations?.[0]?.name ?? "",
    score,
    signals,
  };
}

/** The hand: OLDEST oldest-edited contacts, plus MEANINGFUL of the highest scores. */
export const HAND = { oldest: 3, meaningful: 2 } as const;

/**
 * Deals the next hand from contacts nobody has decided on yet.
 * The oldest slots skip anyone who scores well, so the two halves stay different:
 * a starred contact from 2014 belongs in the "say thanks" half, not the "clear out" half.
 * When one half runs short, the other fills the gap.
 */
export function dealHand<T extends { resourceName: string; updatedAt: string; score: number; displayName: string }>(
  undecided: T[],
  hand: { oldest: number; meaningful: number } = HAND,
): T[] {
  const size = hand.oldest + hand.meaningful;
  const byOldest = [...undecided].sort(
    (a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.displayName.localeCompare(b.displayName),
  );
  const byScore = [...undecided].sort(
    (a, b) => b.score - a.score || a.updatedAt.localeCompare(b.updatedAt),
  );

  const picked = new Map<string, T>();
  for (const c of byScore) {
    if (picked.size >= hand.meaningful || c.score <= 0) break;
    picked.set(c.resourceName, c);
  }
  const meaningfulCount = picked.size;
  for (const c of byOldest) {
    if (picked.size >= meaningfulCount + hand.oldest) break;
    if (c.score <= 0) picked.set(c.resourceName, c);
  }
  // Top up from oldest first if either half ran short.
  for (const c of byOldest) {
    if (picked.size >= size) break;
    picked.set(c.resourceName, c);
  }
  return [...picked.values()];
}
