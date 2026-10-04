// State shared by the picker and the board. Viewer preferences are restored from localStorage.

import { store } from "./store.js";
import { LEAGUE_PARAM } from "./config.js";

export const state = {
  games: { nfl: [], cfb: [] },                             // latest parsed games per league
  selected: new Set(store.get("selected", [])),            // picked game keys, "league:eventId"
  // Picker tab: cfb or nfl. Anything else saved (e.g. an old "all") falls back to College.
  tab: ["cfb", "nfl"].includes(store.get("tab")) ? store.get("tab") : "cfb",
  filters: loadFilters(),                                  // per league: { cfb: { conf, top25 }, nfl: { conf } }
  collapsedGroups: new Set(store.get("collapsedGroups", [])), // picker sections the viewer has minimized
};

// A ?league= link overrides the saved picker tab and becomes the new saved choice.
if (LEAGUE_PARAM) {
  state.tab = LEAGUE_PARAM;
  store.set("tab", LEAGUE_PARAM);
}

// Filters used to be college-only ({ conf, top25 }); carry an old saved value over to the college slot.
function loadFilters() {
  const saved = store.get("filters", {});
  const old = "conf" in saved || "top25" in saved;
  return {
    cfb: { conf: "", top25: false, ...(old ? saved : saved.cfb) },
    nfl: { conf: "", ...saved.nfl },
  };
}

export function saveSelected() {
  store.set("selected", [...state.selected]);
}

export const allGames = () => [...state.games.cfb, ...state.games.nfl];
