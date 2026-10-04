// App-wide constants.

export const LEAGUES = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  cfb: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300",
};

export const POLL_MS = 10000;
export const LIST_REFRESH_MS = 30000;  // the picker list refreshes less often than the board so it doesn't shift under your finger
export const GLOW_MS = 2400;           // matches the redzone-glow animation length (css/board.css)
export const FLASH_MS = 1600;          // matches the card-flash animation length (css/board.css)
export const MOBILE_QUERY = "(max-width: 700px)";  // matches css/mobile.css

export const DEMO = new URLSearchParams(location.search).has("demo");  // ?demo adds fake games, skips the hit counter, always Pelini
