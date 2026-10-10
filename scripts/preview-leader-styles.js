// Renders the board with each candidate style for highlighting the leading team (a request from a user), so the
// options can be compared by eye before one is built. The leader is tagged in the page after each render; the
// real version would set the class in js/board.js. One game (BYU–TCU) is made a tie to show the no-highlight case.
//
// Usage: start the local server (npm start), then run: node scripts/preview-leader-styles.js [out-dir]
// Writes <option>-<theme>.png for every option in both themes to out-dir (default ./previews/leader, git-ignored),
// plus index.html showing them side by side.

const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const SITE = "http://localhost:4173";
const OUT = path.resolve(process.argv[2] ?? "previews/leader");
const PICKED = ["cfb:1", "cfb:2", "cfb:4", "cfb:7", "cfb:8", "nfl:101"];
const CORS = { "access-control-allow-origin": "*" };

const OPTIONS = {
  none: "",
  // A: the trailing team fades back; the leader looks as it does today.
  dim: `.score.has-lead .team:not(.lead) :is(.pts, .abbr, img) { opacity: .5; }`,
  // B: the leader's score is brighter and heavier, the trailer's lighter.
  weight: `.score.has-lead .team .pts { font-weight: 500; color: var(--muted); }
    .score.has-lead .team.lead .pts { font-weight: 800; color: var(--strong); }`,
  // C: a faint wash behind the leader's half of the scoreboard row.
  tint: `.team.lead { border-radius: 6px; background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .team.away.lead { margin: -4px 0 -4px -6px; padding: 4px 0 4px 6px; }
    .team.home.lead { margin: -4px -6px -4px 0; padding: 4px 6px 4px 0; }`,
  // D: a short accent bar under the leader's score.
  underline: `.team.lead .pts { text-decoration: underline 3px var(--accent); text-underline-offset: 5px; }`,
  // E: a small caret beside the leader's score, pointing at it from the clock side (common on TV scoreboards).
  caret: `.team .pts { position: relative; }
    .team.lead .pts::after { position: absolute; top: 50%; translate: 0 -50%; color: var(--accent); font-size: 10px; }
    .team.away.lead .pts::after { content: "◀"; right: -12px; }
    .team.home.lead .pts::after { content: "▶"; left: -12px; }`,
};

// Tags .lead on the leading team and .has-lead on the scoreboard row after every board render; nothing on a tie.
function tagLeaders() {
  const tag = () => document.querySelectorAll(".card .score").forEach((score) => {
    const [away, home] = score.querySelectorAll(".team");
    const a = parseInt(away.querySelector(".pts").textContent), h = parseInt(home.querySelector(".pts").textContent);
    const lead = Number.isNaN(a) || Number.isNaN(h) || a === h ? null : a > h ? away : home;
    away.classList.toggle("lead", lead === away);
    home.classList.toggle("lead", lead === home);
    score.classList.toggle("has-lead", !!lead);
  });
  new MutationObserver(tag).observe(document, { childList: true, subtree: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: theme });
      page.on("pageerror", (e) => console.error("page error:", e.message));
      await page.addInitScript(({ picked, theme }) => {
        localStorage.setItem("selected", JSON.stringify(picked));
        localStorage.setItem("theme", JSON.stringify(theme));
        localStorage.setItem("panelCollapsed", JSON.stringify(true));
      }, { picked: PICKED, theme });
      await page.addInitScript(tagLeaders);
      await page.route("https://site.api.espn.com/**", (route) => {
        const url = route.request().url();
        if (url.includes("/summary")) return route.fulfill({ json: {}, headers: CORS });
        const events = url.includes("college-football") ? cfbGames() : nflGames();
        const tied = events.find((e) => e.id === "4");
        if (tied) tied.competitions[0].competitors.forEach((c) => { c.score = "14"; });
        route.fulfill({ json: scoreboard(events), headers: CORS });
      });
      await page.route("https://hits.sh/**", (route) => route.abort());
      await page.goto(SITE);
      await page.waitForSelector('.card[data-key="cfb:7"]');
      await page.waitForTimeout(2500);  // team logos
      for (const [name, css] of Object.entries(OPTIONS)) {
        await page.evaluate((css) => {
          document.getElementById("leader-style")?.remove();
          document.head.insertAdjacentHTML("beforeend", `<style id="leader-style">${css}</style>`);
        }, css);
        await page.waitForTimeout(150);
        const file = path.join(OUT, `${name}-${theme}.png`);
        await page.locator("#board").screenshot({ path: file });
        console.log(file);
      }
      await page.close();
    }
    const rows = Object.keys(OPTIONS).map((name) => `<h2>${name}</h2><div><img src="${name}-dark.png"><img src="${name}-light.png"></div>`);
    fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><title>Leader styles</title>
<style>body{font:15px sans-serif;margin:16px}div{display:flex;gap:12px}img{width:50%;border:1px solid #ccc}h2{margin:24px 0 8px}</style>
${rows.join("\n")}`);
  } finally {
    await browser.close();
  }
})();
