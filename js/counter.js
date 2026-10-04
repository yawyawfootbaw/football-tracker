// Hidden visit counter: each page load adds one hit.
// Stats: https://hits.sh/yawyawfootbaw.github.io/football-tracker/ (opening the .svg directly adds a hit).

export function countVisit() {
  new Image().src = "https://hits.sh/yawyawfootbaw.github.io/football-tracker.svg";
}
