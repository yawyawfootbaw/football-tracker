// Settings shared by the page and the program on Cloudflare. ESPN's timing limits are in shared/espn-timing.js.
// No browser APIs, so both can import it.

// ESPN's scoreboard for each league (shared/espn.js, js/recap.js).
export const LEAGUES = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  cfb: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300",
};
