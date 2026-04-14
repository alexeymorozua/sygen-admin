/**
 * Simple fuzzy matching: checks if all characters of the query
 * appear in the target in order (case-insensitive).
 * Returns a score (0 or higher, lower is better) or -1 if no match.
 */
export function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  let qi = 0;
  let score = 0;
  let lastIdx = -1;
  let boundaryMatches = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Penalize gaps between matched chars
      const gap = lastIdx === -1 ? 0 : ti - lastIdx - 1;
      score += gap;
      // Track word-boundary matches for bonus
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_" || t[ti - 1] === "/") {
        boundaryMatches++;
      }
      lastIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1;

  // Apply boundary bonus as a fraction to keep score >= 0
  const maxBonus = score;
  const bonus = Math.min(boundaryMatches * 2, maxBonus);
  return score - bonus;
}

export interface SearchItem {
  id: string;
  label: string;
  type: "agent" | "cron" | "webhook" | "task" | "page";
  href: string;
  icon?: string;
}

export function fuzzyFilter<T extends { label: string }>(
  items: T[],
  query: string,
): T[] {
  if (!query.trim()) return items;

  return items
    .map((item) => ({ item, score: fuzzyMatch(query, item.label) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((r) => r.item);
}
