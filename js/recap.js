// ESPN's written recap for finished games. It's posted a while after the final whistle, usually 5–50 minutes,
// so each picked final game's summary is checked every couple of minutes until the recap shows up.
// After an hour of checking, give up.

import { LEAGUES, RECAP_CHECK_MS, RECAP_GIVE_UP_MS } from "./config.js";

const found = new Map();   // game key -> recap URL
const checks = new Map();  // game key -> { since: first check, last: latest check }

export const recapUrl = (key) => found.get(key);

/** Check the given games' summaries for a recap, where one is due. Resolves true if a new recap turned up. */
export async function checkRecaps(games) {
  const now = Date.now();
  const due = games.filter((g) => {
    if (g.state !== "post" || found.has(g.key)) return false;
    if (!checks.has(g.key)) checks.set(g.key, { since: now, last: -Infinity });
    const c = checks.get(g.key);
    // A second of slack: polls drift by a few ms, and missing the mark by that much would wait out a whole extra poll.
    return now - c.since <= RECAP_GIVE_UP_MS && now - c.last >= RECAP_CHECK_MS - 1000;
  });
  const results = await Promise.all(due.map(async (g) => {
    checks.get(g.key).last = now;
    const [league, id] = g.key.split(":");
    try {
      const { article } = await (await fetch(LEAGUES[league].replace(/scoreboard.*$/, `summary?event=${id}`))).json();
      if (article?.type !== "Recap") return false;
      // The scoreboard's recap link is https; the article's own web link is plain http.
      found.set(g.key, g.recap ?? article.links?.web?.href?.replace(/^http:/, "https:"));
      return found.get(g.key) != null;
    } catch (err) {
      console.error(g.key, err);
      return false;
    }
  }));
  return results.some(Boolean);
}
