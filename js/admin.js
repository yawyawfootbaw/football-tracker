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
    if (ADMIN_PARAM === "off") store.set("adminKey", null);
    else {
      const key = prompt("Admin password:");
      if (key) store.set("adminKey", key);
    }
    const url = new URL(location.href);
    url.searchParams.delete("admin");
    history.replaceState(null, "", url);
  }
  const key = store.get("adminKey");
  if (!key) return false;
  try {
    const res = await fetch(ADMIN_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) {
      store.set("adminKey", null);
      alert("Wrong admin password.");
      return false;
    }
    if (!res.ok) return false;
    const blob = URL.createObjectURL(new Blob([await res.text()], { type: "text/javascript" }));
    const { install } = await import(blob);
    URL.revokeObjectURL(blob);
    setAdmin(install({ renderBoard, allGames, currentTheme }));
    return true;
  } catch (err) {
    console.error("admin", err);  // the Worker is unreachable: carry on as a regular visitor
    return false;
  }
}
