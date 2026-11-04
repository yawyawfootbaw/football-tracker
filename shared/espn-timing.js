/*
 * How long to wait on ESPN, and how far to trust it. ESPN's API is fast but uneven: a score is listed the moment it's
 * called, before review; a touchdown's try shows up in the touchdown's text a while later, or never; the scoreboard
 * and the play-by-play update separately, so one can run ahead of the other; and a game only polled now and then
 * (the program fetches drives and plays only for belled games) comes back with a backlog. These limits decide when
 * something from ESPN is still news, and when it's too old or too doubtful to send.
 *
 * Used by shared/alerts.js (notifications) and shared/espn.js (the scoreboard's clock).
 */

// After a touchdown is sent without its PAT (here, either an extra point or a 2-point try), a PAT result ESPN posts
// later than this is old news and isn't sent.
export const PAT_RESULT_STALE_MS = 4 * 60_000;

// If we haven't checked a game's drives and plays for this long, the new ones we find may be old, so we don't send
// them. This happens when someone turns on a bell mid-game, or when checking pauses.
export const DRIVES_STALE_MS = 60_000;

// How long after a score or turnover is sent to keep checking that ESPN still lists it. One that disappears within
// this window was called back (a penalty, a review), and gets a notification saying so.
export const CALLED_BACK_MS = 10 * 60_000;

// The scoreboard's clock may run ahead of the play-by-play by this much before the play-by-play wins: ESPN's
// timestamps and real time never agree exactly.
export const CLOCK_SLACK_MS = 60_000;
