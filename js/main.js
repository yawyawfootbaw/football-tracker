// Entry point: wires the modules together and polls ESPN.

import { ADMIN_PARAM, LINKED_GAMES, LOADING, MOBILE_QUERY, POLL_MS } from "./config.js";
import { state, allGames } from "./state.js";
import { fetchGames } from "./espn.js";
import { checkRecaps } from "./recap.js";
import { renderList, listIsStale, initPicker } from "./picker.js";
import { renderBoard, highlightCard, initBoard, animateBoardLayout } from "./board.js";
import { setPicker, initDrawer } from "./drawer.js";
import { initSettings } from "./settings.js";
import { initTheme } from "./theme.js";
import { countVisit } from "./counter.js";
import { loadAdmin } from "./admin.js";
import { initLogo } from "./logo.js";
import { DEMO_KEYS, demoGames, startDemo } from "./demo.js";

let lastUpdated = null;
let demo = false;  // the demo games (js/demo.js) are in, for an admin who opened the page with ?admin
let linkPending = LINKED_GAMES.length > 0;  // a shared game link's card still needs its highlight once it first shows  // when data last arrived successfully; a failed poll leaves the old time showing

async function poll() {
  if (LOADING) return;
  await Promise.all(Object.keys(state.games).map(async (league) => {
    try {
      state.games[league] = await fetchGames(league);
      if (demo && league === "cfb") state.games.cfb.push(...demoGames());
      lastUpdated = Date.now();
    } catch (err) {
      console.error(league, err);
    }
  }));
  renderUpdated();
  // First load renders right away; after that the list waits out LIST_REFRESH_MS so it doesn't shift under your finger.
  if (listIsStale()) renderList();
  renderBoard();
  const linked = linkPending && LINKED_GAMES.find((k) => document.querySelector(`.card[data-key="${k}"]`));
  if (linked) { linkPending = false; highlightCard(linked); }
  if (await checkRecaps(allGames().filter((g) => state.selected.has(g.key)))) renderBoard();
}

function renderUpdated() {
  if (lastUpdated === null) return;
  // No locale or timeZone passed, so the browser formats it in the viewer's own time zone.
  document.getElementById("updated").textContent =
    "Games updated at " + new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}


initPicker({
  onSelectionChanged: renderBoard,  // the picker already re-rendered (and animated) its own list
  onHighlight: (key) => {
    if (matchMedia(MOBILE_QUERY).matches) setPicker(false);  // close the drawer so the card is visible
    highlightCard(key);
  },
});
initBoard({
  onSelectionChanged: () => { renderList(); renderBoard(); },  // a card's ✕ unpicks, so uncheck its row too
});
initDrawer({ animateLayout: animateBoardLayout });
initSettings();
initLogo();
initTheme({ onChange: () => { renderList(); renderBoard(); } });  // logos differ per theme

// Poll now and every POLL_MS after. Background tabs get their timers slowed down by the browser, so coming
// back to the tab fetches right away and restarts the timer from there.
let pollTimer;
function pollNow() {
  poll();
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_MS);
}
pollNow();
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollNow(); });

// The page loads behind the admin login; once the admin's features arrive, redraw the cards with them.
const isAdmin = await loadAdmin();
if (isAdmin && ADMIN_PARAM !== null) {
  demo = true;
  startDemo();
  DEMO_KEYS.forEach((k) => state.selected.add(k));  // not saved, so they're gone once you leave ?admin
  await poll();  // fetch again now, with the demo games in
  renderList();  // the list otherwise waits out LIST_REFRESH_MS before showing them
} else if (isAdmin && lastUpdated !== null) { renderList(); renderBoard(); }
if (!LOADING && !isAdmin) countVisit();
