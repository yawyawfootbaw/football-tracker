// @ts-check
const { test, expect } = require("@playwright/test");
const { LONG_PLAY, cfbGames, nflGames, scoreboard, PNG } = require("./fixtures");

const CORS = { "access-control-allow-origin": "*" };

/**
 * Stub every outside service, optionally seed localStorage, and open the app.
 * Returns a mutable state object: change state.cfb / state.nfl to alter what the next poll sees.
 */
async function open(page, opts = {}) {
  const state = { cfb: opts.cfb ?? cfbGames(), nfl: opts.nfl ?? nflGames(), hits: 0, espnRequests: 0, gate: opts.gate };
  await page.route("https://site.api.espn.com/**", async (route) => {
    state.espnRequests++;
    if (state.gate) await state.gate;
    const games = route.request().url().includes("college-football") ? state.cfb : state.nfl;
    await route.fulfill({ json: scoreboard(games), headers: CORS });
  });
  await page.route("https://a.espncdn.com/**", (route) =>
    opts.missingLogo && route.request().url().includes(opts.missingLogo)
      ? route.fulfill({ status: 404, headers: CORS })
      : route.fulfill({ body: PNG, contentType: "image/png", headers: CORS }));
  await page.route("https://hits.sh/**", (route) => {
    state.hits++;
    return route.fulfill({ body: "<svg xmlns='http://www.w3.org/2000/svg'/>", contentType: "image/svg+xml" });
  });
  if (opts.storage) {
    // Seed once per test; later reloads must see what the app itself saved.
    await page.addInitScript((seed) => {
      if (sessionStorage.getItem("seeded")) return;
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
      sessionStorage.setItem("seeded", "1");
    }, opts.storage);
  }
  await page.goto(`/index.html${opts.query ?? ""}`);
  if (!opts.gate) await expect(page.locator("#list label.game").first()).toBeAttached();
  return state;
}

const row = (page, key) => page.locator(`#list label.game:has(input[data-key="${key}"])`);
const card = (page, key) => page.locator(`.card[data-key="${key}"]`);
const rowKeys = (page, group) => page.locator(`#list .group-label[data-group="${group}"] + .group-body input`)
  .evaluateAll((inputs) => inputs.map((i) => i.dataset.key));
const style = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const ALL_CFB = ["cfb:1", "cfb:2", "cfb:3", "cfb:4", "cfb:5", "cfb:6", "cfb:7", "cfb:8"];

test.describe("loading and layout", () => {
  test("shows spinners until the first data arrives", async ({ page }) => {
    let release;
    const gate = new Promise((r) => (release = r));
    await open(page, { gate });
    await expect(page.locator("#list .spinner")).toBeVisible();
    await expect(page.locator("#board .spinner")).toBeVisible();
    release();
    await expect(page.locator("#list label.game").first()).toBeVisible();
    await expect(page.locator(".spinner")).toHaveCount(0);
  });

  test("loads every file and runs with no console errors or failed requests", async ({ page }) => {
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(String(e)));
    page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));
    page.on("response", (r) => { if (r.url().startsWith("http://localhost") && r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
    await open(page, { storage: { selected: ["cfb:1"] } });
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    await expect(page.locator("#coach img")).toHaveJSProperty("complete", true);
    expect(await page.locator("#coach img").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test("picker tabs are College then NFL, with College the default", async ({ page }) => {
    await open(page);
    await expect(page.locator(".tabs button")).toHaveText(["College", "NFL"]);
    await expect(page.locator('.tabs button[data-league="cfb"]')).toHaveClass(/on/);
  });

  test("a tab saved from the old All option falls back to College", async ({ page }) => {
    await open(page, { storage: { tab: "all" } });
    await expect(page.locator('.tabs button[data-league="cfb"]')).toHaveClass(/on/);
    await expect(row(page, "nfl:101")).toHaveCount(0);
  });

  test("remembers the chosen tab across reloads", async ({ page }) => {
    await open(page);
    await page.locator('.tabs button[data-league="nfl"]').click();
    await expect(row(page, "nfl:101")).toBeAttached();
    await page.reload();
    await expect(page.locator('.tabs button[data-league="nfl"]')).toHaveClass(/on/);
  });

  test('shows "Games updated at" with a local time', async ({ page }) => {
    await open(page);
    await expect(page.locator("#updated")).toHaveText(/^Games updated at \d{1,2}:\d{2}:\d{2}/);
  });

  test("has a favicon and link-preview tags whose images exist", async ({ page, request }) => {
    await open(page);
    const attr = (sel, a) => page.locator(sel).getAttribute(a);
    expect(await attr('meta[property="og:title"]', "content")).toBe("Game Tracker");
    expect(await attr('meta[property="og:description"]', "content")).toBeTruthy();
    expect(await attr('meta[name="twitter:card"]', "content")).toBe("summary_large_image");
    const live = "https://yawyawfootbaw.github.io/football-tracker/";
    const og = await attr('meta[property="og:image"]', "content");
    expect(og.startsWith(live)).toBe(true);  // previews need absolute URLs
    for (const path of [og.slice(live.length), await attr('link[rel="icon"]', "href"), await attr('link[rel="apple-touch-icon"]', "href")]) {
      expect((await request.get("/" + path)).status(), path).toBe(200);
    }
  });

  test("dark color scheme, so native scrollbars and controls are dark", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  test("contact footer and settings gear sit in the bottom-right corner", async ({ page }) => {
    await open(page);
    await expect(page.locator("#contact")).toHaveText("contact: sean@homeworkdots.com");
    const gear = await page.locator("#settings").boundingBox();
    const contact = await page.locator("#contact").boundingBox();
    expect(gear.x + gear.width).toBeLessThanOrEqual(contact.x + 1);  // gear is left of contact
    expect(contact.x + contact.width).toBeGreaterThan(1300 - 2);     // flush right
  });
});

test.describe("?league= links", () => {
  const tabOn = (page, league) => expect(page.locator(`.tabs button[data-league="${league}"]`)).toHaveClass(/on/);

  test("?league=nfl opens the picker on NFL, overriding a saved College choice", async ({ page }) => {
    await open(page, { query: "?league=nfl", storage: { tab: "cfb" } });
    await tabOn(page, "nfl");
  });

  test("the choice sticks after visiting without the parameter", async ({ page }) => {
    await open(page, { query: "?league=nfl", storage: { selected: ["nfl:101"] } });
    await tabOn(page, "nfl");
    await page.goto("/index.html");
    await tabOn(page, "nfl");
  });

  test("?league=college opens on College; an unknown value changes nothing", async ({ page }) => {
    await open(page, { query: "?league=college", storage: { tab: "nfl", selected: ["cfb:1"] } });
    await tabOn(page, "cfb");
    await page.goto("/index.html?league=hockey");
    await tabOn(page, "cfb");
  });
});

test.describe("game picker", () => {
  test("groups games into Live, Upcoming and Final with counts", async ({ page }) => {
    await open(page);
    await expect(page.locator("#list .group-label")).toHaveText([/Live\s*4/, /Upcoming\s*2/, /Final\s*2/]);
  });

  test("section headers look different from rows, and rows alternate shades", async ({ page }) => {
    await open(page);
    const header = await style(page.locator("#list .group-label").first(), "backgroundColor");
    const odd = await style(page.locator("#list label.game").nth(0), "backgroundColor");
    const even = await style(page.locator("#list label.game").nth(1), "backgroundColor");
    expect(odd).not.toBe(even);
    expect(header).not.toBe(odd);
    expect(header).not.toBe(even);
  });

  test("the + circle keeps its spot at the row's right edge, with room between it and the time", async ({ page }) => {
    await open(page);
    const r = await row(page, "cfb:5").boundingBox();
    const pick = await row(page, "cfb:5").locator(".pick").boundingBox();
    const status = await row(page, "cfb:5").locator(".bug-status").boundingBox();
    expect(r.x + r.width - (pick.x + pick.width)).toBeCloseTo(12, 0);  // row padding
    expect(pick.x - (status.x + status.width)).toBeGreaterThanOrEqual(22);
  });

  test("the Live section stands out: tinted header, pulsing dot, red edge on live rows", async ({ page }) => {
    await open(page);
    const live = page.locator('#list .group-label[data-group="Live"]');
    const upcoming = page.locator('#list .group-label[data-group="Upcoming"]');
    expect(await style(live, "backgroundColor")).not.toBe(await style(upcoming, "backgroundColor"));
    expect(await live.evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("live-pulse");
    await expect(row(page, "cfb:1")).toHaveClass(/live/);
    await expect(row(page, "cfb:5")).not.toHaveClass(/live/);
    expect(await style(row(page, "cfb:1"), "boxShadow")).toContain("inset");
  });

  test("rows read like a score bug: both teams, scores, status, loser greyed out", async ({ page }) => {
    await open(page);
    const final = row(page, "cfb:7");
    await expect(final.locator(".bug-team")).toHaveCount(2);
    await expect(final.locator(".bug-team").nth(0)).toContainText("ALA");
    await expect(final.locator(".bug-team").nth(0)).toContainText("56");
    await expect(final.locator(".bug-team").nth(1)).toHaveClass(/lost/);
    await expect(final.locator(".bug-status")).toContainText("Final");
    await expect(row(page, "cfb:1").locator(".rank").first()).toHaveText("5");
    await expect(row(page, "cfb:1").locator(".rec")).toHaveText(["5-0", "3-2"]);  // team records
  });

  test("clicking a row adds the game; Selected section lists picks in the original list order", async ({ page }) => {
    await open(page);
    await row(page, "cfb:8").locator(".bug").click();  // a final game first...
    await row(page, "cfb:1").locator(".bug").click();  // ...then a live one
    expect(await rowKeys(page, "Selected")).toEqual(["cfb:1", "cfb:8"]);  // live sorts before final, as in the full list
    await expect(card(page, "cfb:1")).toBeVisible();
    await expect(card(page, "cfb:8")).toBeVisible();
  });

  test("picks persist across reloads", async ({ page }) => {
    await open(page);
    await row(page, "cfb:2").locator(".bug").click();
    await page.reload();
    await expect(row(page, "cfb:2").locator("input")).toBeChecked();
    await expect(card(page, "cfb:2")).toBeVisible();
  });

  test("a newly picked row slides into the Selected section", async ({ page }) => {
    await open(page);
    await row(page, "cfb:5").locator(".bug").click();
    await expect.poll(() => row(page, "cfb:5").evaluate((el) => el.style.transition), { timeout: 1000, intervals: [10] })
      .toContain("transform");
  });

  test("clicking a selected row highlights its card instead of unselecting; the ✓ unselects", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    await row(page, "cfb:1").locator(".bug").click();
    await expect(row(page, "cfb:1").locator("input")).toBeChecked();
    await expect(card(page, "cfb:1")).toHaveClass(/flash/);
    await row(page, "cfb:1").locator(".pick").click();
    await expect(row(page, "cfb:1").locator("input")).not.toBeChecked();
    await expect(card(page, "cfb:1")).toHaveCount(0);
  });

  test("sections collapse and stay collapsed after reload", async ({ page }) => {
    await open(page);
    const live = page.locator('#list .group-label[data-group="Live"]');
    await live.click();
    await expect(live).toHaveAttribute("aria-expanded", "false");
    await expect(live.locator("+ .group-body")).toHaveClass(/collapsed/);
    await page.reload();
    await expect(page.locator('#list .group-label[data-group="Live"]')).toHaveAttribute("aria-expanded", "false");
  });

  test("returning to the tab fetches right away and restarts the 10-second timer", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-03T20:00:00Z") });
    const state = await open(page);
    await expect.poll(() => state.espnRequests).toBe(2);  // NFL + college on load
    await page.clock.runFor(8_000);
    expect(state.espnRequests).toBe(2);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => state.espnRequests).toBe(4);  // immediately, not at the 10s mark
    await page.clock.runFor(8_000);
    expect(state.espnRequests).toBe(4);  // timer restarted, so nothing at the old 10s mark
    await page.clock.runFor(2_000);
    await expect.poll(() => state.espnRequests).toBe(6);
  });

  test("the list refreshes every 30 seconds while cards refresh every 10", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-03T20:00:00Z") });
    const state = await open(page, { storage: { selected: ["cfb:2"] } });
    await expect(row(page, "cfb:2").locator(".bug-status")).toContainText("6:06");
    state.cfb = cfbGames().map((g) => (g.id === "2" ? { ...g, status: { ...g.status, displayClock: "5:30" } } : g));
    await page.clock.runFor(10_000);
    await expect(card(page, "cfb:2").locator(".clock")).toContainText("5:30");
    await expect(row(page, "cfb:2").locator(".bug-status")).toContainText("6:06");  // list not refreshed yet
    await page.clock.runFor(20_000);
    await expect(row(page, "cfb:2").locator(".bug-status")).toContainText("5:30");
  });
});

test.describe("filters", () => {
  const menu = (page) => page.locator("#conf-menu");
  const choices = (page) => menu(page).locator("label").allTextContents();
  // Open the conference checklist (if closed) and tick or untick one choice.
  async function toggleConf(page, label) {
    if (await menu(page).isHidden()) await page.locator("#conf").click();
    await menu(page).locator("label", { hasText: new RegExp(`^${label}$`) }).click();
  }

  test("filters are visible on both tabs; Top 25 is college-only", async ({ page }) => {
    await open(page);
    await expect(page.locator("#conf")).toBeVisible();
    await expect(page.locator("#top25")).toBeVisible();
    await page.locator('.tabs button[data-league="nfl"]').click();
    await expect(page.locator("#conf")).toBeVisible();
    await expect(page.locator("#top25")).toBeHidden();
  });

  test("conference checklist lists named conferences; picking several shows games from any of them", async ({ page }) => {
    await open(page);
    await expect(page.locator("#conf")).toHaveText("All conferences");
    await page.locator("#conf").click();
    expect(await choices(page)).toEqual(["Big 12", "Big Ten", "Independent", "SEC"]);
    await toggleConf(page, "SEC");
    await expect(page.locator("#list label.game")).toHaveCount(2);  // VAN @ UGA, ALA @ MSST
    await expect(page.locator("#conf")).toHaveText("SEC");
    await toggleConf(page, "Big Ten");
    await expect(page.locator("#list label.game")).toHaveCount(4);  // plus OSU @ IOWA, MD @ PUR
    await expect(page.locator("#conf")).toHaveText("Big Ten, SEC");
    await toggleConf(page, "Big 12");
    await expect(page.locator("#conf")).toHaveText("3 conferences");
    await expect(menu(page)).toBeVisible();  // stays open while ticking
  });

  test("✕ clears every chosen conference at once", async ({ page }) => {
    await open(page);
    await toggleConf(page, "SEC");
    await toggleConf(page, "Big Ten");
    await page.locator("#conf-clear").click();
    await expect(page.locator("#list label.game")).toHaveCount(8);
    await expect(page.locator("#conf")).toHaveText("All conferences");
    await expect(page.locator("#conf-clear")).toBeHidden();
  });

  test("checklist closes on an outside click or Escape", async ({ page }) => {
    await open(page);
    await page.locator("#conf").click();
    await expect(menu(page)).toBeVisible();
    await page.locator("header h1").click();
    await expect(menu(page)).toBeHidden();
    await page.locator("#conf").click();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();
  });

  test("NFL checklist offers AFC, NFC and their divisions, in any combination", async ({ page }) => {
    await open(page, { storage: { tab: "nfl" } });
    await page.locator("#conf").click();
    expect(await choices(page)).toEqual([
      "All AFC", "AFC East", "AFC North", "AFC South", "AFC West",
      "All NFC", "NFC East", "NFC North", "NFC South", "NFC West"]);
    await toggleConf(page, "All NFC");
    await expect(page.locator("#list label.game")).toHaveCount(1);
    await expect(row(page, "nfl:102")).toBeAttached();  // DAL @ PHI
    await expect(page.locator("#conf")).toHaveText("NFC");
    await toggleConf(page, "AFC East");
    await expect(page.locator("#list label.game")).toHaveCount(2);  // plus NE @ NYJ
    await toggleConf(page, "All NFC");
    await toggleConf(page, "AFC East");
    await toggleConf(page, "AFC North");
    await expect(page.locator("#list .empty")).toHaveText("No matching games.");
  });

  test("each league remembers its own choices", async ({ page }) => {
    await open(page);
    await toggleConf(page, "SEC");
    await page.locator('.tabs button[data-league="nfl"]').click();
    await expect(page.locator("#conf")).toHaveText("All conferences");
    await toggleConf(page, "All AFC");
    await page.reload();
    await expect(page.locator("#conf")).toHaveText("AFC");
    await page.locator('.tabs button[data-league="cfb"]').click();
    await expect(page.locator("#conf")).toHaveText("SEC");
  });

  test("filters saved in older formats still apply", async ({ page }) => {
    await open(page, { storage: { filters: { conf: "8", top25: false } } });  // college-only, single conference
    await expect(page.locator("#conf")).toHaveText("SEC");
    await expect(page.locator("#list label.game")).toHaveCount(2);
  });

  test("filters saved per league with a single conference still apply", async ({ page }) => {
    await open(page, { storage: { tab: "nfl", filters: { cfb: { conf: "", top25: true }, nfl: { conf: "AFC" } } } });
    await expect(page.locator("#conf")).toHaveText("AFC");
    await page.locator('.tabs button[data-league="cfb"]').click();
    await expect(page.locator("#list label.game")).toHaveCount(5);  // Top 25 carried over
  });

  test("dropdown arrow sits well inside the right edge", async ({ page }) => {
    await open(page);
    expect(await style(page.locator("#conf"), "backgroundPosition")).toContain("12px");
  });

  test("Top 25 shows only games with a ranked team and is remembered", async ({ page }) => {
    await open(page);
    await page.locator("#top25").click();
    await expect(page.locator("#list label.game")).toHaveCount(5);
    await page.reload();
    await expect(page.locator("#top25")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#list label.game")).toHaveCount(5);
  });
});

test.describe("game cards", () => {
  test("live card shows score, clock, down and distance, possession and timeouts", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const c = card(page, "cfb:1");
    await expect(c.locator(".dd")).toHaveText("3rd & 6 at IOWA 12");
    await expect(c.locator(".clock")).toHaveText(/2:00\s*4th/);
    await expect(c.locator(".team.away .pts")).toHaveText("24");
    await expect(c.locator(".team.away .poss")).not.toHaveClass(/hide/);
    await expect(c.locator(".team.home .poss")).toHaveClass(/hide/);
    await expect(c.locator(".team.away .to")).toHaveText("▮▮▯");
    await expect(c.locator(".team.away .rank")).toHaveText("5");
  });

  test("cards show each team's overall record under its name", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:8"] } });
    await expect(card(page, "cfb:1").locator(".team.away .rec")).toHaveText("5-0");
    await expect(card(page, "cfb:1").locator(".team.home .rec")).toHaveText("3-2");
    await expect(card(page, "cfb:8").locator(".team.away .rec")).toHaveText("");  // ESPN sent no record
  });

  test("field shows the ball, line of scrimmage, line to gain and direction", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const svg = card(page, "cfb:1").locator("svg.field");
    // IOWA 12 is 12 yards from the home goal; the field is 120 units with the away end zone at 0–10.
    await expect(svg.locator("ellipse")).toHaveAttribute("cx", "98");
    await expect(svg.locator('line[stroke="var(--ltg)"]')).toHaveAttribute("x1", "104");  // 6 yards toward the home end zone
    const tip = Number((await svg.locator("polygon").getAttribute("points")).split(",")[0]);
    expect(tip).toBeGreaterThan(98);  // arrow points right, toward the home end zone
  });

  test("red-zone card has a red outline and glows once, again on returning to the tab", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:8"] } });
    const c = card(page, "cfb:1");
    await expect(c).toHaveClass(/redzone/);
    await expect(c).toHaveClass(/glow/);
    await expect(card(page, "cfb:8")).not.toHaveClass(/redzone/);
    await page.waitForTimeout(2500);
    await c.locator(".last").click();  // opening and closing the last play re-renders the board
    await page.keyboard.press("Escape");
    await expect(c).not.toHaveClass(/glow/);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(c).toHaveClass(/glow/);
  });

  test("red zone comes from the ball's position, not ESPN's sometimes-stale flag", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:2", "cfb:3", "nfl:101"] } });
    await expect(card(page, "cfb:1")).toHaveClass(/redzone/);      // away team at the home 12
    await expect(card(page, "cfb:3")).not.toHaveClass(/redzone/);  // ESPN says red zone, but nobody has the ball
    await expect(card(page, "cfb:2")).not.toHaveClass(/redzone/);  // own 25
    await expect(card(page, "nfl:101")).not.toHaveClass(/redzone/);  // own 40
  });

  test("possession falls back to the last play after a kickoff, but not after a timeout", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:2", "cfb:3"] } });
    await expect(card(page, "cfb:2").locator(".team.away .poss")).not.toHaveClass(/hide/);
    await expect(card(page, "cfb:3").locator(".poss:not(.hide)")).toHaveCount(0);
  });

  test("halftime shows Half with no stale down, distance or ball", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:4"] } });
    const c = card(page, "cfb:4");
    await expect(c.locator(".clock")).toHaveText(/^Half/);
    await expect(c.locator(".dd")).toHaveText(/^\s*$/);
    await expect(c.locator("ellipse")).toHaveCount(0);
  });

  test("upcoming shows kickoff time and day; final shows Final", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:5", "cfb:7"] } });
    await expect(card(page, "cfb:5").locator(".clock")).toHaveText(/\d{1,2}:\d{2}\s?[AP]M\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
    await expect(card(page, "cfb:7").locator(".clock")).toHaveText(/^Final/);
  });

  test("cards side by side line up regardless of game state", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:5"] } });
    const a = await card(page, "cfb:1").locator("svg.field").boundingBox();
    const b = await card(page, "cfb:5").locator("svg.field").boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(Math.abs(a.height - b.height)).toBeLessThan(1);
  });

  test("last play opens in full over the card without changing the layout", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const c = card(page, "cfb:1");
    const before = await c.boundingBox();
    await expect(c.locator(".last")).toHaveAttribute("title", LONG_PLAY);
    await c.locator(".last").click();
    await expect(c.locator(".last-full")).toHaveText(LONG_PLAY);
    expect((await c.boundingBox()).height).toBe(before.height);
    await c.locator(".last-full").click();
    await expect(c.locator(".last-full")).toHaveCount(0);
    await c.locator(".last").click();
    await page.keyboard.press("Escape");
    await expect(c.locator(".last-full")).toHaveCount(0);
    await c.locator(".last").click();
    await page.locator("header h1").click();
    await expect(c.locator(".last-full")).toHaveCount(0);
  });

  test("each card notes its network at the bottom, and omits it when ESPN has none", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:7", "cfb:5"] } });
    await expect(card(page, "cfb:1").locator(".card-foot .net")).toHaveText("FOX");
    await expect(card(page, "cfb:7").locator(".card-foot .net")).toHaveText("CBS / Paramount+");
    await expect(card(page, "cfb:5").locator(".net")).toHaveCount(0);
    expect(await style(card(page, "cfb:1").locator(".net"), "color")).toBe("rgb(255, 255, 255)");
  });

  test("✕ appears on hover, removes the card and unchecks the row", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const remove = card(page, "cfb:1").locator(".remove");
    expect(await style(remove, "opacity")).toBe("0");
    await card(page, "cfb:1").hover();
    await expect.poll(() => style(remove, "opacity")).toBe("1");
    expect(await style(remove, "backgroundColor")).toBe("rgb(154, 160, 166)");
    expect(await style(remove, "color")).toBe("rgb(0, 0, 0)");
    await remove.click();
    await expect(card(page, "cfb:1")).toHaveCount(0);
    await expect(row(page, "cfb:1").locator("input")).not.toBeChecked();
  });

  test("logos use ESPN's dark-background versions with a light edge, falling back if missing", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] }, missingLogo: "500-dark/2294" });
    const away = card(page, "cfb:1").locator(".team.away img");
    await expect(away).toHaveAttribute("src", /\/500-dark\/194\.png$/);
    expect(await style(away, "filter")).toContain("drop-shadow");
    await expect(card(page, "cfb:1").locator(".team.home img")).toHaveAttribute("src", /\/500\/2294\.png$/);
  });
});

test.describe("board", () => {
  test("shows every selected game from both leagues, live first", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:8", "nfl:101", "cfb:1"] } });
    const keys = await page.locator(".card").evaluateAll((cards) => cards.map((c) => c.dataset.key));
    expect(keys.slice(0, 2).sort()).toEqual(["cfb:1", "nfl:101"]);
    expect(keys[2]).toBe("cfb:8");
  });

  test("with no picks, it says where to pick games", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    await card(page, "cfb:1").hover();
    await card(page, "cfb:1").locator(".remove").click();
    await expect(page.locator("#board .empty .desktop-only")).toHaveText("Pick a few games from the list on the left and they'll show up here.");
    await expect(page.locator("#board .empty .mobile-only")).toBeHidden();
  });
});

test.describe("demo mode and counter", () => {
  test("?demo skips the hit counter and adds no fake games", async ({ page }) => {
    const state = await open(page, { query: "?demo" });
    await expect(page.locator("#list label.game")).toHaveCount(8);  // just the fixtures
    await page.waitForTimeout(500);
    expect(state.hits).toBe(0);
  });

  test("without ?demo, the hidden hit counter is requested once and isn't on the page", async ({ page }) => {
    const state = await open(page);
    await expect.poll(() => state.hits).toBe(1);
    await expect(page.locator('img[src*="hits.sh"]')).toHaveCount(0);
  });
});

test.describe("settings gear and google me", () => {
  test("gear menu animates open with exactly one option and closes on Escape or outside click", async ({ page }) => {
    await open(page);
    const menu = page.locator("#settings-menu");
    await expect(menu).toBeHidden();
    await page.locator("#settings").click();
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((m) => m.getAnimations().length)).toBeGreaterThan(0);
    await expect(menu.locator("button")).toHaveText(["✓google me"]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await page.locator("#settings").click();
    await page.locator("header h1").click();
    await expect(menu).toBeHidden();
  });

  test("google me grows Cignetti out of the button, shows a check, and clicking him dismisses him", async ({ page }) => {
    await open(page);
    const coach = page.locator("#coach");
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    await expect(coach).toBeVisible();
    expect(await coach.evaluate((c) => c.getAnimations().length)).toBeGreaterThan(0);
    await expect(page.locator("#google-me")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#settings-menu")).toBeHidden();
    await expect(coach.locator("figcaption")).toHaveCount(0);
    await page.waitForTimeout(600);
    await coach.click();
    await expect(coach).toBeHidden();
    await expect(page.locator("#google-me")).toHaveAttribute("aria-pressed", "false");
  });

  test("google me again shrinks him away", async ({ page }) => {
    await open(page);
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    await expect(page.locator("#coach")).toBeVisible();
    await page.waitForTimeout(600);
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    await expect(page.locator("#coach")).toBeHidden();
  });
});

test.describe("google me: Cignetti, or Pelini one time in ten", () => {
  const showCoach = async (page) => {
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    await expect(page.locator("#coach")).toBeVisible();
    return page.locator("#coach img").getAttribute("src");
  };
  const stubRandom = (page, value) => page.addInitScript((v) => { Math.random = () => v; }, value);

  test("Cignetti on rolls of 0.1 and up", async ({ page }) => {
    await stubRandom(page, 0.1);
    await open(page);
    expect(await showCoach(page)).toBe("images/cignetti.png");
  });

  test("Pelini on rolls under 0.1", async ({ page }) => {
    await stubRandom(page, 0.09);
    await open(page);
    expect(await showCoach(page)).toBe("images/pelini.png");
  });

  test("after a swap, the previous coach never shows, even for a frame", async ({ page }) => {
    // First showing rolls Pelini, second rolls Cignetti.
    await page.addInitScript(() => { const rolls = [0.05, 0.5]; Math.random = () => rolls.shift() ?? 0.5; });
    await open(page);
    // Record which photo is in place, and whether it has loaded, the instant the coach is revealed.
    await page.evaluate(() => {
      window.reveals = [];
      const coach = document.getElementById("coach"), img = coach.querySelector("img");
      new MutationObserver(() => { if (!coach.hidden) window.reveals.push({ src: img.getAttribute("src"), ready: img.complete && img.naturalWidth > 0 }); })
        .observe(coach, { attributes: true, attributeFilter: ["hidden"] });
    });
    for (let i = 0; i < 2; i++) {
      await page.locator("#settings").click();
      await page.locator("#google-me").click();
      await expect(page.locator("#coach")).toBeVisible();
      await page.waitForTimeout(600);
      await page.locator("#coach").click();
      await expect(page.locator("#coach")).toBeHidden();
    }
    expect(await page.evaluate(() => window.reveals)).toEqual([
      { src: "images/pelini.png", ready: true },
      { src: "images/cignetti.png", ready: true },
    ]);
  });

  test("?demo doesn't change the odds", async ({ page }) => {
    await stubRandom(page, 0.5);
    await open(page, { query: "?demo" });
    expect(await showCoach(page)).toBe("images/cignetti.png");
  });
});

test.describe("light and dark themes", () => {
  const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);

  test("follows a dark device by default, with dark-background logos and the light logo edge", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    expect(await theme(page)).toBe("dark");
    await expect(card(page, "cfb:1").locator(".team.away img")).toHaveAttribute("src", /\/500-dark\/194\.png$/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  test("the switch flips to light: light colors, regular logos, no logo edge, and it's remembered", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    await expect(page.locator("#theme-toggle")).toHaveAttribute("aria-label", "Switch to light mode");
    await page.locator("#theme-toggle").click();
    expect(await theme(page)).toBe("light");
    expect(await style(page.locator("body"), "backgroundColor")).toBe("rgb(244, 245, 247)");
    const logo = card(page, "cfb:1").locator(".team.away img");
    await expect(logo).toHaveAttribute("src", /\/500\/194\.png$/);
    expect(await style(logo, "filter")).toBe("none");
    await expect(row(page, "cfb:1").locator("img").first()).toHaveAttribute("src", /\/500\/194\.png$/);
    await page.reload();
    expect(await theme(page)).toBe("light");
    await expect(page.locator("#theme-toggle")).toHaveAttribute("aria-label", "Switch to dark mode");
  });

  test.describe("on a light device", () => {
    test.use({ colorScheme: "light" });

    test("starts in light mode, before any script but the inline one runs", async ({ page }) => {
      await page.route("**/js/main.js", (route) => route.abort());  // prove the pre-paint snippet alone sets it
      await page.goto("/index.html");
      expect(await theme(page)).toBe("light");
    });

    test("a saved dark choice wins over the device", async ({ page }) => {
      await open(page, { storage: { theme: "dark" } });
      expect(await theme(page)).toBe("dark");
    });
  });
});

test.describe("?loud", () => {
  // Replace the Web Audio context with a fake that counts oscillators started.
  const fakeAudio = (page) => page.addInitScript(() => {
    window.started = 0;
    window.contexts = 0;
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = (extra) => ({ connect: (target) => target, ...extra });
    window.AudioContext = class {
      constructor() { window.contexts++; this.state = "suspended"; this.currentTime = 0; this.destination = node(); }
      resume() { this.state = "running"; return Promise.resolve(); }
      createGain() { return node({ gain: param() }); }
      createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
      createDynamicsCompressor() { return node({ threshold: param(), ratio: param() }); }
      createOscillator() { return node({ frequency: param(), start() { window.started++; }, stop() {} }); }
    };
  });

  test("a full-screen play button blocks the page until pressed", async ({ page }) => {
    await fakeAudio(page);
    await open(page, { query: "?loud" });
    await expect(page.locator("#loud-play")).toBeVisible();
    // The overlay sits on top of everything, so the rest of the page can't be clicked.
    const topElement = await page.evaluate(() => document.elementFromPoint(150, 300)?.closest("#loud-gate")?.id);
    expect(topElement).toBe("loud-gate");
    expect(await page.evaluate(() => window.started)).toBe(0);
  });

  test("pressing play removes the button and starts nonstop noise with no way to pause or stop", async ({ page }) => {
    await fakeAudio(page);
    await page.clock.install({ time: new Date("2026-10-03T20:00:00Z") });
    await open(page, { query: "?loud" });
    await page.locator("#loud-play").click();
    await expect(page.locator("#loud-gate")).toHaveCount(0);
    await page.clock.runFor(10_000);
    // Each noise lasts at most 1.5s, so 10 seconds holds at least 6 back to back.
    expect(await page.evaluate(() => window.started)).toBeGreaterThanOrEqual(6);
    await expect(page.getByRole("button", { name: /pause|stop|mute/i })).toHaveCount(0);
  });

  test("without ?loud, no audio is set up", async ({ page }) => {
    await fakeAudio(page);
    await open(page);
    await page.locator("header h1").click();
    expect(await page.evaluate(() => window.contexts)).toBe(0);
  });
});

test.describe("animations ignore the OS reduced-motion setting", () => {
  test.use({ reducedMotion: "reduce" });

  test("red-zone glow and Cignetti still animate", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    expect(await style(card(page, "cfb:1"), "animationName")).toBe("redzone-glow");
    await page.locator("#settings").click();
    await page.locator("#google-me").click();
    expect(await page.locator("#coach").evaluate((c) => c.getAnimations().length)).toBeGreaterThan(0);
  });
});

test.describe("desktop game list panel", () => {
  test("☰ slides the list out and back, the board widens, and the choice is remembered", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const aside = page.locator("aside");
    const boardX = async () => (await page.locator("#board").boundingBox()).x;
    expect(await boardX()).toBeGreaterThan(290);
    await page.locator("#panel-toggle").click();
    await expect(aside).toBeHidden();
    await expect.poll(boardX).toBeLessThan(5);
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(aside).toBeHidden();
    await page.locator("#panel-toggle").click();
    await expect(aside).toBeVisible();
    await expect.poll(boardX).toBeGreaterThan(290);
  });

  test("cards animate to their new sizes and positions when the list hides or shows", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1", "cfb:2", "cfb:7"] } });
    const third = card(page, "cfb:7");
    const before = await third.boundingBox();
    await page.locator("#panel-toggle").click();
    const moving = await page.locator(".card").evaluateAll((cards) =>
      cards.filter((c) => c.getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.transform?.includes("translate")))).length);
    expect(moving).toBe(3);
    await page.waitForTimeout(400);
    const after = await third.boundingBox();
    expect(after.y).toBeLessThan(before.y);  // third card moved up into the first row
  });

  test("the slide uses the same timing as the phone drawer", async ({ page }) => {
    await open(page);
    const desktop = await style(page.locator("aside"), "transition");
    expect(desktop).toContain("transform 0.25s");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await style(page.locator("#picker-body"), "transition")).toContain("transform 0.25s");
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("with no picks, the board says to tap the Games bar", async ({ page }) => {
    await open(page, { storage: { pickerOpen: false } });
    await expect(page.locator("#board .empty .mobile-only")).toHaveText("Tap ☰ Games at the top to pick a few games, and they'll show up here.");
    await expect(page.locator("#board .empty .desktop-only")).toBeHidden();
  });

  test("no horizontal scrolling and team names fit on cards", async ({ page }) => {
    await open(page, { storage: { selected: ALL_CFB, pickerOpen: false } });
    await expect(card(page, "cfb:1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const clipped = await page.locator(".card .name").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped).toBe(0);
  });

  test("picker is a drawer: opens by default with no picks, closes via ✕, backdrop, Done and Escape", async ({ page }) => {
    await open(page);
    const aside = page.locator("aside");
    await expect(aside).not.toHaveClass(/collapsed/);
    await page.locator("#picker-close").click();
    await expect(aside).toHaveClass(/collapsed/);
    await page.locator("#picker-toggle").click();
    await expect(aside).not.toHaveClass(/collapsed/);
    await page.locator("#picker-backdrop").click({ position: { x: 370, y: 400 } });
    await expect(aside).toHaveClass(/collapsed/);
    await page.locator("#picker-toggle").click();
    await page.locator("#picker-done").click();
    await expect(aside).toHaveClass(/collapsed/);
    await page.locator("#picker-toggle").click();
    await page.keyboard.press("Escape");
    await expect(aside).toHaveClass(/collapsed/);
  });

  test("the desktop ☰ button is hidden, and a saved hidden panel doesn't hide the phone layout", async ({ page }) => {
    await open(page, { storage: { panelCollapsed: true, pickerOpen: false } });
    await expect(page.locator("#panel-toggle")).toBeHidden();
    await expect(page.locator("#picker-toggle")).toBeVisible();
  });

  test("Games bar stays pinned to the top while scrolling", async ({ page }) => {
    await open(page, { storage: { selected: ALL_CFB, pickerOpen: false } });
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(async () => (await page.locator("#picker-toggle").boundingBox()).y).toBe(0);
  });

  test("tapping a selected game closes the drawer and highlights its card", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"], pickerOpen: true } });
    await row(page, "cfb:1").locator(".bug").click();
    await expect(page.locator("aside")).toHaveClass(/collapsed/);
    await expect(card(page, "cfb:1")).toHaveClass(/flash/);
    await expect(row(page, "cfb:1").locator("input")).toBeChecked();
  });

  test("tapping an unselected game adds it", async ({ page }) => {
    await open(page);
    await row(page, "cfb:2").locator(".bug").click();
    await expect(row(page, "cfb:2").locator("input")).toBeChecked();
    await expect(card(page, "cfb:2")).toBeAttached();
  });

  test("✕ on cards is always visible on touch screens", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"], pickerOpen: false } });
    test.skip(await page.evaluate(() => matchMedia("(hover: hover)").matches), "emulated device reports hover");
    expect(await style(card(page, "cfb:1").locator(".remove"), "opacity")).toBe("1");
  });
});

test.describe("NFL", () => {
  test("NFL games list and render", async ({ page }) => {
    await open(page, { storage: { tab: "nfl", selected: ["nfl:101"] } });
    await expect(page.locator("#list .group-label")).toHaveText([/Selected\s*1/, /Upcoming\s*1/]);
    await expect(card(page, "nfl:101").locator(".dd")).toHaveText("1st & 10 at NE 40");
  });
});
