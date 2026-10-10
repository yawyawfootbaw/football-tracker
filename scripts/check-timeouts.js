// Compares the timeouts ESPN's scoreboard reports (situation.homeTimeouts/awayTimeouts; the cards dropped them for this) with the
// timeouts actually called in each half, counted from the game's play log, for every live or finished game.
// Teams get 3 per half (college and NFL), so "left" should be 3 minus those called in the current half.
//
// Usage: node scripts/check-timeouts.js [cfb|nfl]   (default cfb)

const LEAGUE = process.argv[2] ?? "cfb";
const BASE = `https://site.api.espn.com/apis/site/v2/sports/football/${LEAGUE === "nfl" ? "nfl" : "college-football"}`;
const get = async (url) => (await fetch(url)).json();

(async () => {
  const board = await get(`${BASE}/scoreboard${LEAGUE === "nfl" ? "" : "?groups=80&limit=300"}`);
  for (const e of board.events) {
    const { state, period, shortDetail } = e.status.type.state === "pre" ? { state: "pre" } : { ...e.status, ...e.status.type };
    if (state !== "in") continue;
    const comp = e.competitions[0], s = comp.situation ?? {};
    const team = (ha) => comp.competitors.find((c) => c.homeAway === ha).team;
    const home = team("home"), away = team("away");
    const summary = await get(`${BASE}/summary?event=${e.id}`);
    const drives = [...(summary.drives?.previous ?? []), ...(summary.drives?.current ? [summary.drives.current] : [])];
    const half = period >= 3 ? 2 : 1;
    const called = { [home.id]: 0, [away.id]: 0 };
    for (const p of drives.flatMap((d) => d.plays ?? [])) {
      const playHalf = p.period.number >= 3 ? 2 : 1;
      if (p.type?.text !== "Timeout" || playHalf !== half || p.period.number > 4) continue;
      const id = [home, away].find((t) => p.text?.includes(t.location) || p.text?.includes(t.displayName))?.id;
      if (id) called[id]++;
    }
    console.log(`${e.shortName.padEnd(14)} ${String(shortDetail).padEnd(14)} ESPN left ${away.abbreviation} ${s.awayTimeouts} ${home.abbreviation} ${s.homeTimeouts}` +
      `  |  from plays, left this half ${away.abbreviation} ${3 - called[away.id]} ${home.abbreviation} ${3 - called[home.id]}`);
  }
})();
