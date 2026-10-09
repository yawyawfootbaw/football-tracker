// The admin's extra controls, served only to a logged-in admin by the Worker (worker/index.js) and loaded by
// js/admin.js. It runs from a blob: URL, so it can't import the app's modules; install() is handed what it needs.
//
// - A share button on live cards, which links to ?game=league:id (js/config.js's LINKED_GAMES).
// - "Save as image" beside the Upcoming heading: the picked upcoming games as a PNG for posting on a forum, grouped by
//   day, one row each (kickoff time, away @ home with logos, ranks and records, network), in the current theme.
// - "Save board as image" in the gear menu: a PNG of the cards exactly as they look right now.

let app;  // { renderBoard, allGames, currentTheme } from js/admin.js

/** Returns the hooks for js/board.js's setAdmin. */
export function install(appApi) {
  app = appApi;
  addBoardShot();
  return {
    cardExtras: (g) => (g.state === "in" ? shareButton(g) : ""),
    sectionExtras: (st) => (st === "pre" ? posterButton() : ""),
    onBoardClick(e) {
      const shareKey = e.target.closest("[data-share]")?.dataset.share;
      const game = shareKey && app.allGames().find((g) => g.key === shareKey);
      if (game) { share(game); return true; }
      const section = e.target.closest("[data-poster]")?.closest(".board-group");
      if (!section) return false;
      const keys = [...section.querySelectorAll(".card")].map((c) => c.dataset.key);
      savePoster(keys.map((k) => app.allGames().find((g) => g.key === k)).filter(Boolean));
      return true;
    },
  };
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

const W = 640, PAD = 24, ROW = 44, DAY_HEAD = 34, TITLE = 52, FOOT = 34, SCALE = 2;
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

// The whole board, including any part scrolled out of view, on the page's background.
async function saveBoard() {
  const board = document.getElementById("board");
  if (!board.querySelector(".card")) return;
  const { toBlob } = await import(HTML_TO_IMAGE);
  const width = board.clientWidth, height = board.scrollHeight;
  const blob = await toBlob(board, {
    width, height, pixelRatio: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    style: { width: `${width}px`, height: `${height}px`, overflow: "visible" },
    filter: (node) => !LEFT_OUT.some((c) => node.classList?.contains(c)),
  });
  await deliver(blob, "game-tracker.png");
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
  const height = PAD + TITLE + days.reduce((h, d) => h + DAY_HEAD + d.games.length * ROW, 0) + FOOT + PAD / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const [logos] = await Promise.all([loadLogos(games), document.fonts.load(`700 28px "Barlow Condensed"`)]);

  ctx.fillStyle = color("--bg");
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "middle";

  // Title, in the header's wordmark font, over yard-line hash marks.
  let y = PAD;
  ctx.fillStyle = color("--text");
  ctx.font = `700 28px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText("UPCOMING GAMES", PAD, y + 14);
  ctx.fillStyle = color("--muted");
  for (let x = PAD; x < W - PAD; x += 6) ctx.fillRect(x, y + 32, 1, 4);
  y += TITLE;

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
  ctx.textAlign = "right";
  ctx.fillText(`${location.host}${location.pathname.replace(/index\.html$/, "")}`, W - PAD, y + FOOT / 2);

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
