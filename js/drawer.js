// Phones only (css/mobile.css): the game picker is a drawer that slides in from the left.

import { store } from "./store.js";
import { state } from "./state.js";

const $ = (id) => document.getElementById(id);
let pickerOpen;

function render() {
  document.querySelector("aside").classList.toggle("collapsed", !pickerOpen);
  $("picker-toggle").setAttribute("aria-expanded", pickerOpen);
}

export function setPicker(open) {
  pickerOpen = open;
  store.set("pickerOpen", pickerOpen);
  render();
}

export function initDrawer() {
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
