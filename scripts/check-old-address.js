// Checks that the old GitHub Pages address still works: each old link should land on gametrackerlive.com with its
// path and query kept (the gh-pages branch, scripts/publish-pages-redirect.sh).
//
// Usage: node scripts/check-old-address.js

const { chromium } = require("@playwright/test");

const OLD = "https://yawyawfootbaw.github.io/football-tracker";
const CASES = [
  ["/", "https://gametrackerlive.com/"],
  ["/?game=cfb:401234567", "https://gametrackerlive.com/?game=cfb:401234567"],
  ["/index.html?league=nfl", "https://gametrackerlive.com/?league=nfl"],
  ["/?admin", "https://gametrackerlive.com/?admin"],
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let failed = 0;
  try {
    const page = await browser.newPage();
    // Only the redirect is being checked: stop at the new site's address without loading it (or counting a visit).
    await page.route("https://gametrackerlive.com/**", (route) => route.fulfill({ body: "<title>landed</title>", contentType: "text/html" }));
    for (const [from, want] of CASES) {
      await page.goto(OLD + from);
      await page.waitForURL("https://gametrackerlive.com/**", { timeout: 15_000 }).catch(() => {});
      const ok = page.url() === want;
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${OLD + from}  ->  ${page.url()}`);
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
