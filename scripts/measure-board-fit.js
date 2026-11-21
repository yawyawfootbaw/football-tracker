// Measures how wide each board section has to be for its cards to fit side by side without cutting off anything
// (team names, the down & distance), in both views (grid, and compact: view "list"), with the widest real text in
// every card: the widest team abbreviation in this season's FBS games (ESPN's scoreboards), with a ranking (#25) when
// the widest is one that's been ranked, two-digit scores, the possession dot, and "4th & 15 at <widest> 45". It widens the window step by step and reports, for each section (Live; Final and Upcoming)
// and column count, the narrowest section where nothing trails off, with a mouse (desktop Chrome: buttons float on
// hover) and on touch (WebKit, iPhone-like: the buttons always show).
//
// Usage: start the local server (npm start), then run: node scripts/measure-board-fit.js [grid|list …]
// (both views by default). Compare the result with the breakpoints in css/board.css: `.line-grid .cards` for compact
// view; `.live .cards` and `.compact .cards` (Final and Upcoming) for grid view.

const { chromium, webkit } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const SITE = "http://localhost:4173";
const CORS = { "access-control-allow-origin": "*" };
const PICKS = ["cfb:1", "cfb:2", "cfb:4", "cfb:5", "cfb:7", "nfl:101", "nfl:102"];
const VIEWS = process.argv.slice(2).length ? process.argv.slice(2) : ["grid", "list"];
const SECTIONS = { live: "section.live", "final/upcoming": "section.compact" };

const MODES = {
  mouse: { launch: () => chromium.launch({ channel: "chrome" }), context: {} },
  touch: { launch: () => webkit.launch(), context: { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
};

// Every abbreviation in this season's FBS games ({ all, ranked }), from ESPN's scoreboards, week by week.
async function seasonAbbrs() {
  const all = new Set(), ranked = new Set(), year = new Date().getFullYear();
  for (let week = 1; week <= 15; week++) {
    const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300&week=${week}&seasontype=2&dates=${year}`)).json();
    for (const e of j.events ?? []) for (const c of e.competitions[0].competitors) {
      all.add(c.team.abbreviation);
      if ((c.curatedRank?.current ?? 99) <= 25) ranked.add(c.team.abbreviation);
    }
  }
  return { all: [...all], ranked: [...ranked] };
}

async function measure(mode, view, abbrs) {
  const browser = await MODES[mode].launch();
  const page = await (await browser.newContext({ ...MODES[mode].context, viewport: { width: 1300, height: 900 } })).newPage();
  await page.route("https://hits.sh/**", (r) => r.abort());
  await page.route("https://a.espncdn.com/**", (r) => r.fulfill({ status: 404, headers: CORS }));
  await page.route("https://site.api.espn.com/**", (r) => {
    const url = r.request().url();
    if (url.includes("/summary")) return r.fulfill({ json: {}, headers: CORS });
    r.fulfill({ json: scoreboard(url.includes("college-football") ? cfbGames() : nflGames()), headers: CORS });
  });
  await page.addInitScript(([picks, v]) => {
    localStorage.setItem("selected", JSON.stringify(picks));
    localStorage.setItem("view", JSON.stringify(v));
    localStorage.setItem("pickerOpen", "false");
  }, [PICKS, view]);
  await page.goto(SITE);
  await page.waitForSelector("section.live .card", { timeout: 15000 });
  // The widest name as it shows: the widest ranked one with its ranking, or the widest of all without, whichever's wider.
  const widest = await page.evaluate(({ all, ranked }) => {
    const top = document.querySelector("section.live .card .top");
    const width = (abbr, rank) => {
      const probe = top.cloneNode(false);
      probe.style.cssText = "position:absolute;visibility:hidden;width:auto";
      probe.innerHTML = `${rank ? '<span class="rank">25</span>' : ""}<span class="abbr">${abbr}</span>`;
      top.parentElement.append(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    };
    const best = (list, rank) => list.map((a) => ({ abbr: a, rank, w: width(a, rank) })).sort((a, b) => b.w - a.w)[0];
    const r = best(ranked, true), a = best(all, false);
    return r.w >= a.w ? r : a;
  }, abbrs);
  console.log(`(${mode}, ${view}: widest name ${widest.rank ? "#25 " : ""}${widest.abbr})`);

  const results = {};  // { section: { cols: { first, fits, cutTo } } }
  for (let width = 380; width <= 1900; width += 2) {
    await page.setViewportSize({ width, height: 900 });
    // The longest text goes in again at each width, since the page redraws on each poll.
    const rows = await page.evaluate(([sections, widest]) => Object.entries(sections).map(([name, sel]) => {
      const section = document.querySelector(sel);
      if (!section) return null;
      for (const card of section.querySelectorAll(".card")) {
        card.querySelectorAll(".abbr").forEach((e) => { e.textContent = widest.abbr; });
        card.querySelectorAll(".pts").forEach((e) => { if (e.textContent.trim()) e.textContent = "88"; });
        if (sel.includes("live")) card.querySelectorAll(".poss").forEach((e) => e.classList.remove("hide"));
        card.querySelectorAll(".top").forEach((top) => {
          const rank = top.querySelector(".rank");
          if (widest.rank && !rank) top.insertAdjacentHTML("afterbegin", '<span class="rank">25</span>');
          if (!widest.rank) rank?.remove();
        });
        const dd = card.querySelector(".dd");
        if (dd && sel.includes("live")) dd.textContent = `4th & 15 at ${widest.abbr} 45`;
      }
      const cols = getComputedStyle(section.querySelector(".cards")).gridTemplateColumns.split(" ").length;
      const cut = [...section.querySelectorAll(".abbr, .dd")].filter((e) => e.scrollWidth > e.clientWidth + 0.5)
        .map((e) => e.className.split(" ")[0]);
      return { name, section: Math.round(section.getBoundingClientRect().width), cols, cut: [...new Set(cut)] };
    }).filter(Boolean), [SECTIONS, widest]);
    for (const r of rows) {
      const c = ((results[r.name] ??= {})[r.cols] ??= { first: r.section, fits: null, cutTo: null });
      if (r.cut.length) { c.cutTo = `${r.section}px (${r.cut.join(", ")})`; c.fits = null; }
      else c.fits ??= r.section;
    }
  }
  await browser.close();
  return results;
}

(async () => {
  const abbrs = await seasonAbbrs();
  for (const view of VIEWS) {
    for (const mode of Object.keys(MODES)) {
      const res = await measure(mode, view, abbrs);
      for (const [section, byCols] of Object.entries(res)) {
        console.log(`\n${view === "list" ? "compact" : "grid"} view, ${section}, ${mode}`);
        for (const [cols, r] of Object.entries(byCols)) {
          console.log(`  ${cols} col: section from ${r.first}px; ${r.cutTo ? `cut off up to ${r.cutTo}; ` : ""}fits from ${r.fits ?? "never"}px`);
        }
      }
    }
  }
})();
