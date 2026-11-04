// Settings shared by the page and the program on Cloudflare: ESPN's addresses and how long notifications wait and watch.
// No browser APIs, so both can import it.

// ESPN's scoreboard for each league (shared/espn.js, js/recap.js).
export const LEAGUES = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  cfb: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300",
};

// Notifications (shared/alerts.js).
export const TRY_GIVE_UP_MS = 4 * 60_000;    // after a touchdown, how long to watch for how its try went
export const DRIVES_STALE_MS = 60_000;       // drives last seen longer ago than this are caught up silently, not sent
export const CALLED_BACK_MS = 10 * 60_000;   // how long after a score or turnover to watch for it being called back

// The scoreboard's clock against the play-by-play's (shared/espn.js clockRanAhead).
export const CLOCK_SLACK_MS = 60_000;        // slack for ESPN's clock and real time disagreeing
