import { describe, expect, it } from "vitest";
import type { Person } from "./google";
import { dealHand, indexContact, lastUpdated, scoreContact } from "./score";

const person = (overrides: Partial<Person> = {}): Person => ({
  resourceName: "people/c1",
  etag: "e1",
  names: [{ displayName: "Ada Example", familyName: "Example" }],
  metadata: { sources: [{ type: "CONTACT", updateTime: "2019-04-01T10:00:00Z" }] },
  ...overrides,
});

describe("scoreContact", () => {
  it("scores a bare contact as zero", () => {
    expect(scoreContact(person({ names: [{ displayName: "Plumber" }] }), "Kao")).toEqual({ score: 0, signals: [] });
  });

  it("adds up the clues and says why", () => {
    const { score, signals } = scoreContact(
      person({
        memberships: [{ contactGroupMembership: { contactGroupResourceName: "contactGroups/starred" } }],
        birthdays: [{}],
        photos: [{ url: "https://example.com/a.jpg" }],
      }),
      "example",
    );
    expect(signals).toEqual(["starred", "has a birthday", "has a photo", "shares your surname"]);
    expect(score).toBe(3 + 2 + 1 + 2);
  });

  it("ignores Google's placeholder letter photos", () => {
    expect(scoreContact(person({ photos: [{ url: "x", default: true }] }), "").signals).not.toContain("has a photo");
  });

  it("counts a label the user made, but not Google's own groups", () => {
    const label = (id: string) => person({ memberships: [{ contactGroupMembership: { contactGroupResourceName: `contactGroups/${id}` } }] });
    expect(scoreContact(label("1a2b3c"), "").signals).toContain("in a label you made");
    expect(scoreContact(label("myContacts"), "").signals).toEqual([]);
  });
});

describe("indexContact", () => {
  it("falls back to email when there's no name", () => {
    const c = indexContact(person({ names: undefined, emailAddresses: [{ value: "ada@example.com" }] }), "");
    expect(c.displayName).toBe("ada@example.com");
  });

  it("uses the latest edit time across sources", () => {
    expect(
      lastUpdated(person({ metadata: { sources: [{ type: "CONTACT", updateTime: "2019-01-01T00:00:00Z" }, { type: "PROFILE", updateTime: "2021-01-01T00:00:00Z" }] } })),
    ).toBe("2021-01-01T00:00:00Z");
  });
});

describe("dealHand", () => {
  const c = (id: string, updatedAt: string, score = 0) => ({ resourceName: id, displayName: id, updatedAt, score });

  it("deals the 3 oldest unscored plus the 2 highest scores", () => {
    const hand = dealHand([
      c("new-junk", "2025-01-01"),
      c("old-junk-1", "2012-01-01"),
      c("old-junk-2", "2013-01-01"),
      c("old-junk-3", "2014-01-01"),
      c("mum", "2024-01-01", 9),
      c("old-friend", "2011-01-01", 4),
      c("meh", "2023-01-01", 1),
    ]).map((x) => x.resourceName);
    expect(hand).toEqual(["mum", "old-friend", "old-junk-1", "old-junk-2", "old-junk-3"]);
  });

  it("tops up from the oldest when nobody scores", () => {
    const hand = dealHand([c("a", "2015"), c("b", "2011"), c("c", "2012"), c("d", "2013"), c("e", "2014"), c("f", "2016")]);
    expect(hand.map((x) => x.resourceName)).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("deals what's left when fewer than 5 remain", () => {
    expect(dealHand([c("a", "2015", 2), c("b", "2011")])).toHaveLength(2);
    expect(dealHand([])).toEqual([]);
  });
});
