// Fetching and normalizing ESPN's unofficial scoreboard API into the shape the UI renders.

import { LEAGUES } from "./config.js";

// ESPN's NFL scoreboard doesn't say which conference or division a team is in, so keep the alignment here.
export const NFL_DIVISIONS = {
  "AFC East": ["BUF", "MIA", "NE", "NYJ"],
  "AFC North": ["BAL", "CIN", "CLE", "PIT"],
  "AFC South": ["HOU", "IND", "JAX", "TEN"],
  "AFC West": ["DEN", "KC", "LAC", "LV"],
  "NFC East": ["DAL", "NYG", "PHI", "WSH"],
  "NFC North": ["CHI", "DET", "GB", "MIN"],
  "NFC South": ["ATL", "CAR", "NO", "TB"],
  "NFC West": ["ARI", "LAR", "SEA", "SF"],
};
const nflDivisionOf = Object.fromEntries(
  Object.entries(NFL_DIVISIONS).flatMap(([division, teams]) => teams.map((abbr) => [abbr, division])));

// Conference names arrive only on conference games, so learn them as games come in.
// Independents (Notre Dame etc.) never play a "conference game", so seed that one.
export const confNames = { 18: "Independent" };

export async function fetchGames(league) {
  const data = await (await fetch(LEAGUES[league])).json();
  return data.events.map((e) => parseEvent(league, e));
}

function parseEvent(league, e) {
  const comp = e.competitions[0];
  if (comp.groups?.isConference) confNames[comp.groups.id] = comp.groups.shortName;
  const side = (ha) => {
    const c = comp.competitors.find((t) => t.homeAway === ha);
    // conf: a college conference id, or an NFL division name like "AFC East".
    const conf = league === "nfl" ? nflDivisionOf[c.team.abbreviation] : c.team.conferenceId;
    return { id: c.team.id, abbr: c.team.abbreviation, logo: c.team.logo, conf,
             color: "#" + (c.team.color || "555"), score: c.score, rank: c.curatedRank?.current,
             record: c.records?.find((r) => r.type === "total")?.summary };  // overall W-L, e.g. "4-1"
  };
  // At halftime ESPN keeps the last down and distance around; nobody has the ball, so drop the situation.
  const s = e.status.type.name === "STATUS_HALFTIME" ? {} : comp.situation || {};
  // ESPN often omits `possession` after kickoffs, scores and timeouts. When a down is in progress, the last
  // play's ending team is who has the ball, except for timeouts and period ends, where it's whoever called it.
  const lp = s.lastPlay;
  const possession = s.possession ??
    (s.downDistanceText && !/timeout|end period|end of/i.test(lp?.type?.text || "") ? lp?.end?.team?.id : undefined);
  return {
    key: `${league}:${e.id}`, date: new Date(e.date),
    state: e.status.type.state, detail: e.status.type.shortDetail,
    clock: e.status.displayClock, period: e.status.period,
    home: side("home"), away: side("away"),
    // ESPN's yardLine is yards from the home team's goal line.
    yardLine: s.yardLine, distance: s.distance, possession,
    ddText: s.downDistanceText, redZone: s.isRedZone,
    homeTO: s.homeTimeouts, awayTO: s.awayTimeouts, lastPlay: lp?.text,
    // Where to watch, e.g. "ABC" or "CBS / Paramount+".
    network: [...new Set((comp.broadcasts || []).flatMap((b) => b.names || []))].join(" / "),
  };
}
