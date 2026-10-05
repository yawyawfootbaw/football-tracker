// The ?demo page's made-up game: picked automatically, upcoming when the page opens, then live 10 seconds later,
// so you can watch its card grow from the Upcoming section into Live.

export const DEMO_KEY = "cfb:demo";
const KICKOFF_AFTER_MS = 10_000;
const opened = Date.now();

const team = (id, abbr, color, score, rank, record) => ({ id, abbr, color, score, rank, record, conf: "5",
  logo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png` });

/** The demo game as it stands right now, in the same shape js/espn.js produces. */
export function demoGame() {
  const live = Date.now() - opened >= KICKOFF_AFTER_MS;
  const game = {
    key: DEMO_KEY, date: new Date(opened + KICKOFF_AFTER_MS), state: live ? "in" : "pre", detail: "Demo",
    clock: "15:00", period: 1, network: "DEMO",
    away: team("194", "OSU", "#ba0c2f", "0", 3, "5-0"),
    home: team("84", "IU", "#990000", "0", 2, "5-0"),
  };
  if (!live) return game;
  // Right after the opening kickoff: OSU ball at its own 25 (75 yards from IU's goal line).
  return { ...game, yardLine: 75, distance: 10, possession: "194", ddText: "1st & 10 at OSU 25", redZone: false,
    homeTO: 3, awayTO: 3, lastPlay: "IU kickoff for 65 yds, touchback" };
}
