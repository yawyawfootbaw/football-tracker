// Sync devices: one link keeps the picked games and lit bells the same on every device that opened it. The gear menu's
// "Sync devices" makes the link (a random id, shared/constants/sync.js) or takes one pasted from another device (the
// iPhone Home Screen app has no address bar, and doesn't share Safari's storage). Opening ?sync=<id> joins too, then
// drops the param from the address bar. Joining merges this device's picks and bells into the link's; after that, the
// last device to change wins.
//
// The link's copy is on the server (GET/PUT /api/sync/<id>, worker/handler.js, kept by the program:
// worker/scorekeeper-object.js). Each change here is sent a moment later (a burst, such as Select all, goes as one);
// the server's copy is read when the page opens, when it comes back into view, and every SYNC_MS while it's showing.
// Anyone with the link can see and change its picks, so the dialog says to treat it like a password.
//
// While it's being tried out, the menu item shows only with ?sync-devices in the address, or on a device already
// syncing (so it can stop). ?sync=<id> links work either way.

import { ADMIN_URL, LINKED_GAMES, SYNC_MENU, SYNC_PARAM } from "./config.js";
import { store } from "./store.js";
import { state, onSelectionSaved } from "./state.js";
import { onBellsSaved, applyBells } from "./notify.js";
import { SYNC_ID } from "../shared/constants/sync.js";

const SYNC_MS = 30_000;
const SEND_DELAY_MS = 1000;

let redraw = () => {};
let syncId = null;     // this device's link, or null when it isn't syncing
let version = null;    // the server's version this device last matched
let edits = 0;         // local changes not yet saved on the server
let sendTimer = null;
let menuItem;

const linkFor = (id) => `${location.origin}${location.pathname}?sync=${id}`;
const mine = () => ({ selected: [...state.selected], bells: store.get("notifyGames", []) });

// { status, body }, or null if the server can't be reached.
async function request(method, body, keepalive = false) {
  const id = syncId;
  try {
    const res = await fetch(`${ADMIN_URL}/sync/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body), keepalive });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch (err) {
    console.error("sync", err);
    return null;
  }
}

function changed() {
  if (!syncId) return;
  edits++;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(send, SEND_DELAY_MS);
}

// Save this device's picks and bells as the link's. Resolves the response's status (0 if unreachable).
async function send() {
  clearTimeout(sendTimer);
  sendTimer = null;
  if (!syncId) return 0;
  const sent = edits;
  const res = await request("PUT", mine());
  if (!res?.body) {
    if (res?.status !== 503) sendTimer = setTimeout(send, SYNC_MS);  // unreachable: try again later
    return res?.status ?? 0;
  }
  version = res.body.version;
  if (edits === sent) edits = 0;
  return 200;
}

/**
 * Take the link's picks and bells, unless this device has changes on the way (those win, and go out shortly). merge:
 * keep this device's too (joining a link); otherwise only a ?game= link opened here is added on top (js/state.js).
 */
async function fetchSaved({ merge = false, linked = [] } = {}) {
  if (!syncId || edits) return;
  const res = await request("GET");
  const saved = res?.body;
  if (!saved || edits) return;
  if (saved.version === 0) { changed(); return; }  // nothing saved yet: this device's picks start it off
  const { selected, bells } = mine();
  const extraPicks = (merge ? selected : linked).filter((k) => !saved.selected.includes(k));
  const extraBells = merge ? bells.filter((k) => !saved.bells.includes(k)) : [];
  if (saved.version === version && !extraPicks.length && !extraBells.length) return;
  version = saved.version;
  state.selected.clear();
  [...saved.selected, ...extraPicks].forEach((k) => state.selected.add(k));
  store.set("selected", [...state.selected]);
  await applyBells([...saved.bells, ...extraBells].filter((k) => state.selected.has(k)));
  redraw();
  if (extraPicks.length || extraBells.length) changed();
}

function setSyncId(id) {
  syncId = id;
  version = null;
  edits = 0;
  store.set("syncId", id);
  menuItem?.setAttribute("aria-pressed", !!id);
}

/** Join a link from another device: its picks and bells, plus this device's. */
function join(id) {
  setSyncId(id);
  return fetchSaved({ merge: true });
}

/** A new link, starting from this device's picks and bells. Resolves the server's status (503: no room). */
async function create() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  setSyncId(btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  const status = await send();
  if (status === 503) setSyncId(null);
  return status;
}

// The id in a pasted link (or a bare id), or null.
function idIn(text) {
  const t = text.trim();
  if (SYNC_ID.test(t)) return t;
  try {
    const id = new URL(t).searchParams.get("sync");
    return id && SYNC_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// The gear menu's dialog: make a link or paste one when not syncing; the link, Copy and Stop syncing when syncing.
function openDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "sync-devices";
  let error = "";
  const render = () => {
    dialog.innerHTML = syncId ? `<form method="dialog">
      <label>Sync devices</label>
      <p class="note">Open this link on your other devices to see the same games and bells. In the iPhone Home Screen app, paste it into Sync devices there. Anyone with the link can see and change your games, so share it only with yourself.</p>
      <div class="link-row"><input type="text" readonly value="${linkFor(syncId)}" aria-label="Sync link"><button type="button" data-act="copy">Copy</button></div>
      <div class="buttons"><button type="button" data-act="stop">Stop syncing</button><button value="ok" autofocus>Done</button></div>
    </form>` : `<form method="dialog">
      <label>Sync devices</label>
      <p class="note">Keep your games and bells the same on your phone, computer and tablet.</p>
      <div class="buttons start"><button type="button" value="ok" data-act="create">Make a sync link</button></div>
      <p class="note or">Already syncing another device? Paste its link:</p>
      <div class="link-row"><input type="text" placeholder="Sync link" aria-label="Sync link from another device" autocomplete="off"><button type="button" data-act="join">Join</button></div>
      <p class="error" role="alert">${error}</p>
      <div class="buttons"><button value="cancel">Close</button></div>
    </form>`;
  };
  render();
  dialog.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "create") {
      const status = await create();
      error = status === 503 ? "Sync is full right now. Try again later." : status === 0 ? "Couldn't reach the Game Tracker server. Try again in a moment." : "";
      if (status === 0) setSyncId(null);
    } else if (act === "join") {
      const id = idIn(dialog.querySelector(".link-row input").value);
      error = id ? "" : "That isn't a sync link.";
      if (id) await join(id);
    } else if (act === "copy") {
      const input = dialog.querySelector(".link-row input");
      await navigator.clipboard?.writeText(input.value).catch(() => { input.select(); });
      e.target.textContent = "Copied";
      return;
    } else if (act === "stop") {
      setSyncId(null);  // this device keeps its games; the others carry on syncing
    }
    render();
  });
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

/** @param {{ redraw: () => void }} hooks  redraw: the board and the game list */
export function initSync(hooks) {
  redraw = hooks.redraw;
  onSelectionSaved(changed);
  onBellsSaved(changed);

  const saved = store.get("syncId");
  const syncing = SYNC_ID.test(saved ?? "");
  if (SYNC_MENU || syncing || (SYNC_PARAM && SYNC_ID.test(SYNC_PARAM))) {
    menuItem = document.createElement("button");
    menuItem.id = "sync-devices-item";
    menuItem.innerHTML = `<span class="check">✓</span>Sync devices`;
    menuItem.addEventListener("click", openDialog);
    document.getElementById("save-board").after(menuItem);
  }
  setSyncId(syncing ? saved : null);
  if (SYNC_PARAM) {
    const url = new URL(location.href);
    url.searchParams.delete("sync");
    history.replaceState(null, "", url);
  }
  if (SYNC_PARAM && SYNC_ID.test(SYNC_PARAM) && SYNC_PARAM !== syncId) join(SYNC_PARAM);
  else fetchSaved({ linked: LINKED_GAMES });

  setInterval(() => { if (!document.hidden) fetchSaved(); }, SYNC_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fetchSaved();
    else if (sendTimer && edits) {  // leaving (or switching apps) with a change waiting: send it now
      clearTimeout(sendTimer);
      sendTimer = null;
      request("PUT", mine(), true);
      edits = 0;
    }
  });
}
