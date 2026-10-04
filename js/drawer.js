// Showing and hiding the game picker. On desktop it's a side panel the header's ☰ button hides; on phones
// (css/mobile.css) it's a drawer that slides in from the left.

import { store } from "./store.js";
import { state } from "./state.js";

const $ = (id) => document.getElementById(id);
let pickerOpen;      // phone drawer
let panelCollapsed;  // desktop panel

function render() {
  document.querySelector("aside").classList.toggle("collapsed", !pickerOpen);
  $("picker-toggle").setAttribute("aria-expanded", pickerOpen);
}

export function setPicker(open) {
  pickerOpen = open;
  store.set("pickerOpen", pickerOpen);
  render();
}

function renderPanel() {
  document.body.classList.toggle("panel-collapsed", panelCollapsed);
  const label = panelCollapsed ? "Show game list" : "Hide game list";
  $("panel-toggle").setAttribute("aria-expanded", !panelCollapsed);
  $("panel-toggle").setAttribute("aria-label", label);
  $("panel-toggle").title = label;
}

export function initDrawer() {
  panelCollapsed = store.get("panelCollapsed", false);
  $("panel-toggle").addEventListener("click", () => {
    panelCollapsed = !panelCollapsed;
    store.set("panelCollapsed", panelCollapsed);
    renderPanel();
  });
  renderPanel();

  pickerOpen = store.get("pickerOpen", state.selected.size === 0);  // start open if nothing is picked yet
  $("picker-toggle").addEventListener("click", () => setPicker(!pickerOpen));
  $("picker-close").addEventListener("click", () => setPicker(false));
  $("picker-done").addEventListener("click", () => setPicker(false));
  $("picker-backdrop").addEventListener("click", () => setPicker(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pickerOpen) setPicker(false); });
  render();
  // Skip the slide on first paint; only animate taps.
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector("aside").classList.remove("preload")));
}
