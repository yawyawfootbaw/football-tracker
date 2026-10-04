# Game Tracker

Live college football and NFL games at a glance: pick the games you care about and each gets a card with the
score, clock, down and distance, a mini field showing the ball and line to gain, the last play, and the network.

Live: https://yawyawfootbaw.github.io/football-tracker/

## Run, test, deploy

| | |
|---|---|
| Run locally | `npm start`, then open http://localhost:4173. The app uses ES modules, which browsers won't load from `file://`, so open it through the server. |
| Test | `npm install` once, then `npm test`. Playwright runs headless in your installed Google Chrome. |
| Deploy | Push to `main`. GitHub Pages serves the repo root as-is; there is no build step. |

CI (`.github/workflows/test.yml`) runs the test suite on every push and pull request.

## How it's organized

No framework and no build: one HTML page, plain CSS, and native JavaScript modules.

```
index.html            page markup; loads the CSS and js/main.js
css/
  base.css            color tokens, page layout, spinner
  picker.css          game picker: tabs, filters, sections, score-bug rows
  board.css           game cards, field, last play, remove button
  corner.css          contact footer, settings gear, coach photo
  mobile.css          phone layout (≤700px): slide-in picker drawer, tighter cards
js/
  main.js             entry point: wires modules together and polls ESPN every 10s
  config.js           API URLs, timings, ?demo flag
  store.js            localStorage wrapper that never throws
  state.js            state shared by picker and board (games, picks, tab, filters, …)
  espn.js             fetches ESPN's scoreboard and normalizes each game
  picker.js           the game list: rendering, filters, sections, selection
  board.js            the cards: rendering, red-zone glow, highlight, last-play popover
  field.js            the SVG field on each card
  format.js           small shared HTML helpers (logos, status lines, escaping)
  drawer.js           hiding/showing the picker: desktop side panel, phone drawer
  settings.js         settings gear and "google me"
  counter.js          hidden visit counter
images/               coach photos for "google me", favicon, link-preview image
scripts/
  share-images.js     regenerates the link-preview image and touch icon
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
- **Finished games** stay listed until ESPN's football week rolls over. ESPN's calendar data puts that at
  early Monday for college and early Wednesday for NFL, Eastern time.
