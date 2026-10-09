// The admin's extra controls, served only to a logged-in admin by the Worker (worker/index.js) and loaded by
// js/admin.js. It runs from a blob: URL, so it can't import the app's modules; install() is handed what it needs.
//
// - A share button on live cards, which links to ?game=league:id (js/config.js's LINKED_GAMES).
// - "Save as image" beside each section heading. Live and Final save the section's cards as they look right now.
//   Upcoming saves a list made for posting on a forum: grouped by day, one row per game (kickoff time, away @ home
//   with logos, ranks and records, network).
// - "Save board as image" in the gear menu: the whole board as it looks right now.
// - In the game list, a row of bulk buttons atop each section: Live, Upcoming and Final get "Select all" (every game
//   the section shows) and "Remove all" (that state's picked games, which sit under Selected); Selected gets
//   "Remove all" (every picked game in the current tab and filters).
// Every image is in the current theme and carries a small, muted Game Tracker logo in the bottom-right corner.

let app;  // { renderBoard, renderList, listView, allGames, state, saveSelected, currentTheme } from js/admin.js

/** Returns the hooks for js/board.js's setAdmin. */
export function install(appApi) {
  app = appApi;
  addBoardShot();
  return {
    groupExtras,
    onListClick(e) {
      const button = e.target.closest("[data-bulk]");
      if (!button) return false;
      const add = button.dataset.bulk === "add";
      bulkGames(button.dataset.group, add).forEach((g) => (add ? app.state.selected.add(g.key) : app.state.selected.delete(g.key)));
      app.saveSelected();
      app.renderList();
      app.renderBoard();
      return true;
    },
    cardExtras: (g) => (g.state === "in" ? shareButton(g) : ""),
    sectionExtras: () => posterButton(),
    onBoardClick(e) {
      const shareKey = e.target.closest("[data-share]")?.dataset.share;
      const game = shareKey && app.allGames().find((g) => g.key === shareKey);
      if (game) { share(game); return true; }
      const section = e.target.closest("[data-poster]")?.closest(".board-group");
      if (!section) return false;
      if (section.dataset.section !== "pre") { saveSection(section); return true; }
      const keys = [...section.querySelectorAll(".card")].map((c) => c.dataset.key);
      savePoster(keys.map((k) => app.allGames().find((g) => g.key === k)).filter(Boolean));
      return true;
    },
  };
}

const STATE_OF = { Live: "in", Upcoming: "pre", Final: "post" };

// The bulk buttons atop one game-list section. A state's "Remove all" only shows while some of its games are picked
// (they sit under Selected).
function groupExtras(group) {
  const button = (action, label) => `<button type="button" data-bulk="${action}" data-group="${group}">${label}</button>`;
  if (group === "Selected") return `<div class="group-actions">${button("remove", "Remove all")}</div>`;
  return `<div class="group-actions">${button("add", "Select all")}${bulkGames(group, false).length ? button("remove", "Remove all") : ""}</div>`;
}

// The games a bulk button acts on, worked out from the games as they are now rather than when the list was drawn
// (it redraws only every LIST_REFRESH_MS, and a game can kick off or end in between). Within the current tab and
// filters: unpicked games of the section's state to add, picked ones to remove; Selected removes every picked game.
function bulkGames(group, add) {
  return app.listView().filter((g) => (group === "Selected" || g.state === STATE_OF[group]) && app.state.selected.has(g.key) !== add);
}

let copied = null;  // { key, at }: the card whose share link was just copied, shown as a ✓ for a moment
const COPIED_MS = 1500;
// Box with an arrow out of it, the usual share glyph.
const SHARE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 12v8h14v-8"/></svg>`;

function shareButton(g) {
  const done = copied?.key === g.key && Date.now() - copied.at < COPIED_MS;
  const label = done ? "Link copied" : "Share this game";
  return `<button class="share ${done ? "done" : ""}" data-share="${g.key}" aria-label="${label}" title="${label}">${done ? "✓" : SHARE_ICON}</button>`;
}

/** A link to the site that picks this game on arrival. */
function gameLink(key) {
  return `${location.origin}${location.pathname}?game=${key}`;
}

// Touch screens open the phone's share sheet; with a mouse, or where there's no share sheet, the link is copied.
async function share(g) {
  const url = gameLink(g.key), title = `${g.away.abbr} @ ${g.home.abbr}`;
  if (navigator.share && matchMedia("(hover: none)").matches) {
    try { await navigator.share({ title, url }); } catch {}  // closing the sheet without sharing throws; nothing to do
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    prompt("Copy this link:", url);  // no clipboard access (e.g. not https)
    return;
  }
  copied = { key: g.key, at: Date.now() };
  app.renderBoard();
  setTimeout(app.renderBoard, COPIED_MS);
}

function posterButton() {
  return `<button class="poster" data-poster title="Save these games as an image">Save as image</button>`;
}

const W = 640, PAD = 24, ROW = 44, DAY_HEAD = 34, FOOT = 34, SCALE = 2;
const TIME_W = 78, NET_W = 120, LOGO = 24;
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

// Gear menu item. Lined up with "google me", whose ✓ column it shares.
function addBoardShot() {
  const menu = document.getElementById("settings-menu");
  if (!menu || document.getElementById("save-board")) return;
  const button = document.createElement("button");
  button.id = "save-board";
  button.innerHTML = `<span class="check"></span>Save board as image`;
  button.addEventListener("click", saveBoard);
  menu.append(button);
}

// Turns DOM into an image by drawing a copy of it, styles, fonts and logos inlined; loaded only when first used.
const HTML_TO_IMAGE = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/+esm";
// Card controls that would only clutter the picture.
const LEFT_OUT = ["remove", "share", "poster", "last-full"];

const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The board already has room around its cards (css/board.css: 16px, and 32px below, where the logo goes).
async function saveBoard() {
  const board = document.getElementById("board");
  if (!board.querySelector(".card")) return;
  await deliver(await snapshot(board, 0, 0), "game-tracker.png");
}

// A section has no padding of its own, so give it the board's: 16px around, plus 16px more below for the logo.
// It's cut off after its last card, so a lone card doesn't sit beside a wide empty space.
async function saveSection(section) {
  const left = section.getBoundingClientRect().left;
  const right = Math.max(...[...section.querySelectorAll(".card")].map((c) => c.getBoundingClientRect().right));
  const name = `game-tracker-${section.dataset.section === "in" ? "live" : "final"}.png`;
  await deliver(await snapshot(section, 16, 16, Math.ceil(right - left)), name);
}

/**
 * Part of the page as it looks right now, including anything scrolled out of view, on the page's background.
 * @param pad  space added on every side; @param foot  extra space added below. The logo sits 16px from the bottom.
 * @param width  how much of the node's width to keep, from its left edge; the node itself keeps its layout.
 */
async function snapshot(node, pad, foot, width = node.clientWidth) {
  const { toCanvas } = await import(HTML_TO_IMAGE);
  const height = node.scrollHeight, bg = cssColor("--bg");
  const shot = await toCanvas(node, {
    width, height, pixelRatio: SCALE, backgroundColor: bg,
    style: { width: `${node.clientWidth}px`, height: `${height}px`, overflow: "visible", margin: "0" },
    filter: (el) => !LEFT_OUT.some((c) => el.classList?.contains(c)),
  });
  const w = width + 2 * pad, h = height + 2 * pad + foot;
  const canvas = document.createElement("canvas");
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(shot, pad * SCALE, pad * SCALE);
  ctx.scale(SCALE, SCALE);
  await drawMark(ctx, w - 16, h - 16);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// The logo on every image: the header's football and GAME TRACKER in its wordmark font, small and muted,
// right-aligned on (right, mid).
async function drawMark(ctx, right, mid) {
  const [ball] = await Promise.all([loadImage("images/favicon.svg"), document.fonts.load(`700 13px "Barlow Condensed"`)]);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = cssColor("--muted");
  ctx.font = `700 13px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("GAME TRACKER", right, mid + 1);
  const text = ctx.measureText("GAME TRACKER").width;
  if (ball) ctx.drawImage(ball, right - text - 20, mid - 8, 16, 16);
  ctx.restore();
}

async function savePoster(games) {
  if (!games.length) return;
  await deliver(await drawPoster(games), "upcoming-games.png");
}

// The share sheet on touch screens (so it can go to Photos or straight into a post), a download otherwise.
async function deliver(blob, name) {
  const file = new File([blob], name, { type: "image/png" });
  if (matchMedia("(hover: none)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch {}  // closing the sheet without sharing throws
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function drawPoster(games) {
  const days = groupByDay(games);
  const height = PAD + days.reduce((h, d) => h + DAY_HEAD + d.games.length * ROW, 0) + FOOT + PAD / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  const color = cssColor;
  const logos = await loadLogos(games);

  ctx.fillStyle = color("--bg");
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "middle";

  let y = PAD;

  for (const day of days) {
    ctx.fillStyle = color("--muted");
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(day.label.toUpperCase(), PAD, y + DAY_HEAD / 2 + 2);
    y += DAY_HEAD;
    day.games.forEach((g, i) => {
      ctx.fillStyle = color(i % 2 ? "--bg" : "--card");
      roundRect(ctx, PAD - 8, y + 2, W - 2 * PAD + 16, ROW - 4, 6);
      drawRow(ctx, g, y + ROW / 2, logos, color);
      y += ROW;
    });
  }

  ctx.fillStyle = color("--muted");
  ctx.font = `12px ${FONT}`;
  ctx.fillText(`All times ${zoneName(games[0].date)}`, PAD, y + FOOT / 2);
  await drawMark(ctx, W - PAD, y + FOOT / 2);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function drawRow(ctx, g, mid, logos, color) {
  ctx.textAlign = "left";
  ctx.fillStyle = color("--text");
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(g.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), PAD, mid);

  if (g.network) {
    ctx.textAlign = "right";
    ctx.fillStyle = color("--muted");
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(fit(ctx, g.network, NET_W), W - PAD, mid);
    ctx.textAlign = "left";
  }

  // Away @ home. Records drop out if the matchup doesn't fit, then names are cut short.
  const left = PAD + TIME_W, room = W - PAD - NET_W - 12 - left;
  const sides = [g.away, g.home];
  const withRecords = sides.every((t) => !t.record) || matchupWidth(ctx, sides, true) <= room;
  const nameRoom = (room - matchupWidth(ctx, sides, withRecords) + sides.reduce((w, t) => w + nameWidth(ctx, t), 0)) / 2;
  let x = left;
  sides.forEach((t, i) => {
    if (i === 1) {
      ctx.fillStyle = color("--muted");
      ctx.font = `14px ${FONT}`;
      ctx.fillText("@", x, mid);
      x += ctx.measureText("@ ").width + 6;
    }
    const logo = logos.get(t.logo);
    if (logo) ctx.drawImage(logo, x, mid - LOGO / 2, LOGO, LOGO);
    x += LOGO + 6;
    if (rank(t)) {
      ctx.fillStyle = color("--muted");
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(rank(t), x, mid + 1);
      x += ctx.measureText(rank(t)).width + 3;
    }
    ctx.fillStyle = color("--text");
    ctx.font = `600 14px ${FONT}`;
    const name = fit(ctx, t.name ?? t.abbr, Math.min(nameWidth(ctx, t), nameRoom));
    ctx.fillText(name, x, mid);
    x += ctx.measureText(name).width;
    if (withRecords && t.record) {
      ctx.fillStyle = color("--muted");
      ctx.font = `12px ${FONT}`;
      ctx.fillText(` (${t.record})`, x, mid + 1);
      x += ctx.measureText(` (${t.record})`).width;
    }
    x += 10;
  });
}

const rank = (t) => (t.rank && t.rank <= 25 ? String(t.rank) : "");

function nameWidth(ctx, t) {
  ctx.font = `600 14px ${FONT}`;
  return ctx.measureText(t.name ?? t.abbr).width;
}

// Width of the whole "logo rank Name (rec) @ logo rank Name (rec)" run, matching drawRow's spacing.
function matchupWidth(ctx, sides, withRecords) {
  let w = 0;
  ctx.font = `14px ${FONT}`;
  w += ctx.measureText("@ ").width + 6;
  for (const t of sides) {
    w += LOGO + 6 + nameWidth(ctx, t) + 10;
    ctx.font = `600 11px ${FONT}`;
    if (rank(t)) w += ctx.measureText(rank(t)).width + 3;
    ctx.font = `12px ${FONT}`;
    if (withRecords && t.record) w += ctx.measureText(` (${t.record})`).width;
  }
  return w;
}

// Cut text down with an ellipsis until it fits. Uses the context's current font.
function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > width) text = text.slice(0, -1);
  return text.trimEnd() + "…";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function groupByDay(games) {
  const days = [];
  for (const g of games) {
    const label = g.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    if (days.at(-1)?.label !== label) days.push({ label, games: [] });
    days.at(-1).games.push(g);
  }
  return days;
}

// The viewer's time zone as a short name, e.g. "EDT", for the footer. Kickoff times are drawn in that zone.
function zoneName(date) {
  return new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "local time";
}

// Logos have to come from ESPN with CORS, or the canvas can't be exported. Same dark-variant rule as js/format.js.
// A logo that won't load is left out rather than holding up the image.
async function loadLogos(games) {
  const urls = [...new Set(games.flatMap((g) => [g.away.logo, g.home.logo]).filter(Boolean))];
  const dark = app.currentTheme() !== "light";
  const entries = await Promise.all(urls.map(async (url) =>
    [url, (dark && await loadImage(url.replace("/500/", "/500-dark/"))) || await loadImage(url)]));
  return new Map(entries);
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
