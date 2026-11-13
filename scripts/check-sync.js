// Checks Sync devices end to end against the real Worker running locally: one browser makes a sync link with a game
// picked, a second (its own storage, like another device) opens the link and gets that game, then a change on the
// second reaches the first.
//
// Usage: run `npx wrangler dev --port 8788 --persist-to /tmp/wrangler-state` (needs ADMIN_PASSWORD in .dev.vars, or
// the API answers 401), then:
//   node scripts/check-sync.js [screenshot-dir]
// Prints each step's result. With a directory, saves the dialog in both states there.

const { chromium } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const CORS = { "Access-Control-Allow-Origin": "*" };

const SITE = "http://localhost:8788";
const shots = process.argv[2];

const picks = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("selected") ?? "[]").sort());

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let failed = false;
  const check = (what, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed = true; };
  try {
    const open = async () => {
      const page = await (await browser.newContext()).newPage();
      page.on("pageerror", (e) => { console.error("page error:", e.message); failed = true; });
      await page.route("https://hits.sh/**", (route) => route.abort());
      // The tests' games in place of ESPN (which refuses localhost:8788).
      await page.route("https://site.api.espn.com/**", (route) => {
        const url = route.request().url();
        if (url.includes("/summary")) return route.fulfill({ json: {}, headers: CORS });
        route.fulfill({ json: scoreboard(url.includes("college-football") ? cfbGames() : nflGames()), headers: CORS });
      });
      return page;
    };
    const a = await open();
    await a.goto(SITE);
    await a.waitForSelector("#list input[type=checkbox]", { state: "attached", timeout: 20000 });
    const keys = await a.$$eval("#list input[data-key]", (els) => [...new Set(els.map((e) => e.dataset.key))].slice(0, 3));
    await a.evaluate((k) => { localStorage.setItem("selected", JSON.stringify([k])); }, keys[0]);
    await a.reload();
    await a.waitForTimeout(1500);
    await a.click("#settings");
    await a.click("#sync-devices-item");
    await a.click('[data-act="create"]');
    await a.waitForSelector('#sync-devices [data-act="stop"]');
    const link = await a.inputValue("#sync-devices .link-row input");
    check(`link made: ${link}`, /\?sync=[A-Za-z0-9_-]{22}$/.test(link));
    if (shots) await a.locator("#sync-devices").screenshot({ path: `${shots}/sync-on.png` });

    const b = await open();
    await b.goto(SITE);
    await b.evaluate((k) => { localStorage.setItem("selected", JSON.stringify([k])); }, keys[1]);
    await b.goto(link.replace(/^https?:\/\/[^/]+/, SITE));
    await b.waitForTimeout(2500);
    check("joining keeps both devices' games", JSON.stringify(await picks(b)) === JSON.stringify([keys[0], keys[1]].sort()));
    check("the link leaves the address bar", !b.url().includes("sync="));

    await b.evaluate((k) => { localStorage.setItem("selected", JSON.stringify([k])); }, keys[2]);
    await b.reload();  // the saved picks load; no change is sent for them, so the server's copy wins
    await b.waitForTimeout(2500);
    check("a reload takes the link's games", JSON.stringify(await picks(b)) === JSON.stringify([keys[0], keys[1]].sort()));

    // A change made through the page on B reaches A when A comes back into view.
    await b.evaluate(() => document.querySelector(".card .remove, .card [data-remove]")?.click());
    await b.waitForTimeout(2500);
    const bNow = await picks(b);
    await a.keyboard.press("Escape");
    await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await a.waitForTimeout(2500);
    check(`a change on one device reaches the other (${bNow.length} games)`, JSON.stringify(await picks(a)) === JSON.stringify(bNow));

    if (shots) {
      const c = await open();
      await c.goto(SITE);
      await c.waitForTimeout(1000);
      await c.click("#settings");
      await c.click("#sync-devices-item");
      await c.locator("#sync-devices").screenshot({ path: `${shots}/sync-off.png` });
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
