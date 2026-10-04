// The game picker: tabs, search, College filters, collapsible sections and score-bug rows.

import { LIST_REFRESH_MS } from "./config.js";
import { store } from "./store.js";
import { state, saveSelected } from "./state.js";
import { confNames } from "./espn.js";
import { logoImg, rankBadge, statusLines } from "./format.js";

const $ = (id) => document.getElementById(id);
const ORDER = { in: 0, pre: 1, post: 2 };
const GROUPS = { in: "Live", pre: "Upcoming", post: "Final" };
const CHEVRON = `<svg class="chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;

let lastListRender = -Infinity;
let filtersOpen = false;

/** True once the list has gone LIST_REFRESH_MS without a render (polls refresh it no more often than that). */
export const listIsStale = () => Date.now() - lastListRender >= LIST_REFRESH_MS;

export function renderList() {
  lastListRender = Date.now();
  const { tab, filters, selected, games } = state;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.league === tab));
  const query = $("search").value.trim().toLowerCase();
  const college = tab === "cfb";
  renderFilters(college);
  const ranked = (t) => t.rank && t.rank <= 25;
  const list = (tab === "all" ? [...games.cfb, ...games.nfl] : games[tab])
    // Match from the start of a word, so "nd" finds ND and NDSU but not Maryland.
    .filter((g) => !query || g.away.searchText.includes(" " + query) || g.home.searchText.includes(" " + query))
    .filter((g) => !college || !filters.conf || g.away.conf === filters.conf || g.home.conf === filters.conf)
    .filter((g) => !college || !filters.top25 || ranked(g.away) || ranked(g.home))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.date - b.date);
  // Selected games go first under their own heading, keeping the same order as the full list.
  const ordered = [...list.filter((g) => selected.has(g.key)), ...list.filter((g) => !selected.has(g.key))];
  const groupOf = (g) => (selected.has(g.key) ? "Selected" : GROUPS[g.state]);
  const counts = {};
  for (const g of ordered) counts[groupOf(g)] = (counts[groupOf(g)] || 0) + 1;

  let html = "", lastGroup;
  for (const g of ordered) {
    const group = groupOf(g);
    if (group !== lastGroup) {
      if (lastGroup) html += `</div></div>`;
      const open = !state.collapsedGroups.has(group);
      html += `<button class="group-label ${group.toLowerCase()}" data-group="${group}" aria-expanded="${open}">${group}<span class="n">${counts[group]}</span>${CHEVRON}</button>
        <div class="group-body ${open ? "" : "collapsed"}"><div class="group-clip">`;
    }
    lastGroup = group;
    html += row(g);
  }
  if (lastGroup) html += `</div></div>`;
  const filtered = query || (college && (filters.conf || filters.top25));
  $("list").innerHTML = html || `<div class="empty">${filtered ? "No matching games." : "No games this week."}</div>`;
}

// One picker row, styled like a TV score bug: two stacked team lines, then the game status.
function row(g) {
  const final = g.state === "post", live = g.state === "in";
  const line = (t, other) => `<span class="bug-team ${final && +t.score < +other.score ? "lost" : ""}">
      ${logoImg(t)}${rankBadge(t)}<span class="abbr">${t.abbr}</span>
      ${live && g.possession === t.id ? `<span class="poss">●</span>` : ""}
      <span class="pts">${g.state === "pre" ? "" : t.score}</span></span>`;
  const league = state.tab === "all" ? `<span class="lg">${g.key.startsWith("nfl:") ? "NFL" : "CFB"}</span>` : "";
  return `<label class="game ${live ? "live" : ""}"><input type="checkbox" data-key="${g.key}" ${state.selected.has(g.key) ? "checked" : ""}>
    <span class="bug">${line(g.away, g.home)}${line(g.home, g.away)}</span>
    <span class="bug-status">${statusLines(g)}${league}</span><span class="pick" aria-hidden="true"></span></label>`;
}

function renderFilters(show) {
  const { filters } = state;
  const panel = $("filters"), toggle = $("filter-toggle");
  panel.hidden = toggle.hidden = !show;
  if (!show) return;
  panel.classList.toggle("open", filtersOpen);
  toggle.setAttribute("aria-expanded", filtersOpen);
  toggle.classList.toggle("has-filters", !!(filters.conf || filters.top25));  // dot so active filters aren't forgotten
  // Offer every named conference with a team playing this week.
  const ids = new Set(state.games.cfb.flatMap((g) => [g.away.conf, g.home.conf]).filter((id) => confNames[id]));
  if (filters.conf) ids.add(filters.conf);  // keep a saved choice listed even before its name is learned
  const options = [...ids].sort((a, b) => (confNames[a] || "").localeCompare(confNames[b] || ""))
    .map((id) => `<option value="${id}">${confNames[id] || "Conference " + id}</option>`).join("");
  const select = $("conf");
  // Only rebuild when the set changes, so a refresh doesn't close the dropdown while it's open.
  if (select.dataset.options !== options) {
    select.innerHTML = `<option value="">All conferences</option>` + options;
    select.dataset.options = options;
  }
  select.value = filters.conf;
  select.classList.toggle("active", !!filters.conf);
  $("conf-clear").hidden = !filters.conf;
  $("top25").setAttribute("aria-pressed", filters.top25);
}

// FLIP animation: note where each row was, re-render, then slide every row from its old spot to its new one.
function renderListAnimated(movedKey) {
  const rowsByKey = () => new Map([...document.querySelectorAll("#list label.game")]
    .map((el) => [el.querySelector("input").dataset.key, el]));
  const before = new Map([...rowsByKey()].map(([key, el]) => [key, el.getBoundingClientRect().top]));
  renderList();
  for (const [key, el] of rowsByKey()) {
    const dy = before.has(key) ? before.get(key) - el.getBoundingClientRect().top : 0;
    if (!dy) continue;
    el.style.transform = `translateY(${dy}px)`;
    if (key === movedKey) {  // the moved row passes over the others, so give it a solid background
      el.style.zIndex = 1;
      el.style.background = "var(--panel)";
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = "transform .35s ease";
      el.style.transform = "";
      el.addEventListener("transitionend", () => { el.style.transition = el.style.zIndex = el.style.background = ""; }, { once: true });
    }));
  }
}

/**
 * @param {object} hooks
 * @param {() => void} hooks.onSelectionChanged  a game was picked or unpicked
 * @param {(key: string) => void} hooks.onHighlight  an already-picked row was clicked
 */
export function initPicker({ onSelectionChanged, onHighlight }) {
  const saveFiltersAndRender = () => { store.set("filters", state.filters); renderList(); };

  $("search").addEventListener("input", renderList);
  $("conf").addEventListener("change", (e) => { state.filters.conf = e.target.value; saveFiltersAndRender(); });
  $("conf-clear").addEventListener("click", () => { state.filters.conf = ""; saveFiltersAndRender(); });
  $("top25").addEventListener("click", () => { state.filters.top25 = !state.filters.top25; saveFiltersAndRender(); });
  $("filter-toggle").addEventListener("click", () => { filtersOpen = !filtersOpen; renderFilters(true); });

  document.querySelector(".tabs").addEventListener("click", (e) => {
    const league = e.target.dataset?.league;
    if (!league) return;
    state.tab = league;
    store.set("tab", league);
    renderList();
  });

  // Section headers minimize their section. Toggle the existing element (no re-render) so the slide animates.
  $("list").addEventListener("click", (e) => {
    const header = e.target.closest(".group-label");
    if (!header) return;
    const group = header.dataset.group, open = state.collapsedGroups.has(group);
    open ? state.collapsedGroups.delete(group) : state.collapsedGroups.add(group);
    store.set("collapsedGroups", [...state.collapsedGroups]);
    header.setAttribute("aria-expanded", open);
    header.nextElementSibling.classList.toggle("collapsed", !open);
  });

  // Clicking an already-selected row highlights its card instead of unselecting it; only the ✓ circle unselects.
  $("list").addEventListener("click", (e) => {
    const input = e.target.closest("label.game")?.querySelector("input");
    // A label click also fires a second click on its checkbox, already toggled; that one must pass through untouched.
    if (e.target === input || !input?.checked || e.target.closest(".pick")) return;
    e.preventDefault();  // stop the label from toggling the checkbox
    onHighlight(input.dataset.key);
  });

  $("list").addEventListener("change", (e) => {
    const key = e.target.dataset.key;
    e.target.checked ? state.selected.add(key) : state.selected.delete(key);
    saveSelected();
    renderListAnimated(key);  // slide it into or out of the Selected group
    onSelectionChanged();
  });
}
