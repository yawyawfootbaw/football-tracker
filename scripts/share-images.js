// Regenerates the link-preview image (images/og.png) and the home-screen icon
// (images/apple-touch-icon.png).
//
// Usage: start the local server (npm start), then run: node scripts/share-images.js
//
// The preview is a screenshot of the app filled with the test fixtures instead of live
// ESPN data, so it comes out the same every time.

const path = require("path");
const { chromium } = require("@playwright/test");
const { cfbGames, nflGames, scoreboard } = require("../tests/fixtures");

const SITE = "http://localhost:4173";
const IMAGES = path.join(__dirname, "..", "images");
const PREVIEW_GAMES = ["cfb:1", "cfb:2", "cfb:4", "nfl:101", "cfb:7"];

async function renderIcon(browser) {
  const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await page.setContent(`<body style="margin: 0"><img src="${SITE}/images/favicon.svg" width="180" height="180"></body>`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: path.join(IMAGES, "apple-touch-icon.png") });
}

async function renderPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.addInitScript((keys) => localStorage.setItem("selected", JSON.stringify(keys)), PREVIEW_GAMES);
  await page.route("https://site.api.espn.com/**", (route) => {
    const games = route.request().url().includes("college-football") ? cfbGames() : nflGames();
    route.fulfill({ json: scoreboard(games), headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://hits.sh/**", (route) => route.abort());  // don't count this as a visit

  await page.goto(SITE);
  await page.waitForSelector(".card");
  await page.waitForTimeout(3000);  // let the team logos load and the red-zone glow finish
  await page.addStyleTag({ content: "#corner { display: none; }" });  // hide the contact footer and gear
  await page.screenshot({ path: path.join(IMAGES, "og.png") });
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    await renderIcon(browser);
    await renderPreview(browser);
  } finally {
    await browser.close();
  }
})();
