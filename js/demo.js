// Made-up games for trying things out, both picked automatically when the admin opens the page with ?admin:
// - a kickoff game, upcoming when the page opens, then live 10 seconds later, so you can watch its card grow from
//   the Upcoming section into Live;
// - a game that's already live (Texas in the red zone), so there's a live card to look at straight away.

export const DEMO_KICKOFF_KEY = "cfb:demo";
export const DEMO_LIVE_KEY = "cfb:demo-live";
export const DEMO_KEYS = [DEMO_KICKOFF_KEY, DEMO_LIVE_KEY];
const KICKOFF_AFTER_MS = 10_000;
const LIVE_CLOCK_S = 7 * 60 + 42;  // the live game's clock when the page opens; it runs down from there
let opened = Date.now();

/** Start the clocks: the kickoff game goes live KICKOFF_AFTER_MS from now. */
export function startDemo() {
  opened = Date.now();
}

const team = (id, abbr, color, score, rank, record) => ({ id, abbr, color, score, rank, record, conf: "5",
  logo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png` });

/** The demo games as they stand right now, in the same shape js/espn.js produces. */
export function demoGames() {
  return [kickoffGame(), liveGame()];
}

function kickoffGame() {
  const live = Date.now() - opened >= KICKOFF_AFTER_MS;
  const game = {
    key: DEMO_KICKOFF_KEY, date: new Date(opened + KICKOFF_AFTER_MS), state: live ? "in" : "pre", detail: "Demo",
    clock: "15:00", period: 1, network: "DEMO",
    away: team("194", "OSU", "#ba0c2f", "0", 3, "5-0"),
    home: team("84", "IU", "#990000", "0", 2, "5-0"),
  };
  if (!live) return game;
  // Right after the opening kickoff: OSU ball at its own 25 (75 yards from IU's goal line).
  return { ...game, yardLine: 75, distance: 10, possession: "194", ddText: "1st & 10 at OSU 25", redZone: false,
    homeTO: 3, awayTO: 3, lastPlay: "IU kickoff for 65 yds, touchback" };
}

function liveGame() {
  const left = Math.max(0, LIVE_CLOCK_S - Math.floor((Date.now() - opened) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  // Texas ball at the Michigan 12. yardLine counts from the home (Texas) goal line, so that's 88.
  return {
    key: DEMO_LIVE_KEY, date: new Date(opened - 2 * 60 * 60_000), state: "in", detail: `${clock} - 3rd`,
    clock, period: 3, network: "DEMO",
    away: team("130", "MICH", "#00274c", "17", 8, "4-1"),
    home: team("251", "TEX", "#bf5700", "20", 5, "4-1"),
    yardLine: 88, distance: 7, possession: "251", ddText: "2nd & 7 at MICH 12", redZone: true,
    homeTO: 2, awayTO: 1, lastPlay: "Arch Manning pass complete to Ryan Wingo for 3 yds to the MICH 12",
  };
}
