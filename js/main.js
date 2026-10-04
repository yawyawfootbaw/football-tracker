// Entry point: wires the modules together and polls ESPN.

import { DEMO, MOBILE_QUERY, POLL_MS } from "./config.js";
import { state } from "./state.js";
import { fetchGames } from "./espn.js";
import { renderList, listIsStale, initPicker } from "./picker.js";
import { renderBoard, highlightCard, initBoard, animateBoardLayout } from "./board.js";
import { setPicker, initDrawer } from "./drawer.js";
import { initSettings } from "./settings.js";
import { initTheme } from "./theme.js";
import { countVisit } from "./counter.js";

let lastUpdated = null;  // when data last arrived successfully; a failed poll leaves the old time showing

async function poll() {
  await Promise.all(Object.keys(state.games).map(async (league) => {
    try {
      state.games[league] = await fetchGames(league);
      lastUpdated = Date.now();
    } catch (err) {
      console.error(league, err);
    }
  }));
  renderUpdated();
  // First load renders right away; after that the list waits out LIST_REFRESH_MS so it doesn't shift under your finger.
  if (listIsStale()) renderList();
  renderBoard();
}

function renderUpdated() {
  if (lastUpdated === null) return;
  // No locale or timeZone passed, so the browser formats it in the viewer's own time zone.
  document.getElementById("updated").textContent =
    "Games updated at " + new Date(lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

if (!DEMO) countVisit();

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
