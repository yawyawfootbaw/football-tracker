// Measures how wide the compact view's live section has to be for its cards to fit side by side without cutting off
// anything (team names, the down & distance), with the longest realistic text in every live card: a 5-letter team
// (UMASS), a ranking (#25), two-digit scores, the possession dot, and "4th & 15 at UMASS 45". It widens the window
// step by step and reports, for each column count, the narrowest section where nothing trails off, with a mouse
// (desktop Chrome: buttons float on hover) and on touch (WebKit, iPhone-like: the buttons take a column).
//
// Usage: start the local server (npm start), then run: node scripts/measure-compact-fit.js
// Compare the result with the `.line-grid .live .cards` breakpoints in css/board.css.

const { chromium, webkit } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const SITE = "http://localhost:4173";
const CORS = { "access-control-allow-origin": "*" };
const PICKS = ["cfb:1", "cfb:2", "cfb:4", "cfb:5", "cfb:7", "nfl:101", "nfl:102"];

const MODES = {
  mouse: { launch: () => chromium.launch({ channel: "chrome" }), context: {} },
  touch: { launch: () => webkit.launch(), context: { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
};

async function measure(mode) {
  const browser = await MODES[mode].launch();
  const page = await (await browser.newContext({ ...MODES[mode].context, viewport: { width: 1300, height: 900 } })).newPage();
  await page.route("https://hits.sh/**", (r) => r.abort());
  await page.route("https://a.espncdn.com/**", (r) => r.fulfill({ status: 404, headers: CORS }));
  await page.route("https://site.api.espn.com/**", (r) => {
    const url = r.request().url();
    if (url.includes("/summary")) return r.fulfill({ json: {}, headers: CORS });
    r.fulfill({ json: scoreboard(url.includes("college-football") ? cfbGames() : nflGames()), headers: CORS });
  });
  await page.addInitScript((picks) => {
    localStorage.setItem("selected", JSON.stringify(picks));
    localStorage.setItem("view", JSON.stringify("list"));
    localStorage.setItem("pickerOpen", "false");
  }, PICKS);
  await page.goto(SITE);
  await page.waitForSelector(".line-grid .live .card", { timeout: 15000 });
  await page.evaluate(() => { window.__stop = true; });  // nothing below re-renders; edits are made after each width change

  const results = {};
  for (let width = 380; width <= 1300; width += 2) {
    await page.setViewportSize({ width, height: 900 });
    const r = await page.evaluate(() => {
      const section = document.querySelector(".line-grid .live");
      for (const card of section.querySelectorAll(".card")) {
        card.querySelectorAll(".abbr").forEach((e) => { e.textContent = "UMASS"; });
        card.querySelectorAll(".pts").forEach((e) => { e.textContent = "88"; });
        card.querySelectorAll(".poss").forEach((e) => e.classList.remove("hide"));
        card.querySelectorAll(".top").forEach((top) => {
          if (!top.querySelector(".rank")) top.insertAdjacentHTML("afterbegin", '<span class="rank">25</span>');
        });
        const dd = card.querySelector(".dd");
        if (dd) dd.textContent = "4th & 15 at UMASS 45";
      }
      const cols = getComputedStyle(section.querySelector(".cards")).gridTemplateColumns.split(" ").length;
      const cut = [...section.querySelectorAll(".abbr, .dd")].filter((e) => e.scrollWidth > e.clientWidth + 0.5)
        .map((e) => e.className);
      return { section: Math.round(section.getBoundingClientRect().width), cols, cut: [...new Set(cut)] };
    });
    const k = r.cols;
    results[k] ??= { first: r.section, firstFit: null, cutAt: [] };
    if (!r.cut.length && results[k].firstFit === null) results[k].firstFit = r.section;
    if (r.cut.length) results[k].cutAt.push(`${r.section}:${r.cut.join("+")}`);
  }
  await browser.close();
  return results;
}

(async () => {
  for (const mode of Object.keys(MODES)) {
    const res = await measure(mode);
    console.log(`\n${mode}`);
    for (const [cols, r] of Object.entries(res)) {
      const cuts = r.cutAt.length ? `cut off at ${r.cutAt.length} widths, up to ${r.cutAt.at(-1)}` : "nothing cut off";
      console.log(`  ${cols} col: section from ${r.first}px; fits from ${r.firstFit ?? "never"}px; ${cuts}`);
    }
  }
})();
