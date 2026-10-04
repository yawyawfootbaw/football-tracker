// @ts-check
const { test, expect } = require("@playwright/test");
const { LONG_PLAY, cfbGames, nflGames, scoreboard, PNG } = require("./fixtures");

const CORS = { "access-control-allow-origin": "*" };

/**
 * Stub every outside service, optionally seed localStorage, and open the app.
 * Returns a mutable state object: change state.cfb / state.nfl to alter what the next poll sees.
 */
async function open(page, opts = {}) {
  const state = { cfb: opts.cfb ?? cfbGames(), nfl: opts.nfl ?? nflGames(), hits: 0, gate: opts.gate };
  await page.route("https://site.api.espn.com/**", async (route) => {
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

  test("College tab comes first and is the default", async ({ page }) => {
    await open(page);
    await expect(page.locator(".tabs button")).toHaveText(["College", "NFL"]);
    await expect(page.locator('.tabs button[data-league="cfb"]')).toHaveClass(/on/);
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

  test("rows read like a score bug: both teams, scores, status, loser greyed out", async ({ page }) => {
    await open(page);
    const final = row(page, "cfb:7");
    await expect(final.locator(".bug-team")).toHaveCount(2);
    await expect(final.locator(".bug-team").nth(0)).toContainText("ALA");
    await expect(final.locator(".bug-team").nth(0)).toContainText("56");
    await expect(final.locator(".bug-team").nth(1)).toHaveClass(/lost/);
    await expect(final.locator(".bug-status")).toContainText("Final");
    await expect(row(page, "cfb:1").locator(".rank").first()).toHaveText("5");
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

test.describe("search and filters", () => {
  test("search matches abbreviations from the start of a word", async ({ page }) => {
    await open(page);
    await page.fill("#search", "nd");
    // ND and NDSU, but not Maryland.
    await expect(page.locator("#list label.game")).toHaveCount(2);
    await expect(row(page, "cfb:8")).toBeAttached();
    await expect(row(page, "cfb:3")).toBeAttached();
    await expect(row(page, "cfb:6")).toHaveCount(0);
  });

  test("search matches full school names and mascots, and says when nothing matches", async ({ page }) => {
    await open(page);
    await page.fill("#search", "notre dame");
    await expect(page.locator("#list label.game")).toHaveCount(1);
    await page.fill("#search", "fighting irish");
    await expect(row(page, "cfb:8")).toBeAttached();
    await page.fill("#search", "zzz");
    await expect(page.locator("#list .empty")).toHaveText("No matching games.");
  });

  test("filter controls hide behind the funnel and only exist on the College tab", async ({ page }) => {
    await open(page);
    const panel = page.locator("#filters");
    await expect(panel).not.toHaveClass(/open/);
    await page.locator("#filter-toggle").click();
    await expect(panel).toHaveClass(/open/);
    await expect(page.locator("#conf")).toBeVisible();
    await page.locator("#filter-toggle").click();
    await expect(panel).not.toHaveClass(/open/);
    await page.locator('.tabs button[data-league="nfl"]').click();
    await expect(page.locator("#filter-toggle")).toBeHidden();
  });

  test("conference filter lists named conferences, filters games, and clears with one click", async ({ page }) => {
    await open(page);
    await page.locator("#filter-toggle").click();
    const options = await page.locator("#conf option").allTextContents();
    expect(options).toEqual(["All conferences", "Big 12", "Big Ten", "Independent", "SEC"]);
    await page.selectOption("#conf", { label: "SEC" });
    await expect(page.locator("#list label.game")).toHaveCount(2);  // VAN @ UGA, ALA @ MSST
    await expect(page.locator("#filter-toggle")).toHaveClass(/has-filters/);
    await page.locator("#conf-clear").click();
    await expect(page.locator("#list label.game")).toHaveCount(8);
    await expect(page.locator("#conf-clear")).toBeHidden();
  });

  test("dropdown arrow sits well inside the right edge", async ({ page }) => {
    await open(page);
    await page.locator("#filter-toggle").click();
    expect(await style(page.locator("#conf"), "backgroundPosition")).toContain("12px");
  });

  test("Top 25 shows only games with a ranked team and is remembered", async ({ page }) => {
    await open(page);
    await page.locator("#filter-toggle").click();
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
    await page.evaluate(() => renderBoard());
    await expect(c).not.toHaveClass(/glow/);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(c).toHaveClass(/glow/);
  });

  test("possession falls back to the last play after a kickoff, but not after a timeout", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:2", "cfb:3"] } });
    await expect(card(page, "cfb:2").locator(".team.away .poss")).not.toHaveClass(/hide/);  // CAL
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
  });

  test("✕ appears on hover, removes the card and unchecks the row", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"] } });
    const remove = card(page, "cfb:1").locator(".remove");
    expect(await style(remove, "opacity")).toBe("0");
    await card(page, "cfb:1").hover();
    await expect.poll(() => style(remove, "opacity")).toBe("1");
    expect(await style(remove, "backgroundColor")).toBe("rgb(154, 160, 166)");  // grey
    expect(await style(remove, "color")).toBe("rgb(0, 0, 0)");                 // black ✕
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

test.describe("board view switch", () => {
  const seeded = { storage: { selected: ["cfb:1", "cfb:8", "nfl:101"] } };
  const view = (page, name) => page.locator(`.board-bar button[data-view="${name}"]`);

  test("All shows every pick, with counts per view", async ({ page }) => {
    await open(page, seeded);
    await expect(page.locator(".board-bar button")).toHaveText([/All\s*3/, /College\s*2/, /NFL\s*1/]);
    await expect(view(page, "all")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".card")).toHaveCount(3);
  });

  test("College and NFL show only that league, and the choice is remembered", async ({ page }) => {
    await open(page, seeded);
    await view(page, "cfb").click();
    await expect(page.locator(".card")).toHaveCount(2);
    await expect(card(page, "nfl:101")).toHaveCount(0);
    await view(page, "nfl").click();
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(card(page, "nfl:101")).toBeVisible();
    await page.reload();
    await expect(view(page, "nfl")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".card")).toHaveCount(1);
  });

  test("an empty view says so; with no picks at all there's no switch", async ({ page }) => {
    await open(page, { storage: { selected: ["cfb:1"], boardView: "nfl" } });
    await expect(page.locator("#board .empty")).toHaveText("No NFL games selected.");
    await view(page, "cfb").click();
    await card(page, "cfb:1").hover();
    await card(page, "cfb:1").locator(".remove").click();
    await expect(page.locator(".board-bar")).toHaveCount(0);
    await expect(page.locator("#board .empty")).toHaveText("Pick games from the list.");
  });
});

test.describe("demo mode and counter", () => {
  test("?demo adds both demo games, skips the hit counter, and demo cards can be removed", async ({ page }) => {
    const state = await open(page, { query: "?demo" });
    await expect(card(page, "nfl:demo")).toHaveClass(/redzone/);
    await expect(card(page, "cfb:demo-logos")).toContainText("MSST");
    await expect(row(page, "cfb:demo-logos")).toBeAttached();
    await card(page, "cfb:demo-logos").hover();
    await card(page, "cfb:demo-logos").locator(".remove").click();
    await expect(card(page, "cfb:demo-logos")).toHaveCount(0);
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
    expect(await showCoach(page)).toBe("cignetti.png");
  });

  test("Pelini on rolls under 0.1", async ({ page }) => {
    await stubRandom(page, 0.09);
    await open(page);
    expect(await showCoach(page)).toBe("pelini.png");
  });

  test("always Pelini with ?demo", async ({ page }) => {
    await stubRandom(page, 0.5);
    await open(page, { query: "?demo" });
    expect(await showCoach(page)).toBe("pelini.png");
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

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

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
