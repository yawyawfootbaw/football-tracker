// Regenerates images/og.png (link preview) and images/apple-touch-icon.png from the app itself, using the
// test fixtures so the screenshot is stable. Run with the dev server up: `npm start`, then `node scripts/share-images.js`.
const { chromium } = require(process.cwd() + "/node_modules/@playwright/test");
const { cfbGames, nflGames, scoreboard, PNG } = require(process.cwd() + "/tests/fixtures");
const CORS = { "access-control-allow-origin": "*" };
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  // Apple touch icon: the favicon SVG rendered at 180×180.
  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.setContent(`<style>body{margin:0}</style><img src="http://localhost:4173/images/favicon.svg" width="180" height="180">`);
  await icon.waitForTimeout(300);
  await icon.screenshot({ path: "images/apple-touch-icon.png" });
  // Link-preview image: the app at 1200×630 with a few fixture games and the demo cards.
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.addInitScript(() => {
    localStorage.setItem("selected", JSON.stringify(["cfb:1", "cfb:2", "cfb:4", "nfl:101", "cfb:7"]));
  });
  await page.route("https://site.api.espn.com/**", (r) => r.fulfill({ json: scoreboard(r.request().url().includes("college") ? cfbGames() : nflGames()), headers: CORS }));
  await page.route("https://hits.sh/**", (r) => r.fulfill({ body: "<svg xmlns='http://www.w3.org/2000/svg'/>", contentType: "image/svg+xml" }));
  await page.goto("http://localhost:4173/index.html");
  await page.waitForSelector(".card");
  await page.waitForTimeout(3500);  // real logos load; one-time glows finish
  await page.addStyleTag({ content: "#corner{display:none}" });
  await page.screenshot({ path: "images/og.png" });
  await browser.close();
})();
