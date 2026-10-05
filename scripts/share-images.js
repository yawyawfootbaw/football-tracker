// Regenerates the link-preview image (images/og.png) and the home-screen icon
// (images/apple-touch-icon.png).
//
// Usage: start the local server (npm start), then run: node scripts/share-images.js
//
// The preview is the app's logo (football and wordmark), not a screenshot, so it doesn't go stale as the layout changes.

const path = require("path");
const { chromium } = require("@playwright/test");

const SITE = "http://localhost:4173";
const IMAGES = path.join(__dirname, "..", "images");

async function renderIcon(browser) {
  const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
  // The favicon is transparent; give the home-screen version the app's dark background and some padding.
  await page.setContent(`<body style="margin: 0; background: #0f1115"><img src="${SITE}/images/favicon.svg" width="140" height="140" style="margin: 20px"></body>`);
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: path.join(IMAGES, "apple-touch-icon.png") });
}

// The preview is the header's logo, blown up: the football, then GAME over TRACKER over yard-line hash marks, on the
// app's dark background. Same font, colors and proportions as the header (css/base.css).
async function renderPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  // Served from the local site's own origin (not setContent's about:blank) so the self-hosted font loads without CORS.
  const html = `<style>
    @font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url("${SITE}/fonts/barlow-condensed-700.woff2") format("woff2"); }
    body { margin: 0; height: 630px; display: flex; align-items: center; justify-content: center; gap: 48px; background: #0f1115; }
    img { width: 280px; height: 280px; }
    h1 { display: grid; margin: 0; font-family: "Barlow Condensed", sans-serif; font-weight: 700; text-transform: uppercase; line-height: .92; }
    .l1 { font-size: 125px; letter-spacing: .16em; color: #8b93a1; }
    .l2 { font-size: 150px; letter-spacing: .05em; color: #e8eaed; }
    .hash { height: 30px; margin-top: 22px; background: repeating-linear-gradient(90deg, #8b93a1 0 7px, transparent 7px 46px); opacity: .7; }
  </style>
  <img src="${SITE}/images/favicon.svg" alt="">
  <h1><span class="l1">Game</span><span class="l2">Tracker</span><span class="hash"></span></h1>`;
  await page.route(`${SITE}/preview`, (route) => route.fulfill({ body: html, contentType: "text/html" }));
  await page.goto(`${SITE}/preview`);
  await page.evaluate(async () => { await document.fonts.ready; await document.querySelector("img").decode(); });
  if (!(await page.evaluate(() => document.fonts.check('700 150px "Barlow Condensed"')))) throw new Error("wordmark font didn't load");
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
