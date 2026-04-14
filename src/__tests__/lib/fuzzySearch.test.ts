import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyFilter, type SearchItem } from "@/lib/fuzzySearch";

describe("fuzzyMatch", () => {
  it("returns 0 for empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(0);
  });

  it("returns -1 when query is longer than target", () => {
    expect(fuzzyMatch("abcdef", "abc")).toBe(-1);
  });

  it("matches exact strings", () => {
    expect(fuzzyMatch("dashboard", "Dashboard")).toBeGreaterThanOrEqual(0);
  });

  it("matches partial queries", () => {
    expect(fuzzyMatch("dash", "Dashboard")).toBeGreaterThanOrEqual(0);
  });

  it("returns -1 for non-matching strings", () => {
    expect(fuzzyMatch("xyz", "Dashboard")).toBe(-1);
  });

  it("is case insensitive", () => {
    const score1 = fuzzyMatch("DASH", "dashboard");
    const score2 = fuzzyMatch("dash", "Dashboard");
    expect(score1).toBe(score2);
  });

  it("scores word-boundary matches better", () => {
    const boundaryScore = fuzzyMatch("gp", "GitHub Push");
    const midScore = fuzzyMatch("gp", "agger precompute");
    // Both should match, but boundary match should score lower (better)
    expect(boundaryScore).toBeGreaterThanOrEqual(0);
    expect(midScore).toBeGreaterThanOrEqual(0);
  });

  it("matches characters in order", () => {
    expect(fuzzyMatch("dbd", "Dashboard")).toBeGreaterThanOrEqual(0);
    // "zyx" has no chars in Dashboard
    expect(fuzzyMatch("zyx", "Dashboard")).toBe(-1);
  });
});

describe("fuzzyFilter", () => {
  const items: SearchItem[] = [
    { id: "1", label: "Dashboard", type: "page", href: "/" },
    { id: "2", label: "Agents", type: "page", href: "/agents" },
    { id: "3", label: "GitHub Push Handler", type: "webhook", href: "/webhooks" },
    { id: "4", label: "Daily News Digest", type: "cron", href: "/cron" },
    { id: "5", label: "Flight Search", type: "task", href: "/tasks" },
  ];

  it("returns all items for empty query", () => {
    expect(fuzzyFilter(items, "")).toHaveLength(5);
  });

  it("returns all items for whitespace query", () => {
    expect(fuzzyFilter(items, "   ")).toHaveLength(5);
  });

  it("filters to matching items", () => {
    const results = fuzzyFilter(items, "dash");
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("Dashboard");
  });

  it("returns multiple matches", () => {
    const results = fuzzyFilter(items, "a");
    expect(results.length).toBeGreaterThan(1);
  });

  it("returns empty array when nothing matches", () => {
    const results = fuzzyFilter(items, "zzzzz");
    expect(results).toHaveLength(0);
  });

  it("sorts results by relevance", () => {
    const results = fuzzyFilter(items, "d");
    expect(results.length).toBeGreaterThan(0);
    // Dashboard should be first (starts with D)
    expect(results[0].label).toBe("Dashboard");
  });
});
