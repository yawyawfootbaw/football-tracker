// Renders the admin's image exports from the test fixtures, so a change to how they look can be checked by eye:
// the Upcoming list (upcoming.png), the Live and Final sections (live.png, final.png) and the whole board (board.png).
//
// Usage: start the local server (npm start), then run: node scripts/preview-images.js [out-dir] [dark|light]
// out-dir defaults to ./previews (git-ignored). The admin code (worker/admin.js) is served straight from the repo,
// standing in for the Worker's /api/, and logos come from ESPN as on the real site.

const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const SITE = "http://localhost:4173";
const OUT = path.resolve(process.argv[2] ?? "previews");
const THEME = process.argv[3] ?? "dark";
const ADMIN_JS = fs.readFileSync(path.join(__dirname, "..", "worker", "admin.js"), "utf8");
const PICKED = ["cfb:1", "cfb:2", "cfb:5", "cfb:6", "cfb:7", "cfb:8", "nfl:101", "nfl:102"];
const CORS = { "access-control-allow-origin": "*" };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, colorScheme: THEME, acceptDownloads: true });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.addInitScript((picked) => {
      localStorage.setItem("adminToken", JSON.stringify("preview"));
      localStorage.setItem("selected", JSON.stringify(picked));
    }, PICKED);
    await page.route("https://site.api.espn.com/**", (route) => {
      const url = route.request().url();
      if (url.includes("/summary")) return route.fulfill({ json: {}, headers: CORS });
      route.fulfill({ json: scoreboard(url.includes("college-football") ? cfbGames() : nflGames()), headers: CORS });
    });
    await page.route("https://hits.sh/**", (route) => route.abort());  // don't count this as a visit
    await page.route("**/api/**", (route) => route.fulfill({ body: ADMIN_JS, contentType: "text/javascript" }));
    await page.goto(`${SITE}/?admin`);
    await page.waitForSelector('.board-group[data-section="pre"] .poster');
    await page.waitForTimeout(2500);  // let the team logos load

    const save = async (click, name) => {
      const [download] = await Promise.all([page.waitForEvent("download"), click()]);
      await download.saveAs(path.join(OUT, name));
      console.log(path.join(OUT, name));
    };
    for (const [st, name] of [["pre", "upcoming.png"], ["in", "live.png"], ["post", "final.png"]]) {
      await save(() => page.click(`.board-group[data-section="${st}"] .poster`), name);
    }
    await page.click("#settings");
    await save(() => page.click("#save-board"), "board.png");
  } finally {
    await browser.close();
  }
})();
