// Renders the Home Screen app's splash screen logo (the football over the GAME TRACKER LIVE wordmark, on the splash's
// dark background) to previews/splash-<look>.png at 3x, for each look: regular, thanksgiving (drumstick), halloween
// (jack-o'-lantern). It opens the page as the installed app (navigator.standalone) and shoots the splash before
// js/main.js fades it out.
//
// Usage: start the local server (npm start), then run: node scripts/splash-image.js [regular|thanksgiving|halloween …]
// (all three by default). PAD=<px> sets the margin around the logo (default 48).

const path = require("path");
const fs = require("fs");
const { chromium } = require("@playwright/test");

const SITE = "http://localhost:4173";
const OUT = path.join(__dirname, "..", "previews");
const PAD = Number(process.env.PAD ?? 48);
const LOOKS = { regular: { thanksgiving: false, halloween: false }, thanksgiving: { thanksgiving: true, halloween: false },
  halloween: { thanksgiving: false, halloween: true } };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOKS);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  for (const look of wanted) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
    await page.route("https://hits.sh/**", (r) => r.abort());
    await page.route("https://site.api.espn.com/**", () => {});  // never answers, so the splash stays up
    await page.addInitScript((flags) => {
      Object.defineProperty(navigator, "standalone", { get: () => true });
      for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, JSON.stringify(v));
    }, LOOKS[look]);
    await page.goto(SITE);
    await page.waitForSelector("#splash", { state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);  // past the fade-in
    const box = await page.evaluate(() => {
      const parts = [...document.querySelectorAll("#splash img, #splash .wordmark")]
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width);
      const x = Math.min(...parts.map((r) => r.left)), y = Math.min(...parts.map((r) => r.top));
      return { x, y, width: Math.max(...parts.map((r) => r.right)) - x, height: Math.max(...parts.map((r) => r.bottom)) - y };
    });
    const file = path.join(OUT, `splash-${look}.png`);
    await page.screenshot({ path: file, clip: { x: box.x - PAD, y: box.y - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD } });
    console.log(file);
    await page.close();
  }
  await browser.close();
})();
