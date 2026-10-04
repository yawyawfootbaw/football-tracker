// State shared by the picker and the board. Viewer preferences are restored from localStorage.

import { store } from "./store.js";
import { LEAGUE_PARAM } from "./config.js";

export const state = {
  games: { nfl: [], cfb: [] },                             // latest parsed games per league
  selected: new Set(store.get("selected", [])),            // picked game keys, "league:eventId"
  // Picker tab: cfb or nfl. Anything else saved (e.g. an old "all") falls back to College.
  tab: ["cfb", "nfl"].includes(store.get("tab")) ? store.get("tab") : "cfb",
  filters: store.get("filters", { conf: "", top25: false }),  // College tab only
  collapsedGroups: new Set(store.get("collapsedGroups", [])), // picker sections the viewer has minimized
  boardView: store.get("boardView", "all"),                // board switch: all, cfb or nfl
};

// A ?league= link overrides the saved picker tab and board view, and becomes the new saved choice.
if (LEAGUE_PARAM) {
  state.tab = state.boardView = LEAGUE_PARAM;
  store.set("tab", LEAGUE_PARAM);
  store.set("boardView", LEAGUE_PARAM);
}

export function saveSelected() {
  store.set("selected", [...state.selected]);
}

export const allGames = () => [...state.games.cfb, ...state.games.nfl];
