// Small HTML helpers shared by the picker rows and the board cards.

import { currentTheme } from "./theme.js";

// ESPN's regular logos are made for light backgrounds. In dark mode use its dark-background variant, which lives
// at the same path under 500-dark, falling back to the regular logo if it's missing.
export function logoImg(t) {
  if (currentTheme() === "light") return `<img src="${t.logo}" alt="">`;
  return `<img src="${t.logo?.replace("/500/", "/500-dark/")}" alt="" onerror="this.onerror=null; this.src='${t.logo}'">`;
}

/** The better AP rank of a game's two teams, or 99 when neither is in the Top 25 (so unranked games sort last). */
export const bestRank = (g) => Math.min(...[g.away, g.home].map((t) => (t.rank && t.rank <= 25 ? t.rank : 99)));

export const rankBadge = (t) => (t.rank && t.rank <= 25 ? `<span class="rank">${t.rank}</span>` : "");

// Kickoff times show in the viewer's own time zone. The admin's image exports switch this to Eastern for the moment
// they capture the board (worker/admin.js).
let timeZone;  // undefined: the viewer's
export function setTimeZone(zone) {
  timeZone = zone;
}

// Always two lines so the status block is the same height in every state.
export function statusLines(g) {
  if (g.state === "in") return g.detail === "Halftime" ? "Half<br>&nbsp;" : `${g.clock}<br>${periodName(g)}`;
  if (g.state === "pre") return `${g.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone })}<br>${g.date.toLocaleDateString([], { weekday: "short", timeZone })}`;
  return `${g.detail}<br>&nbsp;`;
}

function periodName(g) {
  return g.period <= 4 ? ["1st", "2nd", "3rd", "4th"][g.period - 1] : g.period === 5 ? "OT" : `${g.period - 4}OT`;
}

export function escapeAttr(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
