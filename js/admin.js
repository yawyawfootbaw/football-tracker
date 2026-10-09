// Admin login. The admin's features (share buttons, "Save as image") aren't in the public code: the Worker at
// ADMIN_URL (worker/) hands them out only to the admin password. ?admin asks for the password and remembers it in
// this browser; ?admin=off forgets it. Either way the parameter then leaves the address bar.

import { ADMIN_PARAM, ADMIN_URL } from "./config.js";
import { store } from "./store.js";
import { allGames } from "./state.js";
import { renderBoard, setAdmin } from "./board.js";
import { currentTheme } from "./theme.js";

/** Load the admin's features if this browser has the password. Resolves true when they're on. */
export async function loadAdmin() {
  if (ADMIN_PARAM !== null) {
    const url = new URL(location.href);
    url.searchParams.delete("admin");
    history.replaceState(null, "", url);
  }
  if (ADMIN_PARAM === "off") store.set("adminKey", null);
  else if (ADMIN_PARAM !== null) {
    for (let error = ""; ;) {
      const key = await askPassword(error);
      if (!key) break;  // cancelled: carry on with whatever was saved before
      const code = await fetchAdmin(key);
      if (code === 401) { error = "Wrong password"; continue; }
      store.set("adminKey", key);
      return install(code);
    }
  }
  const key = store.get("adminKey");
  if (!key) return false;
  const code = await fetchAdmin(key);
  if (code === 401) store.set("adminKey", null);  // the password has changed since; log in again with ?admin
  return install(code);
}

// The admin module's source, 401 for a wrong password, or null when the Worker can't be reached.
async function fetchAdmin(key) {
  try {
    const res = await fetch(ADMIN_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return 401;
    return res.ok ? await res.text() : null;
  } catch (err) {
    console.error("admin", err);  // carry on as a regular visitor
    return null;
  }
}

async function install(code) {
  if (typeof code !== "string") return false;
  const blob = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    const { install } = await import(blob);
    setAdmin(install({ renderBoard, allGames, currentTheme }));
    return true;
  } catch (err) {
    console.error("admin", err);
    return false;
  } finally {
    URL.revokeObjectURL(blob);
  }
}

// A small modal with a masked password field (the hidden username lets password managers save it).
// Resolves with what was typed, or null if cancelled.
function askPassword(error) {
  const dialog = document.createElement("dialog");
  dialog.id = "admin-login";
  dialog.innerHTML = `<form method="dialog">
    <label for="admin-password">Admin password</label>
    <input type="text" name="username" value="admin" autocomplete="username" hidden>
    <input type="password" id="admin-password" autocomplete="current-password" required>
    <p class="error" role="alert">${error}</p>
    <div class="buttons"><button type="button" value="cancel">Cancel</button><button value="ok">Log in</button></div>
  </form>`;
  document.body.append(dialog);
  const input = dialog.querySelector("input[type=password]");
  dialog.querySelector('[value="cancel"]').addEventListener("click", () => dialog.close("cancel"));
  dialog.showModal();
  input.focus();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue === "ok" ? input.value : null);  // Escape closes with returnValue ""
    });
  });
}
