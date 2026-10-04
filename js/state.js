// State shared by the picker and the board. Viewer preferences are restored from localStorage.

import { store } from "./store.js";

export const state = {
  games: { nfl: [], cfb: [] },                             // latest parsed games per league
  selected: new Set(store.get("selected", [])),            // picked game keys, "league:eventId"
  tab: store.get("tab", "all"),                            // picker tab: all, cfb or nfl
  filters: store.get("filters", { conf: "", top25: false }),  // College tab only
  collapsedGroups: new Set(store.get("collapsedGroups", [])), // picker sections the viewer has minimized
  boardView: store.get("boardView", "all"),                // board switch: all, cfb or nfl
  demoRemoved: new Set(),                                  // demo cards aren't in `selected`; removing one lasts until reload
};

export function saveSelected() {
  store.set("selected", [...state.selected]);
}

export const allGames = () => [...state.games.cfb, ...state.games.nfl];
