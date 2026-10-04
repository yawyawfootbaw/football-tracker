// The board: All / College / NFL switch and one card per picked game.

import { GLOW_MS, FLASH_MS } from "./config.js";
import { store } from "./store.js";
import { state, saveSelected, allGames } from "./state.js";
import { logoImg, rankBadge, statusLines, escapeAttr } from "./format.js";
import { field } from "./field.js";

const $ = (id) => document.getElementById(id);
const VIEWS = { all: "All", cfb: "College", nfl: "NFL" };

const redZoneShown = new Set();  // game keys currently drawn in the red zone
const glowStart = new Map();     // game key -> when its one-time glow began
let flash = null;                // { key, at }: the card most recently highlighted from the picker
let openPlay = null;             // game key whose full last-play text is showing; survives board refreshes

export function renderBoard() {
  const picked = allGames()
    .filter((g) => state.selected.has(g.key))
    .sort((a, b) => (a.state === "in" ? 0 : 1) - (b.state === "in" ? 0 : 1) || a.date - b.date);
  $("picker-count").textContent = picked.length ? `${picked.length} selected` : "";
  if (!picked.length) {
    // The picker sits on the left on desktop but hides behind the "☰ Games" bar on phones; CSS shows the matching hint.
    $("board").innerHTML = `<div class="empty">
      <span class="desktop-only">Pick a few games from the list on the left and they'll show up here.</span>
      <span class="mobile-only">Tap ☰ Games at the top to pick a few games, and they'll show up here.</span></div>`;
    return;
  }
  const inView = (view) => picked.filter((g) => view === "all" || g.key.startsWith(view + ":"));
  const bar = `<div class="board-bar">${Object.entries(VIEWS).map(([view, label]) =>
    `<button data-view="${view}" aria-pressed="${view === state.boardView}">${label}<span class="n">${inView(view).length}</span></button>`).join("")}</div>`;
  const shown = inView(state.boardView);
  $("board").innerHTML = bar + (shown.length
    ? shown.map(card).join("")
    : `<div class="empty">No ${VIEWS[state.boardView]} games selected.</div>`);
}

function card(g) {
  const live = g.state === "in";
  const inRedZone = live && g.redZone;
  if (inRedZone && !redZoneShown.has(g.key)) glowStart.set(g.key, Date.now());  // just entered the red zone
  inRedZone ? redZoneShown.add(g.key) : redZoneShown.delete(g.key);
  // The board re-renders every poll; a negative delay resumes a glow already in progress instead of restarting it.
  const glowAge = Date.now() - (glowStart.get(g.key) ?? -Infinity);
  const glowing = inRedZone && glowAge < GLOW_MS;
  // Same trick for the picker's "highlight this game" flash, which must survive a board refresh mid-animation.
  const flashAge = flash?.key === g.key ? Date.now() - flash.at : Infinity;
  const flashing = flashAge < FLASH_MS;
  return `<div class="card ${inRedZone ? "redzone" : ""} ${glowing ? "glow" : ""} ${flashing ? "flash" : ""}" data-key="${g.key}"
    style="${glowing ? `animation-delay: -${glowAge}ms;` : ""}${flashing ? `--flash-delay: -${flashAge}ms;` : ""}">
    <div class="score">${team(g, g.away, "away", g.awayTO)}<div class="clock">${statusLines(g)}</div>${team(g, g.home, "home", g.homeTO)}</div>
    <div class="dd">${live ? (g.ddText || "&nbsp;") : "&nbsp;"}</div>
    ${field(g)}
    <div class="card-foot">
      ${live && g.lastPlay
        ? `<div class="last" data-play="${g.key}" title="${escapeAttr(g.lastPlay)}">${g.lastPlay}</div>`
        : `<div class="last">&nbsp;</div>`}
      ${g.network ? `<span class="net" title="Broadcast on ${escapeAttr(g.network)}">${g.network}</span>` : ""}
      <button class="remove" data-remove="${g.key}" aria-label="Remove game" title="Remove game">✕</button>
    </div>
    ${live && g.lastPlay && openPlay === g.key ? `<div class="last-full" data-play="${g.key}">${g.lastPlay}</div>` : ""}
  </div>`;
}

// One side of the scoreboard row. Every slot is always rendered (hidden when empty) so cards line up.
function team(g, t, side, timeouts) {
  const live = g.state === "in";
  const pts = `<span class="pts">${g.state === "pre" ? "" : t.score}</span>`;
  const showTO = live && timeouts != null;
  const name = `<div class="name">
      <div>${rankBadge(t)}<span class="abbr">${t.abbr}</span> <span class="poss ${live && g.possession === t.id ? "" : "hide"}">●</span></div>
      <div class="to ${showTO ? "" : "hide"}">${showTO ? "▮".repeat(timeouts) + "▯".repeat(Math.max(0, 3 - timeouts)) : "▮▮▮"}</div>
    </div>`;
  const logo = logoImg(t);
  // Mirrored: logo on the outside edge, points next to the clock.
  return `<div class="team ${side}">${side === "away" ? logo + name + pts : pts + name + logo}</div>`;
}

/** Scroll to a game's card and flash it. */
export function highlightCard(key) {
  flash = { key, at: Date.now() };
  renderBoard();
  document.querySelector(`.card[data-key="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** @param {{ onSelectionChanged: () => void }} hooks  called after a card's ✕ unpicks a game */
export function initBoard({ onSelectionChanged }) {
  // Replay the red-zone glow when you come back to this tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    for (const key of redZoneShown) glowStart.set(key, Date.now());
    renderBoard();
  });

  // Clicking the truncated last play opens the full text over the card; clicking it (or anywhere else) closes it.
  document.addEventListener("click", (e) => {
    const play = e.target.closest("[data-play]")?.dataset.play ?? null;
    const next = play && play !== openPlay ? play : null;
    if (next === openPlay) return;
    openPlay = next;
    renderBoard();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openPlay) { openPlay = null; renderBoard(); } });

  $("board").addEventListener("click", (e) => {
    const view = e.target.closest("[data-view]")?.dataset.view;
    if (view) {
      state.boardView = view;
      store.set("boardView", view);
      renderBoard();
      return;
    }
    const key = e.target.closest("[data-remove]")?.dataset.remove;
    if (!key) return;
    state.selected.delete(key);
    saveSelected();
    onSelectionChanged();
  });
}
