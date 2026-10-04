// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",  // the installed Chrome; no browser download needed
    headless: true,
    viewport: { width: 1300, height: 900 },
  },
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://localhost:4173/index.html",
    reuseExistingServer: true,
    stdout: "ignore",
    stderr: "ignore",
  },
});
