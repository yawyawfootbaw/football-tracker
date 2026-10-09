# Game Tracker

Live college football and NFL games at a glance: pick the games you care about and each gets a card with the
score, clock, down and distance, a mini field showing the ball and line to gain, the last play, and the network.

Live: https://yawyawfootbaw.github.io/football-tracker/

## Run, test, deploy

| | |
|---|---|
| Run locally | `npm start`, then open http://localhost:4173. The app uses ES modules, which browsers won't load from `file://`, so open it through the server. |
| Game links | For the admin, each live card's share button opens the phone's share sheet, or copies the link with a mouse. The link is `?game=cfb:401234567` (the game's `league:eventId`; repeat it or comma-separate keys for several). Opening it adds the game to the viewer's own picks and flashes its card, then drops the parameter from the address bar. |
| Admin | Open the site with `?admin` and enter the admin password. The Worker trades it for a login token that lasts 30 days; only the token is kept in the browser, never the password, and while it works `?admin` skips the password. `?admin=off` logs out, and changing the password (`npx wrangler secret put ADMIN_PASSWORD`) logs out every browser. Opened with `?admin`, the page also picks two made-up demo games (not saved): one already live (Texas in the red zone, clock running), and one that's upcoming and goes live 10 seconds later, so you can watch its card move from Upcoming to Live. `?admin` stays in the address bar, so a refresh keeps them. The admin isn't counted by the visit counter and gets share buttons on live cards and **Save as image** beside each section heading. Live and Final save that section's cards as they look; Upcoming saves a list made for forums (grouped by day, kickoff times in your time zone, logos, ranks, records and networks). In the game list, each section gets **Select all** and **Remove all**, and Selected gets **Remove all** for every pick in the current tab and filters. The gear menu also gets **Save board as image**, the whole board as it looks right now. Card buttons are left out, every image carries a small Game Tracker logo in the corner, and a phone opens the share sheet while a computer downloads the PNG. That code isn't in the public site: a Cloudflare Worker (`worker/`) hands it out only to the right password. |
| Loading spinner | Add `?loading` to the URL. The page never fetches games, so both loading spinners stay up. It also skips the visit counter. |
| Test | `npm install` once, then `npm test`. Playwright runs headless in your installed Google Chrome. `npm run test:worker` tests the admin Worker. |
| Deploy | Push to `main`. GitHub Pages serves the repo root as-is; there is no build step. |
| Deploy the admin Worker | Once: `cd worker && npx wrangler login && npx wrangler secret put ADMIN_PASSWORD` (a long random password), then put the Worker's URL in `ADMIN_URL` (js/config.js). After that, pushing a change under `worker/` to `main` redeploys it (`.github/workflows/worker.yml`, using the repo secret `CLOUDFLARE_API_TOKEN`); `cd worker && npx wrangler deploy` still works by hand. |

CI (`.github/workflows/test.yml`) runs the test suite on every push and pull request.

## How it's organized

No framework and no build: one HTML page, plain CSS, and native JavaScript modules.

```
index.html            page markup; loads the CSS and js/main.js
css/
  base.css            color tokens, page layout, spinner
  picker.css          game picker: tabs, filters, sections, score-bug rows
  board.css           board sections, game cards, field, last play, remove button
  corner.css          contact footer, settings gear, coach photo
  mobile.css          phone layout (≤700px): slide-in picker drawer, tighter cards
js/
  main.js             entry point: wires modules together and polls ESPN every 10s
  config.js           API URLs, timings, ?admin (login), ADMIN_URL, ?loading, ?league and ?game parameters
  demo.js             ?admin's made-up demo games: one already live, one that kicks off 10 seconds after the page opens
  store.js            localStorage wrapper that never throws
  state.js            state shared by picker and board (games, picks, tab, filters, …)
  espn.js             fetches ESPN's scoreboard and normalizes each game
  picker.js           the game list: rendering, filters, sections, selection
  board.js            the cards: Live/Final/Upcoming sections, red-zone glow, highlight, last-play popover, hooks for the admin's controls
  admin.js            admin login: trades the password for a token, then fetches the admin code with it
  recap.js            checks finished games for ESPN's written recap
  field.js            the SVG field on each card
  format.js           small shared HTML helpers (logos, status lines, escaping)
  drawer.js           hiding/showing the picker: desktop side panel, phone drawer
  settings.js         settings gear and "google me"
  theme.js            light/dark theme and its header switch
  logo.js             the football beside the title, which spirals once when clicked
  counter.js          hidden visit counter
fonts/                Barlow Condensed Bold for the wordmark (self-hosted, SIL Open Font License in OFL.txt)
images/               coach photos for "google me", favicon, link-preview image
scripts/
  share-images.js     regenerates the link-preview image and touch icon
worker/               Cloudflare Worker that logs the admin in and serves the admin code only to a valid token
  admin.js            the admin's features: share buttons, image exports, bulk select (never served to regular visitors)
  handler.js          login, signed 30-day tokens and CORS; index.js is the Worker entry, wrangler.toml its config
  handler.test.js     Node tests for handler.js
tests/
  app.spec.js         end-to-end tests, grouped by feature
  fixtures.js         fake ESPN data: one game per situation the app handles
```

`main.js` is the only module that sets up listeners, timers or network requests on load; the others export
functions. The picker and board
don't import each other: `main.js` passes each one the callbacks it needs.

## Data

- **Source:** ESPN's public but unofficial scoreboard API (`site.api.espn.com`). It needs no key and allows
  requests from any website. It's undocumented, so it could change without notice. Check ESPN's terms of use
  before any commercial use.
- **College** covers FBS games only (`groups=80`); FCS-only matchups aren't listed.
- **Recaps:** ESPN posts its written recap a while after a game ends, usually 5–50 minutes (one weekend's
  sample; a few took half a day). The app checks each picked final game's summary every 2 minutes for up to an
  hour and shows a Recap link once the story exists.
- **Finished games** stay listed until ESPN's football week rolls over. ESPN's calendar data puts that at
  early Monday for college and early Wednesday for NFL, Eastern time.
