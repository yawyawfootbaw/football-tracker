// Fake games added with ?demo, in the same shape espn.js produces.

export function demoGames() {
  const team = (id, abbr, color, score, logo) => ({ id, abbr, color, score, searchText: " " + abbr.toLowerCase(), logo });
  const nfl = (abbr) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
  const ncaa = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;
  return [{
    // Red-zone showcase.
    key: "nfl:demo", date: new Date(), state: "in", detail: "Demo",
    clock: "2:47", period: 4,
    away: team("12", "KC", "#e31837", "17", nfl("KC")), home: team("2", "BUF", "#00338d", "20", nfl("BUF")),
    yardLine: 12, distance: 6, possession: "12", ddText: "3rd & 6 at BUF 12", redZone: true,
    awayTO: 2, homeTO: 1, lastPlay: "Demo game: P.Mahomes pass short right to T.Kelce for 9 yards", network: "CBS",
  }, {
    // Dark-logo showcase: both logos rely on the faint light edge to stay visible.
    key: "cfb:demo-logos", date: new Date(), state: "in", detail: "Demo",
    clock: "8:14", period: 2,
    away: team("2116", "UCF", "#000000", "10", ncaa(2116)), home: team("344", "MSST", "#5d1725", "14", ncaa(344)),
    yardLine: 58, distance: 10, possession: "344", ddText: "1st & 10 at MSST 42",
    awayTO: 3, homeTO: 2, lastPlay: "Demo game: dark logos (UCF, Mississippi State) with a light edge", network: "SEC Network",
  }];
}
