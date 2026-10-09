// Logs in as the admin against the real Worker running locally, to check the whole login path (password -> token ->
// admin code) without deploying.
//
// Usage: put ADMIN_PASSWORD=<something> in .dev.vars (git-ignored), run `npx wrangler dev --port 8788`, then:
//   node scripts/check-local-admin.js <that password>
// Prints whether the token was saved and the admin features turned on.

const { chromium } = require("@playwright/test");

const SITE = "http://localhost:8788";
const password = process.argv[2];
if (!password) {
  console.error("usage: node scripts/check-local-admin.js <password from .dev.vars>");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.route("https://hits.sh/**", (route) => route.abort());  // don't count this as a visit
    await page.goto(`${SITE}/?admin`);
    await page.fill("#admin-password", password);
    await page.press("#admin-password", "Enter");
    await page.waitForTimeout(3000);
    const token = await page.evaluate(() => localStorage.getItem("adminToken"));
    await page.click("#settings");
    const features = await page.locator("#save-board").count();
    console.log(`address: ${page.url()}`);
    console.log(`token saved: ${token && token !== "null" ? "yes" : "no"}`);
    console.log(`admin features on: ${features ? "yes" : "no"}`);
    process.exitCode = token && token !== "null" && features ? 0 : 1;
  } finally {
    await browser.close();
  }
})();
